"""GoTinerary API."""
import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from . import demo, planner  # noqa: E402
from .models import (Day, Itinerary, ReplanRequest, ReplanResponse, Stop,  # noqa: E402
                     SwapRequest, SwapResponse, TripRequest)
from types import SimpleNamespace  # noqa: E402

from .scheduling import DAY_START, day_date, optimize_route, schedule, to_min, to_stop  # noqa: E402

log = logging.getLogger("gotinerary")
app = FastAPI(title="GoTinerary API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health():
    return {"ok": True, "mode": "ai" if planner.has_key() else "demo", "model": planner.MODEL}


@app.post("/api/plan", response_model=Itinerary)
async def plan(req: TripRequest):
    mode = "ai" if planner.has_key() else "demo"
    if mode == "ai":
        try:
            raw = await planner.plan_trip(req)
        except Exception as e:  # noqa: BLE001
            log.exception("AI plan failed")
            raise HTTPException(502, f"The AI planner failed: {e}") from e
    else:
        raw = demo.demo_itinerary(req.days)

    days = []
    for i, d in enumerate(raw.days[: req.days]):
        stops = optimize_route([to_stop(s) for s in d.stops])
        stops = schedule(stops, DAY_START[req.pace])
        days.append(Day(day=i + 1, date=day_date(req.start_date, i), theme=d.theme, stops=stops))

    return Itinerary(
        destination="Paris" if mode == "demo" else req.destination.strip().title(),
        start_date=req.start_date, budget=req.budget, pace=req.pace,
        interests=req.interests, summary=raw.summary,
        center_lat=raw.center_lat, center_lng=raw.center_lng,
        days=days, tips=raw.tips, mode=mode,
    )


@app.post("/api/replan", response_model=ReplanResponse)
async def replan(req: ReplanRequest):
    it = req.itinerary
    if not 0 <= req.day_index < len(it.days):
        raise HTTPException(400, "Bad day index")
    day = it.days[req.day_index]
    now = to_min(req.current_time)

    done = [s.model_copy(update={"status": "done"}) for s in day.stops
            if s.end_time and to_min(s.end_time) <= now]
    upcoming = [s for s in day.stops if not (s.end_time and to_min(s.end_time) <= now)]

    # Where is the traveler? GPS if given, else the last finished stop.
    lat, lng = req.current_lat, req.current_lng
    if lat is None:
        if done:
            lat, lng = done[-1].lat, done[-1].lng
        elif upcoming:
            lat, lng = upcoming[0].lat, upcoming[0].lng
        else:
            lat, lng = it.center_lat, it.center_lng

    used = [s.name for d in it.days for s in d.stops]
    mode = "ai" if planner.has_key() and it.mode == "ai" else "demo"
    try:
        if mode == "ai":
            raw = await planner.replan_day(req, done, upcoming, lat, lng)
        else:
            raw = demo.demo_replan(req.reason, upcoming, used, lat, lng)
        explanation = raw.explanation
        new_stops = [to_stop(s) for s in raw.stops]
    except Exception:  # noqa: BLE001  -- never break the live demo
        log.exception("AI replan failed, falling back to re-timing")
        explanation = "The AI is busy right now, so I re-timed your remaining plan from now."
        new_stops = [s.model_copy() for s in upcoming]

    old_names = {s.name for s in upcoming}
    for i, s in enumerate(new_stops):
        new_stops[i] = s.model_copy(update={"status": "upcoming" if s.name in old_names else "new"})

    new_stops = optimize_route(new_stops, SimpleNamespace(lat=lat, lng=lng))
    scheduled = schedule(new_stops, req.current_time, lat, lng)
    new_names = {s.name for s in scheduled}
    new_day = Day(day=day.day, date=day.date, theme=day.theme, stops=done + scheduled)
    return ReplanResponse(
        day=new_day, explanation=explanation, mode=mode,
        removed=[n for n in [s.name for s in upcoming] if n not in new_names],
        added=[s.name for s in scheduled if s.status == "new"],
    )


@app.post("/api/swap", response_model=SwapResponse)
async def swap(req: SwapRequest):
    it = req.itinerary
    day = it.days[req.day_index]
    idx = next((i for i, s in enumerate(day.stops) if s.id == req.stop_id), None)
    if idx is None:
        raise HTTPException(404, "Stop not found")
    old = day.stops[idx]
    used = [s.name for d in it.days for s in d.stops]
    mode = "ai" if planner.has_key() and it.mode == "ai" else "demo"
    try:
        raw = await planner.swap_stop(req, day, idx) if mode == "ai" else demo.demo_swap(old, used)
    except Exception as e:  # noqa: BLE001
        log.exception("swap failed")
        raise HTTPException(502, f"Could not find a swap: {e}") from e
    if raw is None:
        raise HTTPException(404, "No other place found nearby")

    new = to_stop(raw.stop, status="new")
    stops: list[Stop] = list(day.stops)
    stops[idx] = new
    # Re-time from the swapped stop onward; earlier stops stay as they are.
    head = stops[:idx]
    start = head[-1].end_time if head else (old.start_time or DAY_START[it.pace])
    lat = head[-1].lat if head else None
    lng = head[-1].lng if head else None
    tail = schedule(stops[idx:], start, lat, lng)
    new_day = Day(day=day.day, date=day.date, theme=day.theme, stops=head + tail)
    return SwapResponse(day=new_day, old_name=old.name, new_name=new.name, mode=mode)


# Serve the built frontend (npm run build) from the same server, if present.
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.exists() and os.getenv("SERVE_FRONTEND", "1") == "1":
    app.mount("/", StaticFiles(directory=DIST, html=True), name="frontend")
