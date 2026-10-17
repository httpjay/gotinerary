import { useState } from "react";
import {
  CATEGORY_ICON, REASONS, STATUS, api, bookLink, downloadICS, flightLinks, fmtDate, fmtTime,
  mapsLink, nearbyFoodLink, nowHHMM, photoSrc, shareText, toMin,
} from "./lib";
import { Rating, Verified } from "./Discover";

function Leg({ stop }) {
  if (!stop.travel_min) return null;
  const walk = stop.travel_mode === "walk";
  return (
    <div className="leg" title="Estimate: straight-line distance × 1.3, plus a small delay buffer">
      <span>{walk ? "🚶" : "🚇"}</span>
      {stop.travel_min} min {walk ? "walk" : "by metro, bus or taxi"} · {stop.distance_km} km <em>est.</em>
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

function StopCard({ stop, n, city, active, onSelect, onSwap, swapping, onMove, onRemove, first, last, editing }) {
  const meal = stop.kind === "meal";
  return (
    <div className={`stop ${stop.status}${active ? " active" : ""}${meal ? " meal" : ""}`} onClick={() => onSelect(stop.id)}>
      <div className={`num num-${stop.status}`}>{stop.status === "done" ? "✓" : n}</div>
      <div className="stop-body">
        <div className="stop-top">
          <span className="time">{fmtTime(stop.start_time)} to {fmtTime(stop.end_time)}</span>
          {stop.status === "new" && <span className="badge new">NEW</span>}
          {meal && <span className="badge meal">{stop.meal === "dinner" ? "Dinner" : stop.meal === "lunch" ? "Lunch" : "Meal"}</span>}
          <Verified c={stop} small />
        </div>
        <h4>{CATEGORY_ICON[stop.category] || "📍"} {stop.name}</h4>
        {stop.place?.rating && <div><Rating place={stop.place} /></div>}
        <p className="desc">{stop.description}</p>
        {stop.why && stop.why !== stop.description && <p className="why">💡 {stop.why}</p>}
        <div className="facts">
          {stop.hours_today && <span title={`Opening hours on this date, from ${stop.place?.source || "Google"}`}>🕘 {stop.hours_today}</span>}
          {stop.needs_ticket && <span>🎟 Ticket likely <em>est.</em></span>}
          <span>{stop.est_cost_usd ? `~$${stop.est_cost_usd} pp` : "Free"} <em>est.</em></span>
        </div>
        {stop.warnings?.length > 0 && (
          <ul className="swarn">{stop.warnings.map((w) => <li key={w}>⚠ {w}</li>)}</ul>
        )}
        <div className="stop-foot" onClick={(e) => e.stopPropagation()}>
          {editing ? (
            <div className="actions">
              <button className="btn tiny" disabled={first} onClick={() => onMove(stop.id, -1)}>↑</button>
              <button className="btn tiny" disabled={last} onClick={() => onMove(stop.id, 1)}>↓</button>
              <button className="btn tiny danger" onClick={() => onRemove(stop.id)}>Remove</button>
            </div>
          ) : (
            <div className="actions">
              {stop.status !== "done" && (
                <button className="btn tiny" disabled={swapping} onClick={() => onSwap(stop.id)}>
                  {swapping ? "..." : meal ? "🔄 Other restaurant" : "🔄 Swap"}
                </button>
              )}
              {meal && !stop.verified
                ? <a className="btn tiny" href={nearbyFoodLink(stop)} target="_blank" rel="noreferrer">🔍 Food nearby</a>
                : <a className="btn tiny" href={mapsLink(stop, city)} target="_blank" rel="noreferrer">🧭 Map</a>}
              {(stop.needs_ticket || (meal && stop.verified)) && (
                <a className="btn tiny" href={bookLink(stop, city)} target="_blank" rel="noreferrer">
                  {meal ? "📅 Reserve" : "🎟️ Tickets"}
                </a>
              )}
            </div>
          )}
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
      <div className="replan-head"><strong>⚡ Re-plan the rest of today</strong>
        <button className="x" onClick={() => setOpen(false)}>✕</button></div>
      <div className="replan-row">
        <label>Time now <input type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
        <label className="gps"><input type="checkbox" checked={useGps} onChange={(e) => setUseGps(e.target.checked)} /> Use my location</label>
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
          <input autoFocus value={note} placeholder="e.g. I want a sunset spot" onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go("custom")} />
          <button className="btn primary" disabled={busy || !note.trim()} onClick={() => go("custom")}>Go</button>
        </div>
      )}
      {busy && <div className="thinking">Rebuilding your day...</div>}
    </div>
  );
}

