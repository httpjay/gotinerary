import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, MapPin, ShieldCheck, Sparkles, TriangleAlert, X } from "lucide-react";
import "leaflet/dist/leaflet.css";
import "./App.css";
import Welcome from "./Welcome";
import Onboarding from "./Onboarding";
import Discover from "./Discover";
import Trip from "./Trip";
import MapView from "./MapView";
import { Mark } from "./icons";
import {
  api, deleteTrip, deriveBookings, fetchWeather, fmtDate, fmtTime, loadTrips, saveTrip,
} from "./lib";

const LOADING = {
  discover: ["Reading your inspiration...", "Finding famous sights...", "Looking for hidden gems...", "Checking every place with Google..."],
  build: ["Grouping places by area...", "Checking opening hours for each date...", "Finding restaurants for your diet...", "Building a timetable that works..."],
};

function Logo({ onClick }) {
  return (
    <button className="wordmark logo" onClick={onClick} aria-label="GoTinerary home">
      <Mark size={28} /><span>GoTinerary</span>
    </button>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning." : h < 18 ? "Good afternoon." : "Good evening.";
}

function SavedTrips({ saved, onOpen, onDelete }) {
  if (!saved.length) return null;
  return (
    <div className="saved">
      <h4 className="caps muted">Your saved trips <em>· this browser</em></h4>
      {saved.map((t) => (
        <div key={t.id} className="saved-row">
          <button className="saved-open" onClick={() => onOpen(t)}>
            <MapPin size={16} /> <strong>{t.it?.destination || t.disc?.destination}</strong>
            <span className="muted">{fmtDate(t.prefs.start_date)}</span>
            <ArrowRight size={16} className="saved-go" />
          </button>
          <button className="icon-btn" title="Delete saved trip" aria-label="Delete saved trip" onClick={() => onDelete(t.id)}><X size={16} /></button>
        </div>
      ))}
    </div>
  );
}

const newId = () => Math.random().toString(36).slice(2, 10);

export default function App() {
  const [health, setHealth] = useState(null);
  const [stage, setStage] = useState("welcome"); // welcome | start | discover | trip
  const [startCity, setStartCity] = useState("");
  const [trip, setTrip] = useState(null); // { id, prefs, disc, extra, choice, it, bookings }
  const [loading, setLoading] = useState(null);
  const [line, setLine] = useState(0);
  const [error, setError] = useState("");
  const [focusId, setFocusId] = useState(null);
  const [dayIdx, setDayIdx] = useState(0);
  const [tab, setTab] = useState("plan");
  const [weather, setWeather] = useState({});
  const [me, setMe] = useState(null);
  const [saved, setSaved] = useState(loadTrips());
  const panelRef = useRef(null);
  useEffect(() => { panelRef.current?.scrollTo(0, 0); }, [stage, tab]);

  useEffect(() => { api.health().then(setHealth).catch(() => setHealth({ mode: "demo", places: false })); }, []);
  useEffect(() => {
    if (!loading) return;
    setLine(0);
    const t = setInterval(() => setLine((l) => (l + 1) % LOADING[loading].length), 1800);
    return () => clearInterval(t);
  }, [loading]);
  // Save the trip in this browser whenever it changes.
  useEffect(() => { if (trip?.it) { saveTrip(trip); setSaved(loadTrips()); } }, [trip]);
  useEffect(() => {
    if (!trip?.it) return;
    fetchWeather(trip.it.center_lat, trip.it.center_lng, trip.it.start_date, trip.it.days.length)
      .then(setWeather).catch(() => setWeather({}));
  }, [trip?.it?.start_date, trip?.it?.center_lat]); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = (p) => setTrip((t) => ({ ...t, ...p }));
  const setIt = (it) => setTrip((t) => ({ ...t, it, bookings: deriveBookings(it, t.bookings) }));

  async function discover(prefs) {
    setLoading("discover"); setError("");
    try {
      const disc = await api.discover(prefs);
      const choice = Object.fromEntries(disc.candidates.filter((c) => c.group === "video").map((c) => [c.id, "save"]));
      const id = newId();
      setTrip({ id, prefs, disc, extra: [], choice, it: null, bookings: [], social: { status: "loading", note: "" } });
      setStage("discover"); setFocusId(null);
      loadSocial(id, prefs, disc);
    } catch (e) { setError(e.message); } finally { setLoading(null); }
  }

  // "Popular on social media" loads in the background, so the page shows right away.
  async function loadSocial(id, prefs, disc) {
    try {
      const r = await api.socialPicks({ prefs, destination: disc.destination, country: disc.country,
        center_lat: disc.center_lat, center_lng: disc.center_lng, skip: disc.candidates.map((c) => c.name) });
      setTrip((t) => (t && t.id === id ? { ...t, extra: [...t.extra, ...r.candidates],
        social: { status: "done", note: r.note, count: r.candidates.length } } : t));
    } catch (e) {
      setTrip((t) => (t && t.id === id ? { ...t, social: { status: "done", note: e.message } } : t));
    }
  }

  async function build(selected) {
    setLoading("build"); setError("");
    try {
      const d = trip.disc;
      const it = await api.build({ prefs: trip.prefs, destination: d.destination, country: d.country,
        airport_code: d.airport_code, center_lat: d.center_lat, center_lng: d.center_lng,
        summary: d.summary, tips: d.tips, selected, hotel: trip.it?.hotel || null });
      setTrip((t) => ({ ...t, it, bookings: deriveBookings(it, t.bookings) }));
      setStage("trip"); setDayIdx(0); setTab("plan"); setFocusId(null);
    } catch (e) { setError(e.message); } finally { setLoading(null); }
  }

  function openSaved(t) {
    setTrip(t); setStage(t.it ? "trip" : "discover"); setDayIdx(0); setTab("plan"); setError("");
  }

  const reset = (to = "start") => { setStage(to); setTrip(null); setError(""); setMe(null); setWeather({}); };
  const plan = (city = "") => { setStartCity(city); setStage("start"); setError(""); };
  const removeSaved = (id) => { deleteTrip(id); setSaved(loadTrips()); };
  const savedList = <SavedTrips saved={saved} onOpen={openSaved} onDelete={removeSaved} />;

  // ----- Map points for the current screen -----
  const day = stage === "trip" && trip?.it ? trip.it.days[Math.min(dayIdx, trip.it.days.length - 1)] : null;
  const points = useMemo(() => {
    if (stage === "discover" && trip) {
      const all = [...trip.disc.candidates, ...trip.extra];
      return all.map((c) => {
        const st = trip.choice[c.id];
        return { id: c.id, lat: c.lat, lng: c.lng, icon: c.category,
          status: st === "must" || st === "save" ? "picked" : st === "skip" ? "skipped" : "idle",
          title: c.name, sub: c.verified ? `Verified · ${c.place?.source || "Google"}` : "AI estimate" };
      });
    }
    if (day) {
      return day.stops.map((s, i) => ({ id: s.id, lat: s.lat, lng: s.lng,
        label: s.kind === "meal" ? null : i + 1, icon: s.kind === "meal" ? "food" : null,
        status: s.status === "upcoming" && s.kind === "meal" ? "meal" : s.status,
        title: s.name, sub: `${fmtTime(s.start_time)} to ${fmtTime(s.end_time)}` }));
    }
    return [];
  }, [stage, trip, day]);
  const center = trip?.disc ? { lat: trip.disc.center_lat, lng: trip.disc.center_lng } : { lat: 34.05, lng: -118.25 };

  if (stage === "welcome") {
    return <Welcome onPlan={plan} hasSaved={saved.length > 0} savedList={savedList} />;
  }

  return (
    <div className={`app${stage === "start" ? " solo" : ""}`}>
      <aside className="panel" ref={panelRef}>
        <header className="top">
          <Logo onClick={() => reset("welcome")} />
          <div className="modes">
            <span className={`mode ${health?.mode || "demo"}`}>
              {health?.mode === "ai" ? <><Sparkles size={14} /> Gemini</> : "Demo mode"}</span>
            <span className={`mode ${health?.places ? "ai" : "demo"}`}>
              {health?.places ? <><ShieldCheck size={14} /> Google Places</> : "No places key"}</span>
          </div>
        </header>

        {error && <div className="error" role="alert"><TriangleAlert size={18} /> {error}</div>}
        {loading && <div className="loading-bar" role="status"><div className="spinner" />{LOADING[loading][line]}</div>}

        {stage === "start" && (
          <section className="hero">
            <p className="greet">{greeting()}</p>
            <Onboarding key={startCity} onDone={discover} loading={loading === "discover"} health={health}
              initialDestination={startCity} />
            {savedList}
          </section>
        )}

        {stage === "discover" && trip && (
          <>
            <div className="backrow">
              <button className="btn ghost" onClick={() => reset()}><ArrowLeft size={16} /> Start over</button>
              {trip.it && <button className="btn ghost" onClick={() => setStage("trip")}>Back to my plan <ArrowRight size={16} /></button>}
            </div>
            <Discover disc={trip.disc} prefs={trip.prefs} social={trip.social}
              onRetrySocial={() => { patch({ social: { status: "loading", note: "" } }); loadSocial(trip.id, trip.prefs, trip.disc); }} onBuild={build} building={loading === "build"}
              focusId={focusId} setFocusId={setFocusId}
              extra={trip.extra} setExtra={(f) => setTrip((t) => ({ ...t, extra: typeof f === "function" ? f(t.extra) : f }))}
              choice={trip.choice} setChoice={(f) => setTrip((t) => ({ ...t, choice: typeof f === "function" ? f(t.choice) : f }))} />
          </>
        )}

        {stage === "trip" && trip?.it && (
          <Trip it={trip.it} setIt={setIt} bookings={trip.bookings} setBookings={(b) => patch({ bookings: b })}
            dayIdx={Math.min(dayIdx, trip.it.days.length - 1)} setDayIdx={setDayIdx} weather={weather}
            focusId={focusId} setFocusId={setFocusId} setMe={setMe} setError={setError}
            tab={tab} setTab={setTab} onBack={() => setStage("discover")} onNew={() => reset()} />
        )}
      </aside>

      {stage !== "start" && <main className="map-wrap">
        <MapView points={points} route={stage === "trip"} center={center} focusId={focusId} onSelect={setFocusId}
          me={me} hotel={stage === "trip" ? trip?.it?.hotel?.place : null} />
        {stage === "discover" && <div className="map-legend"><span className="lg picked" /> Picked <span className="lg idle" /> Not picked <span className="lg skipped" /> Skipped</div>}
        {stage === "trip" && <div className="map-legend"><span className="lg route" /> Today’s route <span className="lg meal" /> Meal <span className="lg done" /> Done</div>}
      </main>}
    </div>
  );
}
