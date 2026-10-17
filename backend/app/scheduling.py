"""Time, distance and route logic (rule-based, no AI).

The AI model may suggest *which* places to visit. This module decides
*when* and *in what order*: travel estimates, opening hours, buffers,
meal times and route order are all calculated here, so the timetable
always adds up.
"""
import math
import uuid
from datetime import date, timedelta

from . import hours as H
from .models import LLMStop, Stop

DAY_START = {"relaxed": "09:30", "balanced": "09:00", "packed": "08:30"}
BUFFER = {"relaxed": 15, "balanced": 10, "packed": 5}   # minutes added per move for delays
DAY_END = "22:00"
STREET_FACTOR = 1.3      # streets are not straight lines
WALK_KMH = 4.5
TRANSIT_KMH = 18.0
TRANSIT_WAIT_MIN = 8
WALK_LIMIT_KM = 1.5      # above this we assume metro / bus / taxi
DINNER_FROM = 15 * 60 + 30
DINNER_AT = 19 * 60
DINNER_EARLIEST = 18 * 60 + 30
LUNCH_EARLIEST = 11 * 60 + 30


def to_min(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def to_hhmm(minutes: int) -> str:
    minutes = max(0, min(minutes, 23 * 60 + 59))
    return f"{minutes // 60:02d}:{minutes % 60:02d}"


def haversine_km(lat1, lng1, lat2, lng2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def travel_leg(lat1, lng1, lat2, lng2) -> tuple[int, float, str]:
    """Return (minutes, km, mode) for one leg. These are estimates."""
    km = haversine_km(lat1, lng1, lat2, lng2) * STREET_FACTOR
    if km <= WALK_LIMIT_KM:
        minutes = km / WALK_KMH * 60
        mode = "walk"
    else:
        minutes = km / TRANSIT_KMH * 60 + TRANSIT_WAIT_MIN
        mode = "transit"
    minutes = int(math.ceil(minutes / 5.0) * 5)
    return max(minutes, 5), round(km, 1), mode


def to_stop(s: LLMStop, status: str = "upcoming") -> Stop:
    return Stop(id=uuid.uuid4().hex[:8], status=status, **s.model_dump())


def _why_skipped(note: str, iso: str, windows) -> str:
    if note == "closed":
        return f"Closed on {H.weekday_name(iso)}s"
    if note == "too_late":
        return f"Closes before we can get there ({H.describe(windows)})"
    return f"Not enough time inside opening hours ({H.describe(windows)})"


def schedule(stops: list[Stop], start: str, from_lat=None, from_lng=None,
             end: str = DAY_END, iso: str | None = None, buffer: int = 0,
             skipped: list | None = None) -> list[Stop]:
    """Give each stop a start and end time, in order.

    - Travel from the previous stop (or a given starting point) is added.
    - A small buffer per move absorbs delays.
    - If a date is given and the place has Google opening hours, the visit
      must fit inside them: we wait for opening if needed, and skip the stop
      (with a reason) if it can't fit. Skipped stops go to `skipped`.
    - Late-afternoon meals wait until dinner time.
    """
    t = to_min(start)
    last_lat, last_lng = from_lat, from_lng
    out: list[Stop] = []
    for idx, s in enumerate(stops):
        if last_lat is not None:
            mins, km, mode = travel_leg(last_lat, last_lng, s.lat, s.lng)
            mins += buffer
        else:
            mins, km, mode = 0, 0.0, ""
        begin = t + mins
        if s.meal == "dinner":
            begin = max(begin, DINNER_EARLIEST)
        elif s.meal == "lunch":
            begin = max(begin, LUNCH_EARLIEST)
        elif s.category == "food" and DINNER_FROM <= begin < DINNER_AT:
            begin = DINNER_AT

        warnings = [w for w in s.warnings if not w.startswith(("Opens at", "Hours not", "Opening hours"))]
        hours_today = ""
        wait = 0
        periods = s.place.periods if s.place else []
        if iso:
            windows = H.windows_for(periods, iso)
            hours_today = H.describe(windows) if s.place else ""
            fit_at, note = H.fit(windows, begin, s.duration_min)
            if fit_at is None:
                if skipped is not None:
                    skipped.append((s, _why_skipped(note, iso, windows)))
                continue
            wait = fit_at - begin
            if wait >= 15 and s.category != "food":
                warnings.append(f"Opens at {H.fmt(fit_at)}, so there is a {wait} min wait")
            begin = fit_at
            if windows is None:
                warnings.append("Opening hours not listed, so please check before you go"
                                if s.verified else "Hours not verified (estimate)")

        if begin + s.duration_min > to_min(end) and out:
            if skipped is not None:
                skipped.extend((r, "No time left in the day") for r in stops[idx:])
            break
        s = s.model_copy(update={
            "travel_min": mins, "distance_km": km, "travel_mode": mode,
            "start_time": to_hhmm(begin), "end_time": to_hhmm(begin + s.duration_min),
            "hours_today": hours_today, "warnings": warnings, "wait_min": wait,
        })
        out.append(s)
        t = begin + s.duration_min
        last_lat, last_lng = s.lat, s.lng
    return out


# ---------- Route order ----------

def _route_km(points, start=None) -> float:
    total, prev = 0.0, start
    for p in points:
        if prev is not None:
            total += haversine_km(prev.lat, prev.lng, p.lat, p.lng)
        prev = p
    return total


def _best_order(segment, start, end):
    """Nearest-neighbor, then 2-opt, for one group of stops between fixed points."""
    if len(segment) < 2:
        return list(segment)
    left = list(segment)
    order = []
    cur = start
    while left:
        nxt = left[0] if cur is None else min(left, key=lambda s: haversine_km(cur.lat, cur.lng, s.lat, s.lng))
        order.append(nxt)
        left.remove(nxt)
        cur = nxt

    def cost(o):
        return _route_km(o + ([end] if end is not None else []), start)

    improved = True
    while improved:
        improved = False
        for i in range(len(order) - 1):
            for j in range(i + 1, len(order)):
                cand = order[:i] + order[i:j + 1][::-1] + order[j + 1:]
                if cost(cand) + 1e-9 < cost(order):
                    order, improved = cand, True
    return order


def optimize_route(stops: list[Stop], start=None) -> list[Stop]:
    """Reduce zigzag. Meals stay in place; sights between meals get the shortest order."""
    out: list[Stop] = []
    segment: list[Stop] = []
    anchor = start
    for s in stops + [None]:
        if s is None or s.category == "food":
            out += _best_order(segment, anchor, s)
            segment = []
            if s is not None:
                out.append(s)
                anchor = s
        else:
            segment.append(s)
    return out


def day_date(start_date: str, index: int) -> str:
    try:
        return (date.fromisoformat(start_date) + timedelta(days=index)).isoformat()
    except ValueError:
        return start_date
