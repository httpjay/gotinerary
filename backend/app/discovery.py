"""Discovery: AI suggests ideas, Google verifies them.

The AI is only used for *ideas and explanations*. Every idea is then looked
up with the places provider; only matched places get the "verified" badge,
and their name, location, rating and hours come from Google.
"""
import asyncio
import json
import re
import uuid
from difflib import SequenceMatcher

from . import planner
from .demo import DAYS, POOL
from .models import (Candidate, LLMDiscovery, LLMIdea, LLMMissing, TripPrefs)
from .providers import places
from .scheduling import haversine_km

GROUP_RULES = """
Groups:
- "video": places the traveler saw in the video or described (only if they gave inspiration; use the exact places they mention when possible).
- "landmark": famous must-see sights of the city.
- "gem": lesser-known places locals love, close to the other picks.
Rules for each idea:
- Must be a REAL, currently operating place in or near the city, with its common English name.
- area: the neighborhood name.
- category: one of sight, museum, park, shopping, nightlife, experience, cafe, food_spot (food markets, street food streets).
- why: ONE short sentence on why it fits THIS traveler. Do not invent ratings, prices, or social-media trends.
- duration_min: a realistic visit length. est_cost_usd: rough cost per person (0 if free).
- needs_ticket: true if entry usually needs a ticket or reservation.
- lat/lng: your best estimate (it will be checked).
"""


