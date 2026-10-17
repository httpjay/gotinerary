"""Place data provider (Google Places API New).

Kept behind a small interface so another provider can replace it later.
All facts shown to users as "verified" (address, location, rating, review
count, opening hours) come from here, never from the AI model.
"""
import asyncio
import json
import logging
import os
import time
from pathlib import Path
from typing import Optional

import httpx
from pydantic import BaseModel

log = logging.getLogger("gotinerary.places")

BASE = "https://places.googleapis.com/v1"
CACHE_FILE = Path(__file__).resolve().parents[2] / ".cache" / "places.json"

# Field masks decide what Google bills, so we ask only for what we show.
VISIT_FIELDS = ",".join([
    "places.id", "places.displayName", "places.formattedAddress", "places.location",
    "places.rating", "places.userRatingCount", "places.regularOpeningHours",
    "places.priceLevel", "places.types", "places.primaryType", "places.googleMapsUri",
    "places.websiteUri", "places.photos", "places.businessStatus",
])
FOOD_FIELDS = VISIT_FIELDS + ",places.servesVegetarianFood"


class PlaceInfo(BaseModel):
    place_id: str
    name: str
    address: str = ""
    lat: float
    lng: float
    rating: Optional[float] = None
    rating_count: Optional[int] = None
    price_level: Optional[str] = None
    types: list[str] = []
    primary_type: str = ""
    maps_url: str = ""
    website: str = ""
    photo: str = ""            # photo resource name (shown via our /api/photo proxy)
    photo_credit: str = ""
    hours_text: list[str] = []
    periods: list[dict] = []   # raw Google opening periods, used by hours.py
    business_status: str = ""
    serves_vegetarian: Optional[bool] = None
    source: str = "Google"
    retrieved_at: str = ""


def api_key() -> str:
    return os.getenv("GOOGLE_MAPS_API_KEY", "").strip()


def enabled() -> bool:
    return bool(api_key())


# ---------- tiny cache (saves free quota during the demo) ----------
_cache: dict[str, list[dict]] = {}
_cache_loaded = False
_lock = asyncio.Lock()


def _load_cache():
    global _cache_loaded
    if _cache_loaded:
        return
    _cache_loaded = True
    try:
        _cache.update(json.loads(CACHE_FILE.read_text()))
    except Exception:  # noqa: BLE001
        pass


def _save_cache():
    try:
        CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        CACHE_FILE.write_text(json.dumps(_cache))
    except Exception:  # noqa: BLE001
        log.warning("could not save places cache")


def _parse(p: dict) -> PlaceInfo:
    loc = p.get("location", {})
    hours = p.get("regularOpeningHours") or {}
    photo, credit = "", ""
    if p.get("photos"):
        ph = p["photos"][0]
        photo = ph.get("name", "")
        authors = ph.get("authorAttributions") or []
        credit = ", ".join(a.get("displayName", "") for a in authors if a.get("displayName"))
    return PlaceInfo(
        place_id=p.get("id", ""),
        name=(p.get("displayName") or {}).get("text", ""),
        address=p.get("formattedAddress", ""),
        lat=loc.get("latitude", 0.0), lng=loc.get("longitude", 0.0),
        rating=p.get("rating"), rating_count=p.get("userRatingCount"),
        price_level=p.get("priceLevel"),
        types=p.get("types", []), primary_type=p.get("primaryType", ""),
        maps_url=p.get("googleMapsUri", ""), website=p.get("websiteUri", ""),
        photo=photo, photo_credit=credit,
        hours_text=hours.get("weekdayDescriptions", []),
        periods=hours.get("periods", []),
        business_status=p.get("businessStatus", ""),
        serves_vegetarian=p.get("servesVegetarianFood"),
        retrieved_at=time.strftime("%Y-%m-%d %H:%M"),
    )


async def search_text(query: str, lat: float | None = None, lng: float | None = None,
                      radius_m: float = 30000, included_type: str | None = None,
                      min_rating: float | None = None, limit: int = 5,
                      food: bool = False) -> list[PlaceInfo]:
    """Text search. Returns [] when the key is missing or the call fails."""
    if not enabled():
        return []
    body: dict = {"textQuery": query, "pageSize": limit, "languageCode": "en"}
    if lat is not None and lng is not None:
        body["locationBias"] = {"circle": {"center": {"latitude": lat, "longitude": lng},
                                           "radius": float(min(radius_m, 50000))}}
    if included_type:
        body["includedType"] = included_type
    if min_rating:
        body["minRating"] = min_rating
    fields = FOOD_FIELDS if food else VISIT_FIELDS
    key = json.dumps([body, fields], sort_keys=True)

    async with _lock:
        _load_cache()
        if key in _cache:
            return [PlaceInfo(**d) for d in _cache[key]]

    headers = {"Content-Type": "application/json", "X-Goog-Api-Key": api_key(),
               "X-Goog-FieldMask": fields}
    for attempt in range(2):  # one retry on network or server errors
        try:
            async with httpx.AsyncClient(timeout=15) as c:
                r = await c.post(f"{BASE}/places:searchText", json=body, headers=headers)
            if r.status_code >= 500 and attempt == 0:
                continue
            if r.status_code != 200:
                log.warning("Places search failed %s: %s", r.status_code, r.text[:300])
                return []
            places = [_parse(p) for p in r.json().get("places", [])]
            async with _lock:
                _cache[key] = [p.model_dump() for p in places]
                _save_cache()
            return places
        except httpx.HTTPError as e:
            log.warning("Places network error: %s", e)
            if attempt == 1:
                return []
    return []


async def photo_url(name: str, width: int = 480) -> str | None:
    """Turn a photo resource name into a short-lived image URL (key stays on the server)."""
    if not enabled() or not name.startswith("places/"):
        return None
    url = f"{BASE}/{name}/media"
    params = {"maxWidthPx": width, "skipHttpRedirect": "true", "key": api_key()}
    try:
        async with httpx.AsyncClient(timeout=15) as c:
            r = await c.get(url, params=params)
        if r.status_code == 200:
            return r.json().get("photoUri")
        log.warning("photo failed %s %s", r.status_code, r.text[:200])
    except httpx.HTTPError as e:
        log.warning("photo network error: %s", e)
    return None
