"""End-to-end test with fake Google + fake Gemini (no network needed).

Run:  cd backend && python -m pytest -q   (or: python tests/test_flow.py)
"""
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["GEMINI_API_KEY"] = "test"
os.environ["GOOGLE_MAPS_API_KEY"] = "test"

from fastapi.testclient import TestClient  # noqa: E402

from app import main, planner  # noqa: E402
from app.models import LLMDiscovery, LLMIdea, LLMMissing  # noqa: E402
from app.providers import places  # noqa: E402
from app.providers.places import PlaceInfo  # noqa: E402

DAILY = lambda o, c: [{"open": {"day": d, "hour": o}, "close": {"day": d, "hour": c}} for d in range(7)]
NO_MONDAY = lambda o, c: [p for p in DAILY(o, c) if p["open"]["day"] != 1]

FAKE = {
    "Kinkaku-ji": (35.0394, 135.7292, DAILY(9, 17)),
    "Fushimi Inari Taisha": (34.9671, 135.7727, []),            # open 24h -> no periods: unknown
    "Kyoto National Museum": (34.9900, 135.7732, NO_MONDAY(9, 17)),  # closed Mondays
    "Nishiki Market": (35.0050, 135.7649, DAILY(10, 17)),
    "Kiyomizu-dera": (34.9949, 135.7850, DAILY(6, 18)),
    "Arashiyama Bamboo Grove": (35.0170, 135.6713, [{"open": {"day": 0, "hour": 0}}]),
    "Gion": (35.0037, 135.7788, []),
}
calls = []


async def fake_search(query, lat=None, lng=None, radius_m=30000, included_type=None,
                      min_rating=None, limit=5, food=False):
    calls.append(query)
    if included_type == "restaurant":
        return [PlaceInfo(place_id=f"r{i}-{round(lat,3)}", name=f"Veggie Place {i} near {round(lat,3)}",
                          lat=lat + 0.002 * i, lng=lng, rating=4.5 - 0.1 * i, rating_count=500,
                          periods=DAILY(11, 22), serves_vegetarian=(i == 1), business_status="OPERATIONAL")
                for i in range(3)]
    if included_type == "lodging":
        return [PlaceInfo(place_id=f"h{i}", name=f"Hotel {i}", lat=lat + 0.01 * i, lng=lng,
                          rating=4.2, rating_count=900) for i in range(3)]
    name = query.split(",")[0]
    if name in FAKE:
        la, ln, per = FAKE[name]
        return [PlaceInfo(place_id="p-" + name, name=name, lat=la, lng=ln, rating=4.6,
                          rating_count=12000, periods=per, hours_text=["Monday: Closed"] if per else [],
                          business_status="OPERATIONAL")]
    return []


def idea(name, group, area="Kyoto"):
    la, ln, _ = FAKE.get(name, (35.0, 135.7, []))
    return LLMIdea(name=name, group=group, area=area, category="museum" if "Museum" in name else "sight",
                   why="Fits you.", duration_min=90, est_cost_usd=5, indoor=False, needs_ticket=True,
                   lat=la, lng=ln)


async def fake_generate(prompt, schema):
    if schema is LLMDiscovery:
        return LLMDiscovery(destination_city="Kyoto", country="Japan", airport_code="KIX",
                            center_lat=35.0116, center_lng=135.7681, summary="Temples and food.",
                            tips=["Get an ICOCA card."],
                            ideas=[idea("Fushimi Inari Taisha", "video", "Fushimi"),
                                   idea("Kinkaku-ji", "landmark", "Kita"), idea("Kiyomizu-dera", "landmark", "Higashiyama"),
                                   idea("Kyoto National Museum", "landmark", "Higashiyama"),
                                   idea("Arashiyama Bamboo Grove", "gem", "Arashiyama"),
                                   idea("Totally Made Up Shrine", "gem")])
    if schema is LLMMissing:
        return LLMMissing(ideas=[idea("Gion", "gem", "Gion"), idea("Kinkaku-ji", "gem")])
    raise AssertionError(schema)


places.search_text = fake_search
planner.generate = fake_generate
import app.discovery as D  # noqa: E402
import app.engine as E  # noqa: E402
D.planner.generate = fake_generate
E.places.search_text = fake_search
c = TestClient(main.app)


