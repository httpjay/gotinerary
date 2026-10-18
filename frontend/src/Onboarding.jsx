import { useState } from "react";
import { ArrowLeft, ArrowRight, Check, Coffee, Footprints, MapPin, Sparkles, Sun } from "lucide-react";
import { DIETS, INTERESTS, addDays, fmtDate } from "./lib";
import { Landscape } from "./icons";

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export const Chips = ({ options, value, onChange, multi }) => (
  <div className="chips">
    {options.map((o) => {
      const id = typeof o === "string" ? o : o.id;
      const label = typeof o === "string" ? o : o.label;
      const on = multi ? value.includes(id) : value === id;
      return (
        <button type="button" key={id} className={`chip${on ? " on" : ""}`} aria-pressed={on}
          onClick={() => onChange(multi ? (on ? value.filter((v) => v !== id) : [...value, id]) : id)}>
          {on && multi && <Check size={14} />}{label}
        </button>
      );
    })}
  </div>
);

const STEPS = ["Where", "When & who", "Your style"];
const QUESTIONS = ["Where would you like to go?", "When, and who’s coming?", "How do you like to travel?"];

export const POPULAR = [
  ["Tokyo", "Japan"], ["Kyoto", "Japan"], ["Paris", "France"], ["London", "United Kingdom"], ["New York", "United States"],
  ["Rome", "Italy"], ["Barcelona", "Spain"], ["Seoul", "South Korea"], ["Bali", "Indonesia"], ["Dubai", "UAE"],
  ["Istanbul", "Türkiye"], ["Mexico City", "Mexico"], ["Bangkok", "Thailand"], ["Lisbon", "Portugal"],
];

const PACES = [
  { id: "relaxed", label: "Relaxed", sub: "2–3 stops a day, long lunches", Icon: Coffee },
  { id: "balanced", label: "Balanced", sub: "A good mix of sights and downtime", Icon: Footprints },
  { id: "packed", label: "Packed", sub: "See as much as possible", Icon: Sun },
];
const BUDGETS = [{ id: "low", label: "Save money" }, { id: "medium", label: "Comfortable" }, { id: "high", label: "Treat myself" }];