// ---------------- Plan tab ----------------
function PlanTab({ it, setIt, dayIdx, setDayIdx, weather, focusId, setFocusId, setMe, setError }) {
  const [busy, setBusy] = useState(false);
  const [swapping, setSwapping] = useState(null);
  const [change, setChange] = useState(null);
  const [editing, setEditing] = useState(false);
  const [dayUn, setDayUn] = useState([]);
  const day = it.days[dayIdx];
  const todayIso = new Date().toISOString().slice(0, 10);

  const putDay = (newDay) => ({ ...it, days: it.days.map((d, i) => (i === dayIdx ? newDay : d)) });

  async function getGps() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null), { timeout: 6000 });
    });
  }

  async function replan({ reason, current_time, note, useGps }) {
    setBusy(true); setError("");
    try {
      const pos = useGps ? await getGps() : null;
      setMe(pos);
      const res = await api.replan({ itinerary: it, day_index: dayIdx, current_time, reason, note,
        current_lat: pos?.lat ?? null, current_lng: pos?.lng ?? null });
      setChange({ explanation: res.explanation, removed: res.removed, added: res.added, prev: it });
      setIt(putDay(res.day));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function swap(stopId) {
    setSwapping(stopId); setError("");
    try {
      const res = await api.swap({ itinerary: it, day_index: dayIdx, stop_id: stopId });
      setChange({ explanation: `Swapped ${res.old_name} for ${res.new_name}.`, removed: [res.old_name], added: [res.new_name], prev: it });
      setIt(putDay(res.day));
    } catch (e) { setError(e.message); } finally { setSwapping(null); }
  }

  async function edit(ids, optimize = false) {
    setBusy(true); setError("");
    try {
      const res = await api.editDay({ itinerary: it, day_index: dayIdx, stop_ids: ids, optimize });
      const prev = it;
      setIt(putDay(res.day));
      setDayUn(res.unscheduled);
      const lost = res.unscheduled.map((u) => u.name);
      setChange({ explanation: optimize ? "Re-ordered this day for the shortest route." : "Updated this day and re-checked times and opening hours.",
        removed: lost, added: [], prev });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const ids = day.stops.map((s) => s.id);
  const move = (id, dir) => {
    const i = ids.indexOf(id); const j = i + dir;
    const next = [...ids]; [next[i], next[j]] = [next[j], next[i]];
    edit(next);
  };
  const remove = (id) => edit(ids.filter((x) => x !== id));

  return (
    <>
      <div className="tabs">
        {it.days.map((d, i) => {
          const w = weather[d.date];
          return (
            <button key={d.day} className={`tab${i === dayIdx ? " on" : ""}`}
              onClick={() => { setDayIdx(i); setFocusId(null); setChange(null); setDayUn([]); }}>
              <span className="tab-day">Day {d.day}</span>
              <span className="tab-date">{fmtDate(d.date)}</span>
              {w && <span className="tab-w">{w.icon} {w.max}°</span>}
            </button>
          );
        })}
      </div>

      <div className="theme-row">
        <h3 className="theme">{day.theme}</h3>
        <div className="actions">
          <button className="btn tiny" disabled={busy} onClick={() => edit(ids, true)}>🧭 Optimize route</button>
          <button className={`btn tiny${editing ? " on" : ""}`} onClick={() => setEditing(!editing)}>{editing ? "Done editing" : "✏️ Edit day"}</button>
        </div>
      </div>
      {weather[day.date]?.rain >= 50 && (
        <div className="nudge">🌧️ {weather[day.date].rain}% chance of rain. If it rains, tap <strong>Re-plan my day</strong> for indoor options.</div>
      )}

      <ReplanPanel onReplan={replan} busy={busy} isToday={day.date === todayIso} />

      {change && (
        <div className="change">
          <p>🤖 {change.explanation}</p>
          <div className="diff">
            {change.removed.map((n) => <span key={`r-${n}`} className="rm">− {n}</span>)}
            {change.added.map((n) => <span key={`a-${n}`} className="add">+ {n}</span>)}
          </div>
          <button className="btn tiny" onClick={() => { setIt(change.prev); setChange(null); setDayUn([]); }}>↩ Undo</button>
        </div>
      )}
      {dayUn.length > 0 && (
        <div className="conflicts">{dayUn.map((u) => <div key={u.name}>⚠ <strong>{u.name}</strong>: {u.reason}</div>)}</div>
      )}

      <div className="timeline">
        {day.stops.length === 0 && <p className="hint">No stops on this day. Go back to places to add more.</p>}
        {day.stops.map((s, i) => (
          <div key={s.id}>
            <FreeTime prev={day.stops[i - 1]} stop={s} />
            <Leg stop={s} />
            <StopCard stop={s} n={i + 1} city={it.destination} active={focusId === s.id} onSelect={setFocusId}
              onSwap={swap} swapping={swapping === s.id} onMove={move} onRemove={remove}
              first={i === 0} last={i === day.stops.length - 1} editing={editing} />
          </div>
        ))}
      </div>

      {it.tips?.length > 0 && (
        <div className="tips"><h4>Local tips</h4><ul>{it.tips.map((t) => <li key={t}>{t}</li>)}</ul></div>
      )}
    </>
  );
}

// ---------------- Stay & flights tab ----------------
function StayTab({ it, setIt, setError }) {
  const [hotels, setHotels] = useState(null);
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(null);
  const [note, setNote] = useState("");
  const fl = flightLinks(it);
  const p = it.prefs || {};

  async function find() {
    setBusy(true); setError("");
    try { setHotels(await api.hotels(it)); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function choose(h) {
    setChoosing(h?.place.place_id || "none"); setError("");
    try {
      const res = await api.setHotel(it, h);
      setIt(res);
      setNote(h ? `Your days now start and end at ${h.place.name}, and all times were checked again.` : "Removed the stay.");
    } catch (e) { setError(e.message); } finally { setChoosing(null); }
  }

  return (
    <div className="stay">
      <section className="panel-card">
        <h3>✈️ Flights</h3>
        <p className="muted-sm">{p.origin || "Your city"} → {it.airport_code || it.destination} · {fmtDate(it.start_date)} to {fmtDate(p.end_date || it.days[it.days.length - 1].date)} · {p.travelers || 1} traveler(s)</p>
        <div className="linkrow">
          {Object.entries(fl).map(([k, v]) => <a key={k} className="btn" href={v} target="_blank" rel="noreferrer">Search on {k} ↗</a>)}
        </div>
        <p className="hint">Live flight prices are not connected yet. These buttons open real searches with your dates filled in. Prices change often, so compare total price, bags and change rules there.</p>
        {!p.origin && <p className="hint warn">Tip: add your departure airport (for example LAX) for better links.</p>}
      </section>

      <section className="panel-card">
        <h3>🏨 Where to stay</h3>
        <p className="muted-sm">We look for well-rated stays close to the middle of your planned stops.</p>
        {it.hotel && (
          <div className="chosen"><span>✓ Staying at <strong>{it.hotel.place.name}</strong> ({it.hotel.avg_km_to_stops} km average to your stops)</span>
            <button className="btn tiny" disabled={!!choosing} onClick={() => choose(null)}>Remove</button></div>
        )}
        {note && <div className="change"><p>🤖 {note}</p></div>}
        {!hotels && <button className="btn primary" disabled={busy} onClick={find}>{busy ? "Searching..." : "Find stays near my plan"}</button>}
        {hotels && hotels.length === 0 && <p className="hint">No stays found. A Google Maps key is needed for this.</p>}
        <div className="hotels">
          {hotels?.map((h) => (
            <div key={h.place.place_id} className={`hotel${it.hotel?.place.place_id === h.place.place_id ? " on" : ""}`}>
              {h.place.photo ? <img src={photoSrc(h.place.photo, 400)} alt={h.place.name} loading="lazy" /> : <div className="dphoto-empty">🏨</div>}
              <div className="hbody">
                <strong>{h.place.name}</strong>
                <Rating place={h.place} />
                <span className="muted-sm">{h.place.address}</span>
                <span className="muted-sm">📍 {h.avg_km_to_stops} km average to your stops</span>
                <div className="linkrow">
                  {Object.entries(h.links).map(([k, v]) => <a key={k} className="btn tiny" href={v} target="_blank" rel="noreferrer">{k} ↗</a>)}
                </div>
                {it.hotel?.place.place_id === h.place.place_id
                  ? <span className="added">✓ Your stay</span>
                  : <button className="btn tiny primary" disabled={!!choosing} onClick={() => choose(h)}>
                    {choosing === h.place.place_id ? "Updating plan..." : "Choose this stay"}
                  </button>}
              </div>
            </div>
          ))}
        </div>
        {hotels?.length > 0 && <p className="hint">Prices: we don't show prices we can't verify. Open a provider to see the real total with taxes and the cancellation policy.</p>}
      </section>
    </div>
  );
}

// ---------------- Bookings tab ----------------
function BookingsTab({ it, bookings, setBookings }) {
  const [copied, setCopied] = useState(false);
  const upd = (id, patch) => setBookings(bookings.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const open = bookings.filter((b) => !["confirmed", "cancelled"].includes(b.status));
  const est = bookings.reduce((a, b) => a + (b.est_cost_usd || 0), 0);
  const conf = bookings.reduce((a, b) => a + (b.status === "confirmed" ? (b.confirmed_cost_usd || 0) : 0), 0);
  const visitsCost = it.days.reduce((a, d) => a + d.stops.reduce((x, s) => x + s.est_cost_usd, 0), 0) * (it.prefs?.travelers || 1);
  const budget = it.prefs?.budget_total;
  const icon = { flight: "✈️", hotel: "🏨", ticket: "🎟️", restaurant: "🍽️" };

  return (
    <div className="book">
      <div className="kpis">
        <div><span>To book</span><strong>{open.length}</strong></div>
        <div><span>Confirmed</span><strong>{bookings.filter((b) => b.status === "confirmed").length}</strong></div>
        <div><span>Activities and food <em>est.</em></span><strong>${visitsCost.toLocaleString()}</strong></div>
        <div><span>Confirmed spend</span><strong>${conf.toLocaleString()}</strong></div>
      </div>
      {budget && (
        <p className={`hint${visitsCost > budget ? " warn" : ""}`}>
          Your budget: ${budget.toLocaleString()} {it.prefs.budget_includes_flights ? "(including flights)" : "(not including flights)"}.
          Activities and food are about ${visitsCost.toLocaleString()}; add flights and your stay once you know the prices.
        </p>
      )}

      {(it.warnings?.length > 0 || it.unscheduled?.length > 0) && (
        <div className="conflicts">
          {it.unscheduled?.map((u) => <div key={u.name}>⚠ <strong>{u.name}</strong> was not scheduled: {u.reason}</div>)}
          {it.warnings?.map((w) => <div key={w}>ℹ️ {w}</div>)}
        </div>
      )}

      <p className="hint">GoTinerary never books or pays for you. Book on the provider's site, then mark the item <strong>Confirmed</strong> and add your booking reference.</p>
      <div className="blist">
        {bookings.map((b) => (
          <div key={b.id} className={`bitem s-${b.status}`}>
            <div className="bhead">
              <span className="bicon">{icon[b.kind]}</span>
              <div className="bt"><strong>{b.title}</strong><span className="muted-sm">{b.detail}</span></div>
              <select value={b.status} onChange={(e) => upd(b.id, { status: e.target.value })}>
                {STATUS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div className="brow">
              {b.est_cost_usd ? <span className="muted-sm">~${b.est_cost_usd} est.</span> : <span />}
              <input placeholder="Booking reference" value={b.reference || ""} onChange={(e) => upd(b.id, { reference: e.target.value })} />
              <input type="number" placeholder="Paid ($)" value={b.confirmed_cost_usd ?? ""}
                onChange={(e) => upd(b.id, { confirmed_cost_usd: e.target.value === "" ? null : Number(e.target.value) })} />
              {b.link && <a className="btn tiny" href={b.link} target="_blank" rel="noreferrer">Open ↗</a>}
            </div>
          </div>
        ))}
      </div>
      {est > 0 && <p className="muted-sm">Estimated tickets and dinners: about ${est.toLocaleString()} for your group.</p>}

      <div className="linkrow">
        <button className="btn" onClick={() => downloadICS(it)}>📅 Add to calendar</button>
        <button className="btn" onClick={() => { navigator.clipboard?.writeText(shareText(it)); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? "✓ Copied" : "📋 Copy trip as text"}
        </button>
      </div>
    </div>
  );
}

export default function Trip(props) {
  const { it, tab, setTab } = props;
  const toBook = props.bookings.filter((b) => !["confirmed", "cancelled"].includes(b.status)).length;
  return (
    <section className="trip">
      <div className="trip-head">
        <div>
          <h2>{it.destination}</h2>
          <p className="muted">{fmtDate(it.start_date)} · {it.days.length} {it.days.length === 1 ? "day" : "days"}
            {it.verified_source && <> · <span className="vtext">✓ Places checked with {it.verified_source}</span></>}</p>
        </div>
        <div className="trip-actions">
          <button className="btn ghost" onClick={props.onBack}>← Places</button>
          <button className="btn ghost" onClick={props.onNew}>New trip</button>
        </div>
      </div>
      {it.summary && <p className="summary">{it.summary}</p>}
      {it.unscheduled?.length > 0 && tab === "plan" && (
        <div className="conflicts">{it.unscheduled.map((u) => <div key={u.name}>⚠ <strong>{u.name}</strong> didn't fit: {u.reason}</div>)}</div>
      )}
      <div className="maintabs">
        <button className={tab === "plan" ? "on" : ""} onClick={() => setTab("plan")}>🗓 Plan</button>
        <button className={tab === "stay" ? "on" : ""} onClick={() => setTab("stay")}>🏨 Stay & flights</button>
        <button className={tab === "book" ? "on" : ""} onClick={() => setTab("book")}>✅ Bookings{toBook ? <span className="pill">{toBook}</span> : null}</button>
      </div>
      {tab === "plan" && <PlanTab {...props} />}
      {tab === "stay" && <StayTab {...props} />}
      {tab === "book" && <BookingsTab {...props} />}
    </section>
  );
}