def test_journey():
    prefs = {"destination": "", "inspiration": "TikTok: Fushimi Inari gates at sunrise",
             "start_date": "2026-11-09", "end_date": "2026-11-10",  # Mon, Tue
             "travelers": 2, "diet": "vegetarian", "allergies": "peanuts", "pace": "balanced"}
    assert c.get("/api/health").json()["places"] is True
    r = c.post("/api/discover", json=prefs).json()
    names = {x["name"]: x for x in r["candidates"]}
    assert r["destination"] == "Kyoto"
    assert names["Kinkaku-ji"]["verified"] and not names["Totally Made Up Shrine"]["verified"]
    sel = [x for x in r["candidates"] if x["name"] != "Totally Made Up Shrine"]
    m = c.post("/api/missing", json={"prefs": prefs, "destination": "Kyoto", "center_lat": 35.01,
                                      "center_lng": 135.76, "selected": sel}).json()
    assert [x["name"] for x in m] == ["Gion"], m
    sel[0]["priority"] = "must"
    it = c.post("/api/itinerary/build", json={"prefs": prefs, "destination": "Kyoto", "center_lat": 35.01,
                                               "center_lng": 135.76, "selected": sel + m}).json()
    for d in it["days"]:
        print(f"Day {d['day']} {d['date']} | {d['theme']}")
        for s in d["stops"]:
            print(f"   {s['start_time']}-{s['end_time']} {s['kind']:5} {'✓' if s['verified'] else '?'} {s['name']} "
                  f"| {s['hours_today']} | {s['warnings']}")
    print("unscheduled:", it["unscheduled"]); print("warnings:", it["warnings"])
    monday = it["days"][0]
    assert all(s["name"] != "Kyoto National Museum" for s in monday["stops"]), "museum must not be on Monday"
    meals = [s for d in it["days"] for s in d["stops"] if s["kind"] == "meal"]
    assert len(meals) == 4 and len({s["name"] for s in meals}) == 4
    assert any("vegetarian" in s["why"] for s in meals)
    # Edit: reverse day 1, remove one stop
    ids = [s["id"] for s in monday["stops"]][::-1][1:]
    e = c.post("/api/itinerary/day", json={"itinerary": it, "day_index": 0, "stop_ids": ids}).json()
    assert len(e["day"]["stops"]) + len(e["unscheduled"]) == len(ids)
    h = c.post("/api/hotels", json={"itinerary": it}).json()
    assert h and "Booking.com" in h[0]["links"]
    it2 = c.post("/api/itinerary/hotel", json={"itinerary": it, "hotel": h[0]}).json()
    assert it2["hotel"]["place"]["name"] == h[0]["place"]["name"]
    assert it2["days"][0]["stops"][0]["travel_min"] > 0, "first stop now has travel from hotel"
    print("google calls:", len(calls))


if __name__ == "__main__":
    test_journey()
    print("ALL OK")


# ---------- Social inspiration (fake Gemini) ----------
from app import social_ai  # noqa: E402
from app.models import LLMSeen, LLMSeenPlace, Source  # noqa: E402


async def fake_read_media(files, text):
    assert files and files[0][1].startswith("image/")
    return LLMSeen(summary="Temple vibes", places=[
        LLMSeenPlace(name="Fushimi Inari Taisha", city="Kyoto", country="Japan", evidence="Text says 'Fushimi Inari'", confidence="high"),
        LLMSeenPlace(name="Nishiki Market", city="Kyoto", country="Japan", evidence="Sign reads Nishiki", confidence="medium"),
        LLMSeenPlace(name="Some Blur", city="Kyoto", country="Japan", evidence="unclear", confidence="low")])


async def fake_social(prefs, city, country, skip):
    c = D._to_candidate(idea("Gion", "gem", "Gion"), "social")
    c.sources = [Source(title="Time Out Kyoto", uri="https://example.com/a")]
    return [c], c.sources, ""

social_ai.read_media = fake_read_media
social_ai.social_picks = fake_social


def test_social():
    r = c.post("/api/inspiration/media", files=[("files", ("a.png", b"\x89PNG....", "image/png"))],
               data={"text": "caption"}).json()
    assert [p["name"] for p in r["places"]] == ["Fushimi Inari Taisha", "Nishiki Market"], r
    prefs = {"destination": "", "start_date": "2026-11-09", "end_date": "2026-11-10", "video_places": r["places"]}
    d = c.post("/api/discover", json=prefs).json()
    vids = [x for x in d["candidates"] if x["group"] == "video"]
    assert {v["name"] for v in vids} == {"Fushimi Inari Taisha", "Nishiki Market"}, vids
    assert all(v["evidence"] for v in vids) and all(v["verified"] for v in vids)
    s = c.post("/api/social-picks", json={"prefs": prefs, "destination": "Kyoto", "center_lat": 35.01,
                                          "center_lng": 135.76, "skip": ["Kinkaku-ji"]}).json()
    assert s["candidates"][0]["sources"][0]["uri"] and s["candidates"][0]["verified"]
    print("social OK")


if __name__ == "__main__":
    test_social()
