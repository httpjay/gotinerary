"""Data models for GoTinerary.

Two groups:
- LLM* models: the exact JSON shape we ask Gemini to return (kept simple, no defaults).
- API models: what the frontend sends and receives (includes computed times and travel legs).
"""
from typing import Literal, Optional
from pydantic import BaseModel, Field


# ---------- Shapes we ask the AI model to return ----------

class LLMStop(BaseModel):
    name: str
    category: str  # sight, museum, food, cafe, park, shopping, nightlife, experience
    description: str
    why: str  # one line: why this fits the traveler's interests
    lat: float
    lng: float
    duration_min: int
    est_cost_usd: int
    indoor: bool


class LLMDay(BaseModel):
    theme: str
    stops: list[LLMStop]


class LLMItinerary(BaseModel):
    summary: str
    center_lat: float
    center_lng: float
    days: list[LLMDay]
    tips: list[str]


class LLMReplan(BaseModel):
    explanation: str
    stops: list[LLMStop]


class LLMSwap(BaseModel):
    stop: LLMStop


# ---------- API shapes ----------

Budget = Literal["low", "medium", "high"]
Pace = Literal["relaxed", "balanced", "packed"]
Reason = Literal["rain", "tired", "late", "closed", "hungry", "custom"]


class TripRequest(BaseModel):
    destination: str = Field(min_length=2, max_length=80)
    start_date: str  # YYYY-MM-DD
    days: int = Field(ge=1, le=5)
    budget: Budget = "medium"
    pace: Pace = "balanced"
    interests: list[str] = []
    must_see: str = ""


class Stop(BaseModel):
    id: str
    name: str
    category: str
    description: str
    why: str = ""
    lat: float
    lng: float
    duration_min: int
    est_cost_usd: int
    indoor: bool
    start_time: str = ""
    end_time: str = ""
    travel_min: int = 0
    distance_km: float = 0.0
    travel_mode: str = ""
    status: Literal["done", "upcoming", "new"] = "upcoming"


class Day(BaseModel):
    day: int
    date: str
    theme: str
    stops: list[Stop]


class Itinerary(BaseModel):
    destination: str
    start_date: str
    budget: Budget
    pace: Pace
    interests: list[str]
    summary: str
    center_lat: float
    center_lng: float
    days: list[Day]
    tips: list[str]
    mode: Literal["ai", "demo"]


class ReplanRequest(BaseModel):
    itinerary: Itinerary
    day_index: int
    current_time: str  # HH:MM
    reason: Reason
    note: str = ""
    current_lat: Optional[float] = None
    current_lng: Optional[float] = None


class ReplanResponse(BaseModel):
    day: Day
    explanation: str
    removed: list[str]
    added: list[str]
    mode: Literal["ai", "demo"]


class SwapRequest(BaseModel):
    itinerary: Itinerary
    day_index: int
    stop_id: str
    note: str = ""


class SwapResponse(BaseModel):
    day: Day
    old_name: str
    new_name: str
    mode: Literal["ai", "demo"]