def _norm(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", s.lower())


def _similar(a: str, b: str) -> float:
    a, b = _norm(a), _norm(b)
    if not a or not b:
        return 0.0
    if a in b or b in a:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


def _to_candidate(idea: LLMIdea, group: str | None = None) -> Candidate:
    cat = idea.category if idea.category != "food" else "food_spot"
    return Candidate(id=uuid.uuid4().hex[:8], name=idea.name, group=group or idea.group,
                     area=idea.area, category=cat, why=idea.why, duration_min=idea.duration_min,
                     est_cost_usd=idea.est_cost_usd, indoor=idea.indoor, needs_ticket=idea.needs_ticket,
                     lat=idea.lat, lng=idea.lng)


async def verify(c: Candidate, city: str, center_lat: float, center_lng: float) -> Candidate:
    """Look the place up. Use Google's facts if the match looks right."""
    if not places.enabled():
        return c
    found = await places.search_text(f"{c.name}, {city}", center_lat, center_lng, radius_m=50000, limit=3)
    best = None
    for p in found:
        far = haversine_km(center_lat, center_lng, p.lat, p.lng)
        if far > 120 or p.business_status == "CLOSED_PERMANENTLY":
            continue
        score = _similar(c.name, p.name)
        if best is None or score > best[0]:
            best = (score, p)
    # The first result of a precise text search is usually right; require some name overlap.
    if best and (best[0] >= 0.45 or (best[1] is found[0] and best[0] >= 0.25)):
        p = best[1]
        return c.model_copy(update={
            "name": p.name, "lat": p.lat, "lng": p.lng, "verified": True, "place": p,
            "distance_km": round(haversine_km(center_lat, center_lng, p.lat, p.lng), 1),
        })
    return c


async def verify_all(cands: list[Candidate], city, lat, lng) -> list[Candidate]:
    sem = asyncio.Semaphore(6)

    async def one(c):
        async with sem:
            return await verify(c, city, lat, lng)
    out = await asyncio.gather(*(one(c) for c in cands))
    # Drop duplicates (two ideas that matched the same real place)
    seen, uniq = set(), []
    for c in out:
        key = c.place.place_id if c.place else _norm(c.name)
        if key in seen:
            continue
        seen.add(key)
        uniq.append(c)
    return uniq


async def discover(prefs: TripPrefs, days: int):
    if not planner.has_key():
        return _demo_discovery()
    per_group = max(4, min(8, days * 3))
    prompt = f"""You are an expert local travel planner helping a traveler turn inspiration into a real trip.
Destination they typed: {prefs.destination or "not given (work it out from the inspiration)"}
What they saw or want (from a video caption or their own words): {prefs.inspiration or "nothing extra"}
Trip length: {days} days starting {prefs.start_date}. Travelers: {prefs.travelers}. Budget level: {prefs.budget}.
Interests: {", ".join(prefs.interests) or "a good mix"}. Pace: {prefs.pace}.
Must-see requests: {prefs.must_see or "none"}. Accessibility needs: {prefs.accessibility or "none"}.

Choose ONE base city for the trip (destination_city), its country, and the main international airport code (airport_code, 3 letters).
center_lat / center_lng: the city center.
summary: 1 to 2 sentences about the trip idea.
tips: 3 short practical local tips.
Give about {per_group} ideas in each of the groups "landmark" and "gem", and every place from the inspiration in "video" (empty if none).
Include the must-see requests as ideas.
{GROUP_RULES}"""
    raw: LLMDiscovery = await planner.generate(prompt, LLMDiscovery)
    cands = [_to_candidate(i) for i in raw.ideas if i.group in ("video", "landmark", "gem")]
    cands = await verify_all(cands, raw.destination_city, raw.center_lat, raw.center_lng)
    return raw, cands


async def missing(prefs: TripPrefs, city: str, lat: float, lng: float,
                  selected: list[Candidate], rejected: list[str]) -> list[Candidate]:
    if not planner.has_key():
        chosen = {c.name for c in selected} | set(rejected)
        return [_demo_cand(s, "missing") for s in POOL if s.name not in chosen][:4]
    prompt = f"""A traveler is planning {city}. They selected these places:
{json.dumps([{"name": c.name, "area": c.area} for c in selected])}
They rejected: {json.dumps(rejected)}
Interests: {", ".join(prefs.interests) or "a good mix"}.
Suggest 4 to 6 worthwhile places they might be MISSING that are close to their selected places
(same neighborhoods), or very famous ones they skipped by accident. Do not repeat selected or rejected places.
In "why", name which selected place it is near and why it is worth a look. Use group "gem".
{GROUP_RULES}"""
    raw: LLMMissing = await planner.generate(prompt, LLMMissing)
    cands = [_to_candidate(i, "missing") for i in raw.ideas]
    cands = await verify_all(cands, city, lat, lng)
    names = {_norm(c.name) for c in selected} | {_norm(r) for r in rejected}
    return [c for c in cands if _norm(c.name) not in names]


async def search_own(query: str, city: str, lat: float, lng: float) -> list[Candidate]:
    """'Add your own place': straight Google search, no AI."""
    found = await places.search_text(f"{query}, {city}", lat, lng, radius_m=50000, limit=5)
    out = []
    for p in found:
        out.append(Candidate(
            id=uuid.uuid4().hex[:8], name=p.name, group="custom", area="", category=_cat_from_types(p.types),
            why="Added by you.", duration_min=60, est_cost_usd=0, indoor=True,
            lat=p.lat, lng=p.lng, verified=True, place=p,
            distance_km=round(haversine_km(lat, lng, p.lat, p.lng), 1)))
    return out


def _cat_from_types(types: list[str]) -> str:
    t = set(types)
    if t & {"museum", "art_gallery"}:
        return "museum"
    if t & {"park", "national_park", "garden"}:
        return "park"
    if t & {"restaurant", "food", "meal_takeaway"}:
        return "food_spot"
    if t & {"cafe", "coffee_shop", "bakery"}:
        return "cafe"
    if t & {"shopping_mall", "store", "market"}:
        return "shopping"
    if t & {"bar", "night_club"}:
        return "nightlife"
    return "sight"


# ---------- Demo mode (no Gemini key) ----------

def _demo_cand(s, group):
    return Candidate(id=uuid.uuid4().hex[:8], name=s.name, group=group, area="Paris",
                     category=s.category if s.category != "food" else "food_spot", why=s.why,
                     duration_min=s.duration_min, est_cost_usd=s.est_cost_usd, indoor=s.indoor,
                     needs_ticket=s.est_cost_usd > 0, lat=s.lat, lng=s.lng)


def _demo_discovery():
    landmarks, gems = [], []
    for d in DAYS:
        for s in d.stops:
            if s.category == "food":
                continue
            (landmarks if s.est_cost_usd > 0 or "Tower" in s.name else gems).append(_demo_cand(s, "landmark"))
    for g in gems:
        g.group = "gem"
    for s in POOL[:4]:
        gems.append(_demo_cand(s, "gem"))
    raw = LLMDiscovery(destination_city="Paris", country="France", airport_code="CDG",
                       center_lat=48.8566, center_lng=2.3522,
                       summary="Demo mode: a sample Paris trip. Add a Gemini key to plan any city.",
                       ideas=[], tips=["Buy a Navigo Easy card for the metro.",
                                       "Say 'Bonjour' when you enter a shop.",
                                       "Many museums close one day a week, so check before you go."])
    return raw, landmarks + gems
