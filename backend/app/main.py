"""GoTinerary API."""
import logging
import os
from pathlib import Path
from types import SimpleNamespace

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from . import demo, discovery, engine, planner, social_ai  # noqa: E402
from .models import (BuildRequest, Candidate, Day, DayEditRequest, DayEditResponse,  # noqa: E402
                     DiscoverResponse, Hotel, HotelRequest, Itinerary, MissingRequest,
                     ReplanRequest, ReplanResponse, SearchRequest, SetHotelRequest, Stop,
                     Source, SwapRequest, SwapResponse, TripPrefs, TripRequest, VideoPlace)
from .providers import places, social  # noqa: E402
from .scheduling import (BUFFER, DAY_START, day_date, optimize_route, schedule,  # noqa: E402
                         to_min, to_stop)

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("gotinerary")
app = FastAPI(title="GoTinerary API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def mode_now() -> str:
    return "ai" if planner.has_key() else "demo"


@app.get("/api/health")
def health():
    return {"ok": True, "mode": mode_now(), "model": planner.MODEL, "places": places.enabled()}


# ---------- Onboarding + discovery ----------

class LinkRequest(BaseModel):
    url: str


@app.post("/api/inspiration")
async def inspiration(req: LinkRequest):
    return await social.read_link(req.url)


MAX_FILES = 6
IMAGE_MAX = 10 * 1024 * 1024
VIDEO_MAX = 100 * 1024 * 1024


class MediaResponse(BaseModel):
    summary: str
    places: list[VideoPlace]


@app.post("/api/inspiration/media", response_model=MediaResponse)
async def inspiration_media(files: list[UploadFile] = File(default=[]), text: str = Form(default=""),
                            source: str = Form(default="Screenshot")):
    """Find places in screenshots / screen recordings of TikTok or Instagram reels."""
    if not planner.has_key():
        raise HTTPException(400, "Reading videos and screenshots needs a Gemini key.")
    if not files and not text.strip():
        raise HTTPException(400, "Add a screenshot, a video, or a caption.")
    if len(files) > MAX_FILES:
        raise HTTPException(400, f"Please add at most {MAX_FILES} files.")
    data = []
    for f in files:
        mime = (f.content_type or "").lower()
        if mime == "video/quicktime":
            mime = "video/mov"
        if not (mime.startswith("image/") or mime.startswith("video/")):
            raise HTTPException(400, f"{f.filename}: only images and videos are supported.")
        b = await f.read()
        limit = VIDEO_MAX if mime.startswith("video/") else IMAGE_MAX
        if len(b) > limit:
            raise HTTPException(400, f"{f.filename} is too big (max {limit // (1024 * 1024)} MB).")
        data.append((b, mime))
    try:
        seen = await social_ai.read_media(data, text)
    except Exception as e:  # noqa: BLE001
        log.exception("media read failed")
        raise HTTPException(502, planner.friendly(e)) from e
    places_out = [VideoPlace(name=p.name, city=p.city, evidence=p.evidence, confidence=p.confidence,
                             source="Video" if any(m.startswith("video/") for _, m in data) else
                             ("Screenshot" if data else "Caption"))
                  for p in seen.places if p.confidence in ("high", "medium")]
    return MediaResponse(summary=seen.summary, places=places_out)


class SocialRequest(BaseModel):
    prefs: TripPrefs
    destination: str
    country: str = ""
    center_lat: float
    center_lng: float
    skip: list[str] = []


class SocialResponse(BaseModel):
    candidates: list[Candidate]
    sources: list[Source]
    note: str


@app.post("/api/social-picks", response_model=SocialResponse)
async def social_picks(req: SocialRequest):
    if not planner.has_key():
        return SocialResponse(candidates=[], sources=[], note="Social picks need a Gemini key.")
    try:
        cands, sources, note = await social_ai.social_picks(req.prefs, req.destination, req.country, req.skip)
    except Exception as e:  # noqa: BLE001
        log.exception("social picks failed")
        return SocialResponse(candidates=[], sources=[], note="Couldn't load social picks right now. " + planner.friendly(e))
    cands = await discovery.verify_all(cands, req.destination, req.center_lat, req.center_lng)
    skip = {discovery._norm(n) for n in req.skip}
    cands = [c for c in cands if discovery._norm(c.name) not in skip]
    return SocialResponse(candidates=cands, sources=sources, note=note)


@app.post("/api/discover", response_model=DiscoverResponse)
async def discover(prefs: TripPrefs):
    n = engine.trip_days(prefs)
    assumptions = []
    if not prefs.destination and not prefs.inspiration and not prefs.video_places:
        raise HTTPException(400, "Tell us a destination or what you saw.")
    if prefs.travelers == 1:
        assumptions.append("Planning for 1 traveler.")
    assumptions.append(f"Days run from {prefs.day_start} to {prefs.day_end}.")
    if prefs.flexible_dates:
        assumptions.append("Your dates are flexible, so we planned for the dates shown. You can change them anytime.")
    try:
        raw, cands = await discovery.discover(prefs, n)
    except Exception as e:  # noqa: BLE001
        log.exception("discover failed")
        raise HTTPException(502, planner.friendly(e)) from e
    return DiscoverResponse(
        destination=raw.destination_city, country=raw.country, airport_code=raw.airport_code,
        center_lat=raw.center_lat, center_lng=raw.center_lng, summary=raw.summary, tips=raw.tips,
        candidates=cands, assumptions=assumptions, mode=mode_now(),
        verified_source="Google Places" if places.enabled() else "")


@app.post("/api/missing", response_model=list[Candidate])
async def missing(req: MissingRequest):
    try:
        return await discovery.missing(req.prefs, req.destination, req.center_lat, req.center_lng,
                                       req.selected, req.rejected)
    except Exception as e:  # noqa: BLE001
        log.exception("missing failed")
        raise HTTPException(502, planner.friendly(e)) from e


@app.post("/api/places/search", response_model=list[Candidate])
async def search_places(req: SearchRequest):
    if not places.enabled():
        raise HTTPException(400, "Adding your own place needs a Google Maps key.")
    return await discovery.search_own(req.query, req.destination, req.center_lat, req.center_lng)


@app.get("/api/photo")
async def photo(name: str, w: int = 480):
    url = await places.photo_url(name, min(max(w, 100), 1200))
    if not url:
        raise HTTPException(404, "No photo")
    return RedirectResponse(url, headers={"Cache-Control": "public, max-age=3600"})


# ---------- Itinerary ----------

@app.post("/api/itinerary/build", response_model=Itinerary)
async def build_itinerary(req: BuildRequest):
    if not req.selected:
        raise HTTPException(400, "Select at least one place.")
    return await engine.build(req, mode_now())


@app.post("/api/itinerary/day", response_model=DayEditResponse)
async def edit_day(req: DayEditRequest):
    if not 0 <= req.day_index < len(req.itinerary.days):
        raise HTTPException(400, "Bad day index")
    day, un = await engine.rebuild_day(req.itinerary, req.day_index, req.stop_ids, req.optimize)
    return DayEditResponse(day=day, unscheduled=un)


@app.post("/api/hotels", response_model=list[Hotel])
async def hotels(req: HotelRequest):
    if not places.enabled():
        return []
    return await engine.find_hotels(req.itinerary)


@app.post("/api/itinerary/hotel", response_model=Itinerary)
async def set_hotel(req: SetHotelRequest):
    it = req.itinerary.model_copy(update={"hotel": req.hotel})
    return await engine.reschedule_all(it)


# ---------- Quick plan (first version, kept for compatibility) ----------

@app.post("/api/plan", response_model=Itinerary)
async def plan(req: TripRequest):
    mode = mode_now()
    if mode == "ai":
        try:
            raw = await planner.plan_trip(req)
        except Exception as e:  # noqa: BLE001
            log.exception("AI plan failed")
            raise HTTPException(502, planner.friendly(e)) from e
    else:
        raw = demo.demo_itinerary(req.days)
    days = []
    for i, d in enumerate(raw.days[: req.days]):
        stops = optimize_route([to_stop(s) for s in d.stops])
        stops = schedule(stops, DAY_START[req.pace])
        days.append(Day(day=i + 1, date=day_date(req.start_date, i), theme=d.theme, stops=stops))
    return Itinerary(
        destination="Paris" if mode == "demo" else req.destination.strip().title(),
        start_date=req.start_date, budget=req.budget, pace=req.pace, interests=req.interests,
        summary=raw.summary, center_lat=raw.center_lat, center_lng=raw.center_lng,
        days=days, tips=raw.tips, mode=mode)


# ---------- Live changes during the trip ----------

async def _verify_stop(s: Stop, it: Itinerary) -> Stop:
    """Check an AI-suggested stop with Google, like discovery does."""
    c = Candidate(id=s.id, name=s.name, group="missing", category=s.category, why=s.why,
                  duration_min=s.duration_min, est_cost_usd=s.est_cost_usd, indoor=s.indoor,
                  lat=s.lat, lng=s.lng)
    v = await discovery.verify(c, it.destination, it.center_lat, it.center_lng)
    if not v.verified:
        return s
    return s.model_copy(update={"name": v.name, "lat": v.lat, "lng": v.lng, "verified": True,
                                "place": v.place, "description": v.place.address or s.description})


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
    keep = {discovery._norm(s.name): s for s in upcoming}
    try:
        if mode == "ai":
            raw = await planner.replan_day(req, done, upcoming, lat, lng)
        else:
            raw = demo.demo_replan(req.reason, upcoming, used, lat, lng)
        explanation = raw.explanation
        new_stops = []
        for s in raw.stops:
            old = keep.get(discovery._norm(s.name))
            if old:  # unchanged place: keep its verified data
                new_stops.append(old.model_copy(update={"status": "upcoming"}))
            else:
                st = to_stop(s, status="new")
                if st.category == "food":
                    st = st.model_copy(update={"kind": "meal"})
                new_stops.append(st)
        new_stops = list(await engine.gather_limited(
            [_verify_stop(s, it) if s.status == "new" else _same(s) for s in new_stops]))
    except Exception:  # noqa: BLE001  -- never break the live demo
        log.exception("AI replan failed, falling back to re-timing")
        explanation = "The AI is busy right now, so I re-timed your remaining plan from now."
        new_stops = [s.model_copy() for s in upcoming]

    new_stops = optimize_route(new_stops, SimpleNamespace(lat=lat, lng=lng))
    skipped: list = []
    end = it.prefs.day_end if it.prefs else "22:00"
    scheduled = schedule(new_stops, req.current_time, lat, lng, end, day.date, BUFFER[it.pace], skipped)
    if skipped:
        explanation += " " + "; ".join(f"{s.name}: {r.lower()}" for s, r in skipped[:3]) + "."
    new_names = {s.name for s in scheduled}
    new_day = Day(day=day.day, date=day.date, theme=day.theme, stops=done + scheduled)
    return ReplanResponse(
        day=new_day, explanation=explanation, mode=mode,
        removed=[n for n in [s.name for s in upcoming] if n not in new_names],
        added=[s.name for s in scheduled if s.status == "new"],
    )


async def _same(s):
    return s


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

    new = None
    if old.kind == "meal" and it.prefs and places.enabled():
        # Meals: pick the next-best real restaurant, no AI needed.
        used_ids = {s.place.place_id for d in it.days for s in d.stops if s.place}
        at = to_min(old.start_time) if old.start_time else 12 * 60 + 30
        label = "Lunch" if at < 16 * 60 else "Dinner"
        new = await engine.find_meal(it.prefs, old.lat, old.lng, day.date, at, used_ids, label)
        new = new.model_copy(update={"status": "new"})
    else:
        try:
            raw = await planner.swap_stop(req, day, idx) if mode == "ai" else demo.demo_swap(old, used)
        except Exception as e:  # noqa: BLE001
            log.exception("swap failed")
            raise HTTPException(502, planner.friendly(e)) from e
        if raw is None:
            raise HTTPException(404, "No other place found nearby")
        new = await _verify_stop(to_stop(raw.stop, status="new"), it)

    stops: list[Stop] = list(day.stops)
    stops[idx] = new
    head = stops[:idx]
    start = head[-1].end_time if head else (old.start_time or DAY_START[it.pace])
    lat = head[-1].lat if head else None
    lng = head[-1].lng if head else None
    tail = schedule(stops[idx:], start, lat, lng, it.prefs.day_end if it.prefs else "22:00",
                    day.date if it.prefs else None, BUFFER[it.pace] if it.prefs else 0)
    new_day = Day(day=day.day, date=day.date, theme=day.theme, stops=head + tail)
    return SwapResponse(day=new_day, old_name=old.name, new_name=new.name, mode=mode)


# Serve the built frontend (npm run build) from the same server, if present.
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.exists() and os.getenv("SERVE_FRONTEND", "1") == "1":
    app.mount("/", StaticFiles(directory=DIST, html=True), name="frontend")
