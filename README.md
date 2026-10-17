# GoTinerary ✈️📍

**All your travel, streamlined.** An AI trip planner that builds a day-by-day plan in seconds, and **re-plans your day live during the trip** when things change (rain, tired, running late, a place is closed, hungry).

Built for the LA Hacks AI Hackathon 2026 (Applied Intelligence track).

## Features
- **Plan a trip:** city, dates, budget, pace and interests → a full day-by-day plan with real places, lunch and dinner.
- **Real timetable:** the AI picks the places; our scheduler calculates travel time (walk or transit) between stops and builds times that actually add up.
- **Re-plan my day:** one tap rebuilds the rest of today from the current time and location. Shows what was removed and added, with Undo.
- **Swap a stop** for a similar place nearby.
- **Map** with numbered stops and route (done stops in grey, new stops in orange).
- **Weather forecast** per day, with a rain warning.
- **Directions, tickets and reservation links** for each stop.
- **Export to calendar** (.ics file).
- **Demo mode:** works with no API key (sample Paris trip), and falls back safely if the AI fails.

## Tech stack
- Frontend: React + Vite, Leaflet (OpenStreetMap tiles), Open-Meteo weather API
- Backend: Python FastAPI, Pydantic
- AI: Google Gemini (`gemini-3.8-flash`) with structured JSON output

## How it works
1. Gemini returns places as strict JSON (name, coordinates, visit length, cost, indoor/outdoor).
2. The backend scheduler uses the Haversine distance × 1.3 street factor to estimate travel (walk up to 1.5 km, otherwise transit), assigns start and end times, and moves dinner to dinner time.
3. For re-planning, stops already finished stay locked. Only the rest of the day is rebuilt, starting from where the traveler is now.

## Run it
```bash
# 1. Backend
cd backend
pip install -r requirements.txt
cp .env.example .env        # paste your Gemini key into .env
uvicorn app.main:app --reload --port 8000

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev                 # open http://localhost:5173
```
Get a free Gemini key at https://aistudio.google.com/apikey. Without a key the app runs in demo mode.

**One server option:** run `npm run build` in `frontend`, then just start the backend and open http://localhost:8000.
