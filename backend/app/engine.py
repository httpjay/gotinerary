"""Itinerary engine (rule-based).

Turns the places the traveler selected into a feasible day-by-day plan:
1. Group places into days by location, respecting must-do priority,
   day capacity and opening days.
2. Order each day's route (nearest-neighbor + 2-opt).
3. Add lunch and dinner from real nearby restaurants that fit the diet.
4. Schedule with travel time, buffers and opening hours; anything that
   cannot fit is listed with a clear reason instead of being forced in.
"""
import asyncio
import math
import uuid
from datetime import date

from . import hours as H
from .models import (BuildRequest, Candidate, Day, Hotel, Itinerary, Stop, TripPrefs,
                     Unscheduled)
from .providers import places
from .scheduling import (BUFFER, haversine_km, optimize_route, schedule, to_min)

LUNCH_MIN, DINNER_MIN = 60, 75

DIET_QUERY = {
    "none": "restaurant", "vegetarian": "vegetarian restaurant", "vegan": "vegan restaurant",
    "pescatarian": "seafood restaurant", "halal": "halal restaurant", "kosher": "kosher restaurant",
    "gluten-free": "gluten free restaurant",
}
BUDGET_WORD = {"low": "affordable ", "medium": "", "high": "fine dining "}


def trip_days(prefs: TripPrefs) -> int:
    try:
        n = (date.fromisoformat(prefs.end_date) - date.fromisoformat(prefs.start_date)).days + 1
    except ValueError:
        n = 3
    return max(1, min(n, 7))


def dates_for(prefs: TripPrefs, n: int) -> list[str]:
    from .scheduling import day_date
    return [day_date(prefs.start_date, i) for i in range(n)]


def cand_to_stop(c: Candidate) -> Stop:
    desc = c.why
    if c.place and c.place.address:
        desc = c.place.address
    return Stop(id=c.id, name=c.name, category=c.category, description=desc, why=c.why,
                lat=c.lat, lng=c.lng, duration_min=c.duration_min, est_cost_usd=c.est_cost_usd,
                indoor=c.indoor, kind="visit", verified=c.verified, place=c.place,
                needs_ticket=c.needs_ticket)


def _open_on(stop: Stop, iso: str) -> bool:
    w = H.windows_for(stop.place.periods if stop.place else [], iso)
    return w is None or len(w) > 0


# ---------- 1. Group into days ----------

def assign_days(stops: list[Stop], must_ids: set[str], dates: list[str], prefs: TripPrefs):
    n = len(dates)
    avail = to_min(prefs.day_end) - to_min(prefs.day_start) - LUNCH_MIN - DINNER_MIN
    capacity = avail * 0.72  # leave room for travel and buffers
    if not stops:
        return [[] for _ in range(n)], []

    # Seeds far apart, so each day covers one part of the city.
    lat0 = sum(s.lat for s in stops) / len(stops)
    lng0 = sum(s.lng for s in stops) / len(stops)
    seeds = [max(stops, key=lambda s: haversine_km(lat0, lng0, s.lat, s.lng))]
    while len(seeds) < min(n, len(stops)):
        seeds.append(max(stops, key=lambda s: min(haversine_km(s.lat, s.lng, x.lat, x.lng) for x in seeds)))
    centers = [(s.lat, s.lng) for s in seeds] + [(lat0, lng0)] * (n - len(seeds))

    groups: list[list[Stop]] = [[] for _ in range(n)]
    load = [0.0] * n
    left: list[Unscheduled] = []
    order = sorted(stops, key=lambda s: (s.id not in must_ids, -s.duration_min))
    for s in order:
        options = sorted(range(n), key=lambda i: haversine_km(centers[i][0], centers[i][1], s.lat, s.lng))
        open_days = [i for i in options if _open_on(s, dates[i])]
        if not open_days:
            left.append(Unscheduled(name=s.name, candidate_id=s.id,
                                    reason="Closed on every day of your trip"))
            continue
        placed = False
        for i in open_days:
            if load[i] + s.duration_min <= capacity:
                groups[i].append(s)
                load[i] += s.duration_min
                # move the day's center toward its places
                k = len(groups[i])
                centers[i] = ((centers[i][0] * k + s.lat) / (k + 1), (centers[i][1] * k + s.lng) / (k + 1))
                placed = True
                break
        if not placed:
            left.append(Unscheduled(name=s.name, candidate_id=s.id,
                                    reason="Not enough time in your days. Add a day or remove a place."))
    return groups, left


