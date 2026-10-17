"""Time and distance logic.

The AI model chooses *which* places to visit and how long to stay.
This module decides *when*: it estimates travel between stops and
builds a real timetable, so times always add up.
"""
import math
import uuid
from datetime import date, timedelta

from .models import LLMStop, Stop

DAY_START = {"relaxed": "09:30", "balanced": "09:00", "packed": "08:30"}
DAY_END = "22:00"
STREET_FACTOR = 1.3      # streets are not straight lines
WALK_KMH = 4.5
TRANSIT_KMH = 18.0
TRANSIT_WAIT_MIN = 8
WALK_LIMIT_KM = 1.5      # above this we assume metro / bus / taxi
DINNER_FROM = 15 * 60 + 30
DINNER_AT = 19 * 60


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
    """Return (minutes, km, mode) for one leg."""
    km = haversine_km(lat1, lng1, lat2, lng2) * STREET_FACTOR
    if km <= WALK_LIMIT_KM:
        minutes = km / WALK_KMH * 60
        mode = "walk"
    else:
        minutes = km / TRANSIT_KMH * 60 + TRANSIT_WAIT_MIN
        mode = "transit"
    minutes = int(math.ceil(minutes / 5.0) * 5)  # round up to 5 minutes
    return max(minutes, 5), round(km, 1), mode


def to_stop(s: LLMStop, status: str = "upcoming") -> Stop:
    return Stop(id=uuid.uuid4().hex[:8], status=status, **s.model_dump())


def schedule(stops: list[Stop], start: str, from_lat=None, from_lng=None,
             end: str = DAY_END) -> list[Stop]:
    """Give each stop a start and end time, in order.

    Travel to the first stop is counted when a starting point is given
    (for example the traveler's current location during a re-plan).
    Stops that no longer fit before the end of the day are dropped.
    """
    t = to_min(start)
    last_lat, last_lng = from_lat, from_lng
    out: list[Stop] = []
    for s in stops:
        if last_lat is not None:
            mins, km, mode = travel_leg(last_lat, last_lng, s.lat, s.lng)
        else:
            mins, km, mode = 0, 0.0, ""
        begin = t + mins
        # Dinner should be at dinner time: a meal planned in the late
        # afternoon waits until 19:00 (the free time is shown in the UI).
        if s.category == "food" and DINNER_FROM <= begin < DINNER_AT:
            begin = DINNER_AT
        if begin + s.duration_min > to_min(end) and out:
            break
        s = s.model_copy(update={
            "travel_min": mins, "distance_km": km, "travel_mode": mode,
            "start_time": to_hhmm(begin), "end_time": to_hhmm(begin + s.duration_min),
        })
        out.append(s)
        t = begin + s.duration_min
        last_lat, last_lng = s.lat, s.lng
    return out


def day_date(start_date: str, index: int) -> str:
    try:
        d = date.fromisoformat(start_date) + timedelta(days=index)
        return d.isoformat()
    except ValueError:
        return start_date
