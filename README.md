# GoTinerary ✈️📍

**Saw it on TikTok? Let's make it a real trip.** GoTinerary turns a video or an idea into a realistic, day-by-day plan: places **checked against Google**, real opening hours, restaurants for your diet, a route that doesn't zigzag, and a clear list of what still needs booking. During the trip, one tap **re-plans the rest of your day** when it rains, you're tired, or a place is closed.

Built solo for the LA Hacks AI Hackathon 2026 (Applied Intelligence track). Based on an idea first pitched with my team at the LMU BEST Entrepreneurship Bootcamp; rebuilt from scratch for this hackathon.

## The journey
1. **Onboarding (3 short steps):** destination *or* a TikTok/YouTube link plus what you saw → dates, travelers, budget → pace, interests, day hours, diet, allergies, stay type, must-sees.
   - **Reels → places:** paste TikTok / Instagram / YouTube links (TikTok and YouTube captions are read through their public oEmbed), and/or **upload screenshots or a screen recording of any reel**. Gemini (multimodal) watches the video, reads on-screen text and captions, and lists the places it can actually see, each with its evidence ("On-screen text says ..."). Low-confidence guesses are dropped.
2. **Discovery:** groups: *From your reels* (with the evidence), *Popular on social media* (Gemini + Google Search grounding; every pick links to the web article it came from, clearly labeled as not TikTok's own data), *From your video*, *Must-see landmarks*, *Hidden gems*. Each card shows a **✓ Verified · Google** or **⚠ AI estimate** badge, rating and review count (with source), photo, hours, visit length, cost estimate, ticket hint, distance. Add / Must-do / Skip / add your own place. **"What might I be missing?"** suggests nearby places without forcing them in.
3. **Itinerary engine (rule-based):** groups places into days by area, respects must-dos, **never schedules a place on a day it's closed**, fits visits inside opening hours, adds travel time + delay buffers, orders the route (nearest-neighbor + 2-opt), and adds lunch and dinner from real nearby restaurants that fit the diet. Anything that can't fit is listed with a reason.
4. **Edit:** reorder, remove, optimize a day, swap a place or restaurant; only that day is rebuilt. **Re-plan my day** for live changes.
5. **Stay & flights:** well-rated stays near the middle of your plan, with prefilled Booking.com / Expedia / Google Hotels links. Choosing a stay re-times every day from the hotel. Prefilled Google Flights / Kayak / Expedia searches.
6. **Bookings dashboard:** flight, stay, tickets and dinner reservations with statuses (Suggested → Selected → Awaiting → In progress → Confirmed / Cancelled), booking references, estimated vs confirmed costs, warnings. Export to calendar or copy as text. Trips are saved in the browser.

## Honesty rules (by design)
- The AI only suggests ideas and explanations. **Names, locations, ratings, review counts and opening hours come from Google Places**, never from the AI.
- Unverified items are clearly marked **AI estimate**; travel times and costs are marked **est.**
- We **don't show flight or hotel prices** we can't verify; we link to real provider searches instead.
- We **never book or pay**. Users mark bookings as confirmed themselves.
- Allergies: we always say "confirm with the restaurant"; we never guarantee allergen safety.

## Tech
- **Frontend:** React + Vite, Leaflet + OpenStreetMap, Open-Meteo weather
- **Backend:** Python FastAPI, Pydantic
- **AI:** Google Gemini (`gemini-3.8-flash`), structured JSON output
- **Place data:** Google Places API (New): Text Search + Place Photos, behind a small provider interface (`backend/app/providers/places.py`) with caching and retries
- **Social links:** TikTok / YouTube public oEmbed (caption + creator). Instagram doesn't allow apps to read reels without Meta approval, so users add a screenshot or screen recording instead, which Gemini reads (`backend/app/social_ai.py`).
- **Social picks:** Gemini with Google Search grounding; picks without a real source are dropped.
- **Rule-based modules:** `hours.py` (opening hours per date), `scheduling.py` (travel, buffers, timetable, route optimizer), `engine.py` (day grouping, meals, conflicts, hotels)

## Run it
```bash
# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env     # add GEMINI_API_KEY and GOOGLE_MAPS_API_KEY
uvicorn app.main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
npm run dev              # open http://localhost:5173
```
- **Google Maps key:** enable **Places API (New)** in Google Cloud. Without it, places are AI estimates (clearly labeled).
- **No Gemini key:** demo mode with sample Paris data.

## Tests
`cd backend && python tests/test_flow.py`: full journey with fake Google and Gemini data (closed-on-Monday museum, unverified place, diet, allergies, edits, hotel change).

## Not built yet (next steps)
Live flight and hotel prices (need provider access), assisted booking, Yelp reviews, Google Routes API for exact transit times, user accounts, multi-city trips.