# ---------- 3. Meals ----------

def _diet_evidence(p, diet: str) -> str:
    if diet == "none":
        return ""
    if diet in ("vegetarian", "vegan") and p.serves_vegetarian:
        return "Google lists this place as serving vegetarian food. Check the menu for vegan options." \
            if diet == "vegan" else "Google lists this place as serving vegetarian food."
    return f"Found by searching for {DIET_QUERY.get(diet, diet)}. Diet match not confirmed, so check the menu."


async def find_meal(prefs: TripPrefs, lat: float, lng: float, iso: str, at_min: int,
                    used: set[str], label: str) -> Stop:
    dur = LUNCH_MIN if label == "Lunch" else DINNER_MIN
    query = BUDGET_WORD.get(prefs.budget, "") + DIET_QUERY.get(prefs.diet, prefs.diet + " restaurant")
    found = await places.search_text(query, lat, lng, radius_m=1500, included_type="restaurant",
                                      min_rating=4.0, limit=10, food=True)
    best, best_score = None, -1e9
    for p in found:
        if p.place_id in used or p.business_status not in ("", "OPERATIONAL"):
            continue
        km = haversine_km(lat, lng, p.lat, p.lng)
        if km > 2.5:
            continue
        w = H.windows_for(p.periods, iso)
        if H.fit(w, at_min, dur)[0] is None:
            continue  # closed at meal time
        score = (p.rating or 3.5) * math.log10((p.rating_count or 1) + 10) - 0.6 * km
        if prefs.diet in ("vegetarian", "vegan") and p.serves_vegetarian:
            score += 1.5
        if score > best_score:
            best, best_score = p, score

    warnings = []
    if prefs.allergies.strip():
        warnings.append(f"Allergies ({prefs.allergies.strip()}): confirm with the restaurant. "
                        "We can't guarantee allergen safety.")
    if best:
        used.add(best.place_id)
        evidence = _diet_evidence(best, prefs.diet)
        return Stop(id=uuid.uuid4().hex[:8], name=best.name, category="food", kind="meal",
                    meal=label.lower(), description=best.address, why=f"{label} near your stops." + (f" {evidence}" if evidence else ""),
                    lat=best.lat, lng=best.lng, duration_min=dur,
                    est_cost_usd={"low": 12, "medium": 25, "high": 60}[prefs.budget],
                    indoor=True, verified=True, place=best, warnings=warnings)
    return Stop(id=uuid.uuid4().hex[:8], name=f"{label} break", category="food", kind="meal", meal=label.lower(),
                description="Eat somewhere close by.",
                why=("No verified restaurant matching your needs was found nearby, so search the area."
                     if places.enabled() else "Add a Google Maps key to get real restaurant picks."),
                lat=lat, lng=lng, duration_min=dur, est_cost_usd={"low": 12, "medium": 25, "high": 60}[prefs.budget],
                indoor=True, verified=False, warnings=warnings)


# ---------- 2 + 4. Build one day ----------

