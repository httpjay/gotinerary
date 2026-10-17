"""Data models for GoTinerary.

- LLM* models: the exact JSON shape we ask Gemini to return.
- API models: what the frontend sends and receives.
Facts like rating, hours and address live in `PlaceInfo` (from Google), never
in LLM output.
"""
from typing import Literal, Optional
from pydantic import BaseModel, Field

from .providers.places import PlaceInfo


# ---------- Shapes we ask the AI model to return ----------

class LLMStop(BaseModel):
    name: str
    category: str  # sight, museum, food, cafe, park, shopping, nightlife, experience
    description: str
    why: str
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


class LLMIdea(BaseModel):
    name: str
    group: str        # video, landmark, gem
    area: str         # neighborhood
    category: str
    why: str
    duration_min: int
    est_cost_usd: int
    indoor: bool
    needs_ticket: bool
    lat: float
    lng: float


class LLMDiscovery(BaseModel):
    destination_city: str
    country: str
    airport_code: str
    center_lat: float
    center_lng: float
    summary: str
    ideas: list[LLMIdea]
    tips: list[str]


class LLMMissing(BaseModel):
    ideas: list[LLMIdea]


class LLMSeenPlace(BaseModel):
    name: str
    city: str
    country: str
    evidence: str
    confidence: str      # high, medium, low


class LLMSeen(BaseModel):
    summary: str
    places: list[LLMSeenPlace]


class LLMSocialIdea(BaseModel):
    name: str
    area: str
    category: str
    why: str
    duration_min: int
    est_cost_usd: int
    indoor: bool
    needs_ticket: bool
    lat: float
    lng: float
    source_numbers: list[int]


class LLMSocial(BaseModel):
    ideas: list[LLMSocialIdea]


# ---------- API shapes ----------

Budget = Literal["low", "medium", "high"]
Pace = Literal["relaxed", "balanced", "packed"]
Reason = Literal["rain", "tired", "late", "closed", "hungry", "custom"]
BookStatus = Literal["suggested", "selected", "awaiting", "in_progress", "confirmed", "cancelled"]


class TripRequest(BaseModel):
    destination: str = Field(min_length=2, max_length=80)
    start_date: str
    days: int = Field(ge=1, le=5)
    budget: Budget = "medium"
    pace: Pace = "balanced"
    interests: list[str] = []
    must_see: str = ""


class TripPrefs(BaseModel):
    destination: str = ""
    inspiration: str = ""          # what they saw / caption text
    inspiration_url: str = ""
    origin: str = ""               # departure city or airport
    start_date: str
    end_date: str
    flexible_dates: bool = False
    travelers: int = Field(default=1, ge=1, le=12)
    budget: Budget = "medium"
    budget_total: Optional[int] = None
    budget_includes_flights: bool = False
    pace: Pace = "balanced"
    interests: list[str] = []
    day_start: str = "09:00"
    day_end: str = "21:30"
    lodging: str = "hotel"
    diet: str = "none"             # none, vegetarian, vegan, pescatarian, halal, kosher, gluten-free
    allergies: str = ""
    accessibility: str = ""
    must_see: str = ""
    video_places: list["VideoPlace"] = []   # places found in the user's videos/screenshots


class Source(BaseModel):
    title: str
    uri: str


class VideoPlace(BaseModel):
    name: str
    city: str = ""
    evidence: str = ""        # what in the video/screenshot shows it
    confidence: str = "medium"
    source: str = ""          # "TikTok link", "Screenshot", ...


class Candidate(BaseModel):
    id: str
    name: str
    group: str                     # video, landmark, gem, missing, custom
    area: str = ""
    category: str
    why: str
    duration_min: int
    est_cost_usd: int
    indoor: bool
    needs_ticket: bool = False
    lat: float
    lng: float
    verified: bool = False
    place: Optional[PlaceInfo] = None
    priority: Literal["normal", "must"] = "normal"
    distance_km: Optional[float] = None   # from the city center
    evidence: str = ""                    # why we think it was in the user's video
    sources: list[Source] = []            # web articles (social picks)


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
    # Verification and planning details
    kind: Literal["visit", "meal"] = "visit"
    meal: str = ""                 # "lunch" or "dinner" for meals
    verified: bool = False
    place: Optional[PlaceInfo] = None
    needs_ticket: bool = False
    hours_today: str = ""
    warnings: list[str] = []
    wait_min: int = 0


class Day(BaseModel):
    day: int
    date: str
    theme: str
    stops: list[Stop]


class Unscheduled(BaseModel):
    name: str
    reason: str
    candidate_id: str = ""


class Hotel(BaseModel):
    place: PlaceInfo
    avg_km_to_stops: float
    links: dict[str, str]


class Booking(BaseModel):
    id: str
    kind: Literal["flight", "hotel", "ticket", "restaurant"]
    title: str
    detail: str = ""
    status: BookStatus = "suggested"
    est_cost_usd: Optional[int] = None
    confirmed_cost_usd: Optional[int] = None
    reference: str = ""
    link: str = ""


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
    # New planning fields (all optional so older trips still load)
    prefs: Optional[TripPrefs] = None
    country: str = ""
    airport_code: str = ""
    unscheduled: list[Unscheduled] = []
    warnings: list[str] = []
    assumptions: list[str] = []
    hotel: Optional[Hotel] = None
    verified_source: str = ""


class ReplanRequest(BaseModel):
    itinerary: Itinerary
    day_index: int
    current_time: str
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


class DiscoverResponse(BaseModel):
    destination: str
    country: str
    airport_code: str
    center_lat: float
    center_lng: float
    summary: str
    tips: list[str]
    candidates: list[Candidate]
    assumptions: list[str]
    mode: Literal["ai", "demo"]
    verified_source: str


class MissingRequest(BaseModel):
    prefs: TripPrefs
    destination: str
    center_lat: float
    center_lng: float
    selected: list[Candidate]
    rejected: list[str] = []


class SearchRequest(BaseModel):
    query: str
    destination: str
    center_lat: float
    center_lng: float


class BuildRequest(BaseModel):
    prefs: TripPrefs
    destination: str
    country: str = ""
    airport_code: str = ""
    center_lat: float
    center_lng: float
    summary: str = ""
    tips: list[str] = []
    selected: list[Candidate]
    hotel: Optional[Hotel] = None


class DayEditRequest(BaseModel):
    itinerary: Itinerary
    day_index: int
    stop_ids: list[str]            # new order; stops left out are removed
    optimize: bool = False


class DayEditResponse(BaseModel):
    day: Day
    unscheduled: list[Unscheduled]


class HotelRequest(BaseModel):
    itinerary: Itinerary


class SetHotelRequest(BaseModel):
    itinerary: Itinerary
    hotel: Optional[Hotel] = None


TripPrefs.model_rebuild()
