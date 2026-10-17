"""Social-media inspiration with Gemini.

1. read_media(): Gemini looks at screenshots or a screen recording of a reel
   (TikTok, Instagram, anything) plus any captions, and lists the places it
   can actually see or read, with the evidence. No platform API needed,
   because the user shares their own screen.
2. social_picks(): Gemini uses Google Search to find recent web articles about
   places that are popular on TikTok / Instagram in a city. Every pick must
   point to at least one real article; picks without a source are dropped.
   We say clearly that this is from web articles, not TikTok's own data.
"""
import asyncio
import logging
import os
import tempfile
import time
import uuid

from google.genai import types

from . import planner
from .models import Candidate, LLMSeen, LLMSocial, Source, TripPrefs

log = logging.getLogger("gotinerary.social_ai")

INLINE_LIMIT = 18 * 1024 * 1024  # bigger files go through the Files API

SEEN_PROMPT = """You are helping a traveler turn social-media travel videos into a trip.
Look carefully at the attached screenshots and/or video, and the captions below.
List every real-world PLACE that is shown or named: restaurants, cafes, shrines, viewpoints,
shops, streets, beaches, hotels, neighborhoods. Use on-screen text, captions, spoken words,
signs, and famous landmarks you can clearly recognize.
Rules:
- Only list places you have real evidence for. Do not guess or add famous places that are not shown.
- name: the place's common name, as it would appear on Google Maps.
- city and country: where it is (best judgment from the evidence).
- evidence: ONE short sentence on what you saw or read (for example: "On-screen text says 'Nishiki Market, Kyoto'").
- confidence: high (name clearly written or said), medium (recognized landmark), low (unsure).
- summary: one sentence describing the trip vibe of these videos.
Captions and notes from the traveler:
{text}"""


async def _upload(data: bytes, mime: str):
    """Large videos: upload with the Files API and wait until Google has processed it."""
    client = planner.client()
    suffix = "." + (mime.split("/")[-1] or "bin")
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as f:
        f.write(data)
        path = f.name
    try:
        up = await asyncio.to_thread(client.files.upload, file=path, config={"mime_type": mime})
        start = time.time()
        while (not up.state or up.state.name != "ACTIVE") and time.time() - start < 120:
            if up.state and up.state.name == "FAILED":
                raise RuntimeError("Google could not process this video.")
            await asyncio.sleep(3)
            up = await asyncio.to_thread(client.files.get, name=up.name)
        return types.Part.from_uri(file_uri=up.uri, mime_type=up.mime_type or mime)
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


async def read_media(files: list[tuple[bytes, str]], text: str) -> LLMSeen:
    parts = []
    for data, mime in files:
        if len(data) > INLINE_LIMIT and mime.startswith("video/"):
            parts.append(await _upload(data, mime))
        else:
            parts.append(types.Part.from_bytes(data=data, mime_type=mime))
    parts.append(types.Part.from_text(text=SEEN_PROMPT.format(text=text or "none")))
    resp = await planner.client().aio.models.generate_content(
        model=planner.MODEL,
        contents=[types.Content(role="user", parts=parts)],
        config=types.GenerateContentConfig(response_mime_type="application/json",
                                           response_schema=LLMSeen, temperature=0.2),
    )
    if resp.parsed is not None:
        return resp.parsed
    return LLMSeen.model_validate_json(resp.text)


def _sources_from(resp) -> list[Source]:
    out, seen = [], set()
    try:
        for cand in resp.candidates or []:
            gm = cand.grounding_metadata
            for ch in (gm.grounding_chunks or []) if gm else []:
                if ch.web and ch.web.uri and ch.web.uri not in seen:
                    seen.add(ch.web.uri)
                    out.append(Source(title=ch.web.title or ch.web.domain or "Web article", uri=ch.web.uri))
    except Exception:  # noqa: BLE001
        log.exception("could not read grounding sources")
    return out


async def social_picks(prefs: TripPrefs, city: str, country: str, skip_names: list[str]) -> tuple[list[Candidate], list[Source], str]:
    """Returns (candidates, sources, note)."""
    client = planner.client()
    year = time.strftime("%Y")
    research = await client.aio.models.generate_content(
        model=planner.MODEL,
        contents=(f"Search the web for places in {city}, {country} that are popular or viral on TikTok and "
                  f"Instagram Reels in {year} (recent travel articles, 'TikTok famous' lists, creator guides). "
                  f"Traveler interests: {', '.join(prefs.interests) or 'a good mix'}. Diet: {prefs.diet}. "
                  "List 6 to 10 specific places, and for each say what makes it popular on social media."),
        config=types.GenerateContentConfig(tools=[types.Tool(google_search=types.GoogleSearch())], temperature=0.3),
    )
    sources = _sources_from(research)
    if not sources:
        return [], [], "We couldn't find web sources for social-media picks, so we're not showing any."
    numbered = "\n".join(f"[{i + 1}] {s.title} {s.uri}" for i, s in enumerate(sources))
    structured = await planner.generate(
        f"""Here are research notes about places popular on social media in {city}:
{research.text}

Numbered web sources used:
{numbered}

Turn the notes into a list of ideas. For each idea, source_numbers must list the numbers of the
sources above that mention it (at least one). Skip any place with no source.
Do not include: {", ".join(skip_names) or "nothing"}.
why: ONE short sentence on why it's popular online, without inventing view counts or numbers.
category: one of sight, museum, park, shopping, nightlife, experience, cafe, food_spot.
lat/lng: best estimate (it will be checked).""",
        LLMSocial,
    )
    cands = []
    for idea in structured.ideas:
        srcs = [sources[n - 1] for n in idea.source_numbers if 1 <= n <= len(sources)]
        if not srcs:
            continue
        cands.append(Candidate(
            id=uuid.uuid4().hex[:8], name=idea.name, group="social", area=idea.area,
            category=idea.category if idea.category != "food" else "food_spot", why=idea.why,
            duration_min=idea.duration_min, est_cost_usd=idea.est_cost_usd, indoor=idea.indoor,
            needs_ticket=idea.needs_ticket, lat=idea.lat, lng=idea.lng, sources=srcs[:3]))
    return cands, sources, ""