async def build_day(visits: list[Stop], iso: str, prefs: TripPrefs, used: set[str],
                    start_point=None, add_meals: bool = True):
    buf = BUFFER[prefs.pace]
    skipped: list = []
    ordered = optimize_route(visits, start_point)
    sp_lat = start_point.lat if start_point else None
    sp_lng = start_point.lng if start_point else None
    # First pass without meals, to see where lunch time falls.
    trial = schedule(ordered, prefs.day_start, sp_lat, sp_lng, prefs.day_end, iso, buf, [])
    if add_meals and (trial or visits):
        anchor_list = trial or ordered
        li = next((i for i, s in enumerate(anchor_list) if to_min(s.end_time or "13:00") >= 12 * 60), len(anchor_list) - 1)
        la = anchor_list[max(li, 0)]
        lunch = await find_meal(prefs, la.lat, la.lng, iso, 12 * 60 + 30, used, "Lunch")
        last = anchor_list[-1]
        dinner = await find_meal(prefs, last.lat, last.lng, iso, 19 * 60, used, "Dinner")
        names = [s.id for s in anchor_list]
        cut = names.index(la.id) + 1
        # A long visit that runs past 13:45 gets lunch BEFORE it, not after.
        if cut > 1 and to_min(la.end_time or "13:00") > 13 * 60 + 45:
            cut -= 1
        by_id = {s.id: s for s in ordered}
        full = [by_id[i] for i in names[:cut]] + [lunch] + [by_id[i] for i in names[cut:]] + [dinner]
        full += [s for s in ordered if s.id not in names]  # stops that failed the trial get a 2nd chance
    else:
        full = ordered
    final = schedule(full, prefs.day_start, sp_lat, sp_lng, prefs.day_end, iso, buf, skipped)
    unsched = [Unscheduled(name=s.name, reason=r, candidate_id=s.id) for s, r in skipped if s.kind == "visit"]
    return final, unsched


def day_theme(stops: list[Stop], cands: dict[str, Candidate]) -> str:
    areas = []
    for s in stops:
        a = cands[s.id].area if s.id in cands else ""
        if a and a not in areas:
            areas.append(a)
    if areas:
        return " & ".join(areas[:2])
    visits = [s.name for s in stops if s.kind == "visit"]
    return " & ".join(visits[:2]) if visits else "Free day"


async def build(req: BuildRequest, mode: str) -> Itinerary:
    prefs = req.prefs
    n = trip_days(prefs)
    dates = dates_for(prefs, n)
    cands = {c.id: c for c in req.selected}
    visits = [cand_to_stop(c) for c in req.selected]
    must = {c.id for c in req.selected if c.priority == "must"}
    groups, left = assign_days(visits, must, dates, prefs)

    start_point = req.hotel.place if req.hotel else None
    used: set[str] = set()
    days, warnings = [], []
    # Days are built one after another so restaurants don't repeat.
    for i, (iso, g) in enumerate(zip(dates, groups)):
        stops, un = await build_day(g, iso, prefs, used, start_point)
        left += un
        days.append(Day(day=i + 1, date=iso, theme=day_theme(stops, cands), stops=stops))

    # Second chance: try skipped places on other days where they are open.
    retry = [u for u in left if u.candidate_id in cands and "every day" not in u.reason]
    for u in retry:
        stop = cand_to_stop(cands[u.candidate_id])
        for di, d in enumerate(days):
            if not _open_on(stop, d.date):
                continue
            visits_now = [s for s in d.stops if s.kind == "visit"] + [stop]
            new_stops, un = await build_day(visits_now, d.date, prefs, used, start_point)
            if not any(x.candidate_id == stop.id for x in un) and len(un) == 0:
                days[di] = d.model_copy(update={"stops": new_stops})
                left = [x for x in left if x.candidate_id != u.candidate_id]
                warnings.append(f"{stop.name} was moved to Day {d.day} because of opening hours or time.")
                break

    unverified = sum(1 for d in days for s in d.stops if not s.verified)
    if unverified:
        warnings.append(f"{unverified} stops are not verified (AI estimates). Check them before you go.")
    if prefs.allergies.strip():
        warnings.append("You listed allergies. Always confirm with each restaurant.")

    return Itinerary(
        destination=req.destination, start_date=prefs.start_date, budget=prefs.budget, pace=prefs.pace,
        interests=prefs.interests, summary=req.summary, center_lat=req.center_lat, center_lng=req.center_lng,
        days=days, tips=req.tips, mode=mode, prefs=prefs, country=req.country,
        airport_code=req.airport_code, unscheduled=left, warnings=warnings, hotel=req.hotel,
        verified_source="Google Places" if places.enabled() else "",
    )