function SoFar({ p, step, nights }) {
  const label = (list, id) => list.find((x) => x.id === id)?.label;
  const rows = [
    { k: "Destination", v: p.destination.trim(), s: 0 },
    { k: "Dates", v: step > 0 ? `${fmtDate(p.start_date)} · ${nights} ${nights === 1 ? "day" : "days"}${p.flexible_dates ? " · flexible" : ""}` : "", s: 1 },
    { k: "Travelers", v: step > 0 ? `${p.travelers}${p.origin ? ` · from ${p.origin}` : ""}` : "", s: 1 },
    { k: "Budget", v: step > 0 ? label(BUDGETS, p.budget) : "", s: 1 },
    { k: "Pace", v: step > 1 ? label(PACES, p.pace) : "", s: 2 },
    { k: "Food", v: step > 1 ? label(DIETS, p.diet) : "", s: 2 },
  ];
  return (
    <aside className="so-far" aria-label="Your trip so far">
      <div className="postcard">
        <Landscape />
        <span className="caps">Your trip, taking shape</span>
        <strong>{p.destination.trim() || "Somewhere wonderful"}</strong>
      </div>
      <ul className="so-far-list">
        {rows.map((r) => {
          const done = !!r.v && r.s < step + (r.s === 0 ? 1 : 0);
          const now = r.s === step && !done;
          return (
            <li key={r.k} className={done ? "done" : now ? "now" : ""}>
              <span className="dot">{done && <Check size={12} strokeWidth={3} />}</span>
              <span className="k">{r.k}</span>
              <span className={`v${r.v ? "" : " empty"}`}>{r.v || (now ? "In progress" : "—")}</span>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

export default function Onboarding({ onDone, loading, health, initialDestination = "" }) {
  const start = tomorrow();
  const [step, setStep] = useState(0);
  const [p, setP] = useState({
    destination: initialDestination, inspiration: "", inspiration_url: "", origin: "",
    start_date: start, end_date: addDays(start, 2), flexible_dates: false,
    travelers: 2, budget: "medium", budget_total: "", budget_includes_flights: false,
    pace: "balanced", interests: ["Food", "Local culture"], day_start: "09:00", day_end: "21:30",
    lodging: "hotel", diet: "none", allergies: "", accessibility: "", must_see: "", video_places: [],
  });
  const set = (k) => (v) => setP((x) => ({ ...x, [k]: v }));
  const nights = Math.max(1, Math.round((new Date(p.end_date) - new Date(p.start_date)) / 86400000) + 1);

  const canNext = step === 0 ? p.destination.trim().length > 1 : step === 1 ? p.end_date >= p.start_date : true;

  function submit() {
    const out = { ...p, destination: p.destination.trim(), budget_total: p.budget_total ? Number(p.budget_total) : null };
    onDone(out);
  }

  return (
    <div className="onb-grid">
      <div className="onb-main">
        <div className="steps">
          <div className="step-bars">
            {STEPS.map((s, i) => (
              <button key={s} className={`step-bar${i === step ? " on" : ""}${i < step ? " done" : ""}`}
                aria-label={`Step ${i + 1}: ${s}`} disabled={i >= step} onClick={() => i < step && setStep(i)} />
            ))}
          </div>
          <span className="caps muted">Step {step + 1} of {STEPS.length} · {STEPS[step]}</span>
        </div>
        <h1 className="q">{QUESTIONS[step]}</h1>

        {step === 0 && (
          <div className="form">
            <label className="field">
              <span className="sr-only">Destination</span>
              <div className="dest-input">
                <MapPin size={22} />
                <input autoFocus value={p.destination} placeholder="A city, a region, or a place you’ve dreamed of"
                  onChange={(e) => set("destination")(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && canNext && setStep(1)} />
              </div>
            </label>
            <div className="popular" id="popular-cities">
              <span className="caps muted">Or try a popular city</span>
              <div className="chips">
                {POPULAR.map(([city]) => (
                  <button type="button" key={city} className={`chip city${p.destination === city ? " on" : ""}`}
                    aria-pressed={p.destination === city}
                    onClick={() => set("destination")(p.destination === city ? "" : city)}>
                    {city}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="form">
            <div className="row">
              <label className="field"><span>Start date</span>
                <input type="date" value={p.start_date} onChange={(e) => {
                  const v = e.target.value;
                  setP((x) => ({ ...x, start_date: v, end_date: x.end_date < v ? addDays(v, 2) : x.end_date }));
                }} />
              </label>
              <label className="field"><span>End date</span>
                <input type="date" value={p.end_date} min={p.start_date} onChange={(e) => set("end_date")(e.target.value)} />
              </label>
            </div>
            <p className="hint">{nights} {nights === 1 ? "day" : "days"} of plans{nights > 7 ? " (we plan up to 7 days)" : ""}.</p>
            <label className="check"><input type="checkbox" checked={p.flexible_dates}
              onChange={(e) => set("flexible_dates")(e.target.checked)} /> My dates are flexible</label>
            <div className="row">
              <label className="field"><span>Travelers</span>
                <select value={p.travelers} onChange={(e) => set("travelers")(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              <label className="field"><span>Flying from <em>(city or airport)</em></span>
                <input value={p.origin} placeholder="LAX" onChange={(e) => set("origin")(e.target.value)} />
              </label>
            </div>
            <div className="field"><span>Budget</span>
              <Chips value={p.budget} onChange={set("budget")} options={BUDGETS} />
            </div>
            <div className="row">
              <label className="field"><span>Total budget in US dollars <em>(optional)</em></span>
                <input type="number" min="0" value={p.budget_total} placeholder="3000"
                  onChange={(e) => set("budget_total")(e.target.value)} />
              </label>
              <label className="check bottom"><input type="checkbox" checked={p.budget_includes_flights}
                onChange={(e) => set("budget_includes_flights")(e.target.checked)} /> Includes flights</label>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="form">
            <div className="field"><span>Pace</span>
              <div className="choice-cards" role="radiogroup" aria-label="Pace">
                {PACES.map(({ id, label, sub, Icon }) => (
                  <button type="button" key={id} role="radio" aria-checked={p.pace === id}
                    className={`choice${p.pace === id ? " on" : ""}`} onClick={() => set("pace")(id)}>
                    <Icon size={22} />
                    <strong>{label}</strong>
                    <span>{sub}</span>
                    {p.pace === id && <i className="tick"><Check size={13} strokeWidth={3} /></i>}
                  </button>
                ))}
              </div>
            </div>
            <div className="field"><span>What do you love?</span>
              <Chips multi value={p.interests} onChange={set("interests")} options={INTERESTS} />
            </div>
            <div className="row">
              <label className="field"><span>Start my day at</span>
                <input type="time" value={p.day_start} onChange={(e) => set("day_start")(e.target.value)} /></label>
              <label className="field"><span>End my day by</span>
                <input type="time" value={p.day_end} onChange={(e) => set("day_end")(e.target.value)} /></label>
            </div>
            <div className="field"><span>Food</span>
              <Chips value={p.diet} onChange={set("diet")} options={DIETS} />
            </div>
            <label className="field"><span>Allergies <em>(we will remind you to confirm with each restaurant)</em></span>
              <input value={p.allergies} placeholder="e.g. peanuts, shellfish" onChange={(e) => set("allergies")(e.target.value)} />
            </label>
            <div className="row">
              <label className="field"><span>Stay type</span>
                <select value={p.lodging} onChange={(e) => set("lodging")(e.target.value)}>
                  <option value="hotel">Hotel</option><option value="budget">Budget hotel</option>
                  <option value="hostel">Hostel</option><option value="apartment">Apartment</option>
                  <option value="luxury">Luxury hotel</option>
                </select>
              </label>
              <label className="field"><span>Accessibility needs <em>(optional)</em></span>
                <input value={p.accessibility} placeholder="e.g. wheelchair" onChange={(e) => set("accessibility")(e.target.value)} />
              </label>
            </div>
            <label className="field"><span>Places you definitely want <em>(optional)</em></span>
              <input value={p.must_see} placeholder="e.g. Fushimi Inari, a tea ceremony" onChange={(e) => set("must_see")(e.target.value)} />
            </label>
          </div>
        )}

        <div className="nav">
          {step > 0 && <button className="btn ghost" onClick={() => setStep(step - 1)}><ArrowLeft size={16} /> Back</button>}
          {step < 2 && <button className="btn primary big" disabled={!canNext} onClick={() => setStep(step + 1)}>
            Next: {STEPS[step + 1].toLowerCase()} <ArrowRight size={18} /></button>}
          {step === 2 && (
            <button className="btn primary big" disabled={loading} onClick={submit}>
              {loading ? "Finding places..." : <><Sparkles size={18} /> Find places for me</>}
            </button>
          )}
        </div>
        {step === 0 && !canNext && <p className="hint">Type a place or pick one above to continue.</p>}
        {health && !health.places && (
          <p className="hint">Note: no Google Maps key, so places will be AI estimates (not verified).</p>
        )}
      </div>

      <SoFar p={p} step={step} nights={nights} />
    </div>
  );
}
