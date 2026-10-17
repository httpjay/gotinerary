import { useEffect, useMemo, useState } from "react";
import "leaflet/dist/leaflet.css";
import "./App.css";
import TripForm from "./TripForm";
import MapView from "./MapView";
import {
  api, CATEGORY_ICON, REASONS, bookLink, downloadICS, fetchWeather,
  fmtDate, fmtTime, mapsLink, nowHHMM, toMin,
} from "./lib";

const LOADING_LINES = [
  "Finding the best places...",
  "Checking what's close together...",
  "Building your timetable...",
  "Adding lunch and dinner spots...",
];

function Logo() {
  return (
    <div className="logo">
      <span className="logo-pin">📍</span>
      <span className="go">GO</span><span className="tin">TINERARY</span>
    </div>
  );
}

function Leg({ stop }) {
  if (!stop.travel_min) return null;
  const walk = stop.travel_mode === "walk";
  return (
    <div className="leg">
      <span>{walk ? "🚶" : "🚇"}</span>
      {stop.travel_min} min {walk ? "walk" : "by metro, bus or taxi"} · {stop.distance_km} km
    </div>
  );
}

function FreeTime({ prev, stop }) {
  if (!prev || !stop.start_time || !prev.end_time) return null;
  const gap = toMin(stop.start_time) - toMin(prev.end_time) - stop.travel_min;
  if (gap < 20) return null;
  const h = Math.floor(gap / 60), m = gap % 60;
  return <div className="free">☕ Free time · {h ? `${h} h ` : ""}{m ? `${m} min` : ""}</div>;
}