async def rebuild_day(it: Itinerary, day_index: int, stop_ids: list[str], optimize: bool):
    """User edited a day (new order / removed stops). Rebuild only that day."""
    prefs = it.prefs
    day = it.days[day_index]
    by_id = {s.id: s for s in day.stops}
    stops = [by_id[i] for i in stop_ids if i in by_id]
    hotel = it.hotel.place if it.hotel else None
    if optimize:
        stops = optimize_route(stops, hotel)
    skipped: list = []
    start = prefs.day_start if prefs else "09:00"
    end = prefs.day_end if prefs else "22:00"
    buf = BUFFER[it.pace]
    out = schedule(stops, start, hotel.lat if hotel else None, hotel.lng if hotel else None,
                   end, day.date, buf, skipped)
    un = [Unscheduled(name=s.name, reason=r, candidate_id=s.id) for s, r in skipped]
    return day.model_copy(update={"stops": out}), un


async def reschedule_all(it: Itinerary) -> Itinerary:
    """Hotel changed: travel from the hotel changes every day, so re-time all days."""
    days = []
    for i, d in enumerate(it.days):
        nd, _ = await rebuild_day(it, i, [s.id for s in d.stops], optimize=True)
        days.append(nd)
    return it.model_copy(update={"days": days})


# ---------- Hotels ----------

LODGING_QUERY = {"hotel": "hotel", "hostel": "hostel", "apartment": "serviced apartment",
                 "luxury": "luxury hotel", "budget": "budget hotel"}


async def find_hotels(it: Itinerary) -> list[Hotel]:
    prefs = it.prefs
    stops = [s for d in it.days for s in d.stops if s.kind == "visit"]
    if not stops:
        return []
    lat = sum(s.lat for s in stops) / len(stops)
    lng = sum(s.lng for s in stops) / len(stops)
    q = LODGING_QUERY.get(prefs.lodging if prefs else "hotel", "hotel")
    if prefs and prefs.budget == "low" and q == "hotel":
        q = "budget hotel"
    found = await places.search_text(q, lat, lng, radius_m=3000, included_type="lodging",
                                      min_rating=3.5, limit=10)
    out = []
    for p in found:
        avg = sum(haversine_km(p.lat, p.lng, s.lat, s.lng) for s in stops) / len(stops)
        out.append(Hotel(place=p, avg_km_to_stops=round(avg, 1), links=hotel_links(p.name, it)))
    out.sort(key=lambda h: (-(h.place.rating or 0) * math.log10((h.place.rating_count or 1) + 10)
                            + 0.8 * h.avg_km_to_stops))
    return out[:6]


def hotel_links(name: str, it: Itinerary) -> dict[str, str]:
    from urllib.parse import quote
    prefs = it.prefs
    ci = it.start_date
    co = prefs.end_date if prefs else it.days[-1].date
    adults = prefs.travelers if prefs else 2
    q = quote(f"{name}, {it.destination}")
    return {
        "Booking.com": f"https://www.booking.com/searchresults.html?ss={q}&checkin={ci}&checkout={co}&group_adults={adults}",
        "Expedia": f"https://www.expedia.com/Hotel-Search?destination={q}&startDate={ci}&endDate={co}&adults={adults}",
        "Google Hotels": f"https://www.google.com/travel/search?q={q}",
    }


async def gather_limited(coros, n=6):
    sem = asyncio.Semaphore(n)

    async def one(c):
        async with sem:
            return await c
    return await asyncio.gather(*(one(c) for c in coros))
