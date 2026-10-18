# GoTinerary

**All your travel, streamlined.**

GoTinerary turns a destination into a realistic, day-by-day trip in minutes. Places are checked against Google, visits fit real opening hours, meals match your diet, and you get a clear list of what still needs booking. When plans change during the trip, one tap re-plans the rest of your day.

Built solo for the **LA Hacks AI Hackathon 2026** · Track: **Applied Intelligence**

---

## The problem

Many travelers come home a little disappointed, not because the place was bad, but because the trip wasn't planned well: a museum was closed that day, two sights were on opposite sides of the city, or there was nothing to eat for their diet. Good planning takes time. People spend about **17 hours and 42 minutes** planning a single trip (Go City Trip Planning Survey, 2024).

## What it does

1. **Welcome → Plan my trip.** A short, guided start in three steps:
   - **Where:** type a city or pick a popular one.
   - **When & who:** dates (flexible or fixed), travelers, departure airport, budget.
   - **Your style:** interests, pace, day start and end times, diet, allergies, stay type, accessibility, must-see places.
2. **Discover places** in three groups:
   - *Popular on social media:* found by Gemini with Google Search. Every pick links to the web article it came from.
   - *Must-see landmarks* and *Hidden gems*.
   - Each card shows a **Verified · Google** or **AI estimate** badge, Google rating and review count, photo, opening hours, visit length and a ticket hint.
   - **Add**, **Must-do** or **Skip** each place, or add your own. **"What might I be missing?"** suggests nearby places without forcing them in.
3. **Build the itinerary** with a rule-based engine:
   - groups places by area into days, with must-dos first
   - **never schedules a place on a day it's closed**, and fits each visit inside its opening hours
   - adds travel time (walk or transit) and small delay buffers
   - orders the route to avoid zigzagging (nearest-neighbor + 2-opt, meals kept in place)
   - adds lunch and dinner from **real nearby restaurants that fit your diet**, with an allergy reminder
   - lists anything that doesn't fit, with the reason
4. **Edit** a day (move, remove, optimize the route), **swap** a place or restaurant, and **undo**.
5. **Re-plan my day** during the trip: it's raining, I'm tired, running late, a place is closed, I'm hungry, or something else. Only the rest of today is rebuilt.
6. **Stay & flights.** Well-rated stays near your planned stops, with Booking.com, Expedia and Google Hotels links. Choosing a stay re-times every day from the hotel. Prefilled Google Flights, Kayak and Expedia searches.
7. **Bookings dashboard.** Flight, stay, tickets and dinner reservations with statuses (Suggested, Selected, Awaiting booking, In progress, Confirmed, Cancelled), booking references and costs. Weather per day, calendar export (.ics) and copy-as-text. Trips are saved in your browser.

## Honest by design

- The AI **suggests ideas**. Names, locations, ratings, review counts and opening hours come from **Google Places**.
- Anything not verified is labeled **AI estimate**. Travel times and costs are marked **est.**
- We **don't show flight or hotel prices** we can't verify. We link to real provider searches instead.
- We **never book or pay** for you. You book on the provider's site and mark it confirmed.
- For allergies, we always say **confirm with the restaurant**.

## How it works

```
Browser (React)
   │
   ▼
FastAPI backend
   ├── Gemini ............ ideas, explanations, re-planning (structured JSON)
   ├── Gemini + Google Search grounding ... "Popular on social media" picks with sources
   ├── Google Places API (New) ........... verification, ratings, photos, opening hours
   └── Rule-based engine (no AI)
         ├── hours.py ....... opening windows for each date
         ├── scheduling.py .. travel time, buffers, timetable, route optimizer
         └── engine.py ...... day grouping, meals, conflicts, hotels
```

## Tech stack

- **Frontend:** React + Vite, Leaflet + OpenStreetMap, Open-Meteo weather, lucide icons
- **Backend:** Python, FastAPI, Pydantic, httpx
- **AI:** Google Gemini (`gemini-3.8-flash`) with structured output and Google Search grounding, with automatic retries and saved answers for rate limits
- **Data:** Google Places API (New): Text Search and Place Photos, behind a small provider interface with caching
- **Design:** designed in **Paper** ("nature meets sunshine": forest green, terracotta, warm cream; Fraunces + Manrope), then turned into code through Paper's MCP connection

## Run it locally

**Requirements:** Python 3.10+, Node.js 18+, a Gemini API key, and a Google Maps Platform key with **Places API (New)** enabled.

```bash
# 1. Backend
cd backend
pip install -r requirements.txt
cp .env.example .env        # then add your keys to .env
uvicorn app.main:app --reload --port 8000

# 2. Frontend (in a second terminal)
cd frontend
npm install
npm run dev                 # open http://localhost:5173
```

`.env` needs:
```
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-3.8-flash
GOOGLE_MAPS_API_KEY=your-maps-key
```

- Check the setup at `http://localhost:8000/api/health`. It should show `"mode":"ai"` and `"places":true`.
- Without a Gemini key, the app runs in **demo mode** with sample Paris data.
- Without a Maps key, places are shown as **AI estimates** (clearly labeled).

## Tests

```bash
cd backend
python tests/test_flow.py
```
This runs the full journey with fake Google and Gemini data: a museum closed on Mondays, an unverified place, diet and allergies, day edits, and a hotel change.

## What's next

- Live flight and hotel prices through official partner APIs
- Exact transit times with Google Routes
- "Ask GoTinerary": edit the plan in plain language
- Shared trips for groups, and multi-city trips

## Built with AI tools

I used AI coding assistants (Claude) during the build, and Paper's design agent for the screens.
