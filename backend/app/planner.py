"""AI planning with Google Gemini (structured JSON output)."""
import json
import os

from google import genai
from google.genai import types

from .models import (Itinerary, LLMItinerary, LLMReplan, LLMSwap, Day,
                     ReplanRequest, SwapRequest, TripRequest)

MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")

_client = None


def client():
    global _client
    if _client is None:
        _client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])
    return _client


def has_key() -> bool:
    return bool(os.getenv("GEMINI_API_KEY"))


STOP_RULES = """
Rules for every stop:
- Must be a REAL place that exists in the city, with accurate latitude and longitude.
- category is one of: sight, museum, food, cafe, park, shopping, nightlife, experience.
- duration_min is a realistic visit length in minutes.
- est_cost_usd is the cost per person in US dollars (0 if free).
- indoor is true if the visit is mostly inside (museums, restaurants, markets with roofs).
- why is ONE short sentence linking the stop to the traveler's interests.
- description is ONE or TWO short sentences.
- Include a lunch stop and a dinner stop each day (category food).
- Order stops so the traveler does not zigzag across the city.
"""


async def generate(prompt: str, schema):
    resp = await client().aio.models.generate_content(
        model=MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=schema,
            temperature=0.6,
        ),
    )
    if resp.parsed is not None:
        return resp.parsed
    return schema.model_validate(json.loads(resp.text))


async def plan_trip(req: TripRequest) -> LLMItinerary:
    per_day = {"relaxed": "4 to 5", "balanced": "5 to 6", "packed": "6 to 8"}[req.pace]
    prompt = f"""You are an expert local travel planner.
Create a {req.days}-day itinerary for {req.destination}, starting {req.start_date}.
Budget: {req.budget}. Pace: {req.pace} ({per_day} stops per day, meals included).
Traveler interests: {", ".join(req.interests) or "a good mix"}.
Must-see requests: {req.must_see or "none"}.
Give each day a short theme (3 to 6 words) and group nearby places on the same day.
summary: 1 to 2 sentences about the whole trip.
center_lat / center_lng: the city center.
tips: 3 short practical local tips (transport, money, etiquette).
{STOP_RULES}"""
    return await generate(prompt, LLMItinerary)


REASON_TEXT = {
    "rain": "It just started raining. Prefer indoor places for the rest of the day.",
    "tired": "The traveler is tired. Fewer stops, slower pace, include a relaxing cafe or park bench break.",
    "late": "The traveler is running late. Drop lower-value stops and keep the best ones that still fit.",
    "closed": "The next planned place is unexpectedly closed. Replace it with a similar nearby place.",
    "hungry": "The traveler is hungry right now. Start with a good nearby food stop.",
    "custom": "The traveler asked for a change.",
}


async def replan_day(req: ReplanRequest, done: list, upcoming: list,
                     lat: float, lng: float) -> LLMReplan:
    it: Itinerary = req.itinerary
    prompt = f"""You are a travel assistant helping a traveler DURING their trip in {it.destination}.
It is now {req.current_time}. Their current location is lat {lat:.5f}, lng {lng:.5f}.
Situation: {REASON_TEXT[req.reason]}
Extra note from traveler: {req.note or "none"}
Interests: {", ".join(it.interests) or "a good mix"}. Budget: {it.budget}. Pace: {it.pace}.
Already visited today: {json.dumps([s.name for s in done])}
Remaining plan before this change: {json.dumps([{"name": s.name, "indoor": s.indoor, "category": s.category} for s in upcoming])}
Places used on other days (do not repeat): {json.dumps(_other_day_names(it, req.day_index))}

Rebuild ONLY the rest of today, from now until about 21:30.
Keep remaining places that still make sense; replace or drop the ones that do not.
Start with a place close to the current location.
explanation: 1 to 2 short, friendly sentences telling the traveler what changed and why.
{STOP_RULES}"""
    return await generate(prompt, LLMReplan)


async def swap_stop(req: SwapRequest, day: Day, idx: int) -> LLMSwap:
    it = req.itinerary
    old = day.stops[idx]
    prompt = f"""You are a travel planner for {it.destination}.
Replace this stop with ONE different real place nearby, of a similar type and time slot:
{old.name} ({old.category}, {old.duration_min} min, near lat {old.lat:.5f}, lng {old.lng:.5f}).
Traveler note: {req.note or "just show me something different"}.
Interests: {", ".join(it.interests) or "a good mix"}. Budget: {it.budget}.
Do not use any of these: {json.dumps([s.name for d in it.days for s in d.stops])}
{STOP_RULES}"""
    return await generate(prompt, LLMSwap)


def _other_day_names(it: Itinerary, day_index: int) -> list[str]:
    return [s.name for i, d in enumerate(it.days) if i != day_index for s in d.stops]


_generate = generate