function StopCard({ stop, n, city, active, onSelect, onSwap, swapping }) {
  return (
    <div className={`stop ${stop.status}${active ? " active" : ""}`} onClick={() => onSelect(stop.id)}>
      <div className={`num num-${stop.status}`}>{stop.status === "done" ? "✓" : n}</div>
      <div className="stop-body">
        <div className="stop-top">
          <span className="time">{fmtTime(stop.start_time)} to {fmtTime(stop.end_time)}</span>
          {stop.status === "new" && <span className="badge new">NEW</span>}
          <span className={`badge ${stop.indoor ? "in" : "out"}`}>{stop.indoor ? "Indoor" : "Outdoor"}</span>
        </div>
        <h4>{CATEGORY_ICON[stop.category] || "📍"} {stop.name}</h4>
        <p className="desc">{stop.description}</p>
        {stop.why && stop.why !== stop.description && <p className="why">💡 {stop.why}</p>}
        <div className="stop-foot">
          <span className="cost">{stop.est_cost_usd ? `~$${stop.est_cost_usd}` : "Free"}</span>
          <div className="actions" onClick={(e) => e.stopPropagation()}>
            {stop.status !== "done" && (
              <button className="btn tiny" disabled={swapping} onClick={() => onSwap(stop.id)}>
                {swapping ? "..." : "🔄 Swap"}
              </button>
            )}
            <a className="btn tiny" href={mapsLink(stop, city)} target="_blank" rel="noreferrer">🧭 Directions</a>
            <a className="btn tiny" href={bookLink(stop, city)} target="_blank" rel="noreferrer">
              {stop.category === "food" || stop.category === "cafe" ? "📅 Reserve" : "🎟️ Tickets"}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReplanPanel({ onReplan, busy, isToday }) {
  const [open, setOpen] = useState(false);
  const [time, setTime] = useState(isToday ? nowHHMM() : "13:30");
  const [note, setNote] = useState("");
  const [useGps, setUseGps] = useState(false);
  const [reason, setReason] = useState(null);

  const go = (r) => {
    setReason(r);
    if (r === "custom" && !note.trim()) return;
    onReplan({ reason: r, current_time: time, note, useGps });
  };

  if (!open) {
    return (
      <button className="replan-cta" onClick={() => setOpen(true)}>
        <span className="pulse" /> Plans changed? <strong>Re-plan my day</strong>
      </button>
    );
  }
  return (
    <div className="replan">
      <div className="replan-head">
        <strong>⚡ Re-plan the rest of today</strong>
        <button className="x" onClick={() => setOpen(false)}>✕</button>
      </div>
      <div className="replan-row">
        <label>Time now
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="gps">
          <input type="checkbox" checked={useGps} onChange={(e) => setUseGps(e.target.checked)} />
          Use my location
        </label>
      </div>
      <div className="reasons">
        {REASONS.map((r) => (
          <button key={r.id} disabled={busy} className={`reason${reason === r.id ? " on" : ""}`} onClick={() => go(r.id)}>
            <span>{r.icon}</span>{r.label}
          </button>
        ))}
      </div>
      {reason === "custom" && (
        <div className="custom">
          <input autoFocus value={note} placeholder="e.g. I want to see a sunset spot"
            onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && go("custom")} />
          <button className="btn primary" disabled={busy || !note.trim()} onClick={() => go("custom")}>Go</button>
        </div>
      )}
      {busy && <div className="thinking">Rebuilding your day...</div>}
    </div>
  );
}

export default function App() {
  const [mode, setMode] = useState("ai");
  const [it, setIt] = useState(null);
  const [dayIdx, setDayIdx] = useState(0);
  const [loading, setLoading] = useState(false);
  const [line, setLine] = useState(0);
  const [error, setError] = useState("");
  const [focusId, setFocusId] = useState(null);
  const [weather, setWeather] = useState({});
  const [busy, setBusy] = useState(false);
  const [swapping, setSwapping] = useState(null);
  const [change, setChange] = useState(null); // { explanation, removed, added, prev }
  const [me, setMe] = useState(null);

  useEffect(() => { api.health().then((h) => setMode(h.mode)).catch(() => {}); }, []);
  useEffect(() => {
    if (!loading) return;
    const t = setInterval(() => setLine((l) => (l + 1) % LOADING_LINES.length), 1600);
    return () => clearInterval(t);
  }, [loading]);

  const day = it?.days[dayIdx];
  const center = useMemo(() => (it ? { lat: it.center_lat, lng: it.center_lng } : { lat: 34.05, lng: -118.25 }), [it]);
  const total = it ? it.days.reduce((a, d) => a + d.stops.reduce((b, s) => b + s.est_cost_usd, 0), 0) : 0;
  const todayIso = new Date().toISOString().slice(0, 10);

  async function plan(form) {
    setLoading(true); setError(""); setChange(null);
    try {
      const res = await api.plan(form);
      setIt(res); setDayIdx(0); setFocusId(null);
      fetchWeather(res.center_lat, res.center_lng, res.start_date, res.days.length)
        .then(setWeather).catch(() => setWeather({}));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function getGps() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null), { timeout: 6000 });
    });
  }

  async function replan({ reason, current_time, note, useGps }) {
    setBusy(true); setError("");
    try {
      const pos = useGps ? await getGps() : null;
      setMe(pos);
      const res = await api.replan({
        itinerary: it, day_index: dayIdx, current_time, reason, note,
        current_lat: pos?.lat ?? null, current_lng: pos?.lng ?? null,
      });
      const prev = it;
      setIt({ ...it, days: it.days.map((d, i) => (i === dayIdx ? res.day : d)) });
      setChange({ explanation: res.explanation, removed: res.removed, added: res.added, prev });
      setFocusId(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function swap(stopId) {
    setSwapping(stopId); setError("");
    try {
      const res = await api.swap({ itinerary: it, day_index: dayIdx, stop_id: stopId });
      const prev = it;
      setIt({ ...it, days: it.days.map((d, i) => (i === dayIdx ? res.day : d)) });
      setChange({ explanation: `Swapped ${res.old_name} for ${res.new_name}.`, removed: [res.old_name], added: [res.new_name], prev });
    } catch (e) {
      setError(e.message);
    } finally {
      setSwapping(null);
    }
  }

  return (
    <div className="app">
      <aside className="panel">
        <header className="top">
          <Logo />
          <span className={`mode ${mode}`}>{mode === "ai" ? "✨ AI by Gemini" : "🧪 Demo mode"}</span>
        </header>

        {!it && (
          <section className="hero">
            <h1>All your travel,<br /><span>streamlined.</span></h1>
            <p>People spend <strong>17 hours and 42 minutes</strong> planning one trip.
              GoTinerary does it in seconds, and fixes your plan <em>during</em> the trip when things change.</p>
            <TripForm onSubmit={plan} loading={loading} mode={mode} />
            {loading && <div className="loading"><div className="spinner" />{LOADING_LINES[line]}</div>}
          </section>
        )}

        {error && <div className="error">⚠️ {error}</div>}

        {it && (
          <section className="trip">
            <div className="trip-head">
              <div>
                <h2>{it.destination}</h2>
                <p className="muted">{fmtDate(it.start_date)} · {it.days.length} {it.days.length === 1 ? "day" : "days"} · about ${total} per person</p>
              </div>
              <div className="trip-actions">
                <button className="btn" onClick={() => downloadICS(it)}>📅 Add to calendar</button>
                <button className="btn ghost" onClick={() => { setIt(null); setChange(null); setMe(null); }}>New trip</button>
              </div>
            </div>
            <p className="summary">{it.summary}</p>

            <div className="tabs">
              {it.days.map((d, i) => {
                const w = weather[d.date];
                return (
                  <button key={d.day} className={`tab${i === dayIdx ? " on" : ""}`}
                    onClick={() => { setDayIdx(i); setFocusId(null); setChange(null); }}>
                    <span className="tab-day">Day {d.day}</span>
                    <span className="tab-date">{fmtDate(d.date)}</span>
                    {w && <span className="tab-w">{w.icon} {w.max}°</span>}
                  </button>
                );
              })}
            </div>

            {day && (
              <>
                <h3 className="theme">{day.theme}</h3>
                {weather[day.date] && weather[day.date].rain >= 50 && (
                  <div className="nudge">🌧️ {weather[day.date].rain}% chance of rain on this day. If it rains, tap <strong>Re-plan my day</strong> for indoor options.</div>
                )}

                <ReplanPanel onReplan={replan} busy={busy} isToday={day.date === todayIso} />

                {change && (
                  <div className="change">
                    <p>🤖 {change.explanation}</p>
                    <div className="diff">
                      {change.removed.map((n) => <span key={`r-${n}`} className="rm">− {n}</span>)}
                      {change.added.map((n) => <span key={`a-${n}`} className="add">+ {n}</span>)}
                    </div>
                    <button className="btn tiny" onClick={() => { setIt(change.prev); setChange(null); }}>↩ Undo</button>
                  </div>
                )}

                <div className="timeline">
                  {day.stops.map((s, i) => (
                    <div key={s.id}>
                      <FreeTime prev={day.stops[i - 1]} stop={s} />
                      <Leg stop={s} />
                      <StopCard stop={s} n={i + 1} city={it.destination} active={focusId === s.id}
                        onSelect={setFocusId} onSwap={swap} swapping={swapping === s.id} />
                    </div>
                  ))}
                </div>

                {it.tips?.length > 0 && (
                  <div className="tips">
                    <h4>Local tips</h4>
                    <ul>{it.tips.map((t) => <li key={t}>{t}</li>)}</ul>
                  </div>
                )}
              </>
            )}
          </section>
        )}
      </aside>

      <main className="map-wrap">
        <MapView day={day} center={center} focusId={focusId} onSelect={setFocusId} me={me} />
        {!it && <div className="map-hint">Your trip will appear here 🗺️</div>}
      </main>
    </div>
  );
}
