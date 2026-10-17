import { useState } from "react";
import { DIETS, INTERESTS, addDays, api } from "./lib";

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
        <button type="button" key={id} className={`chip${on ? " on" : ""}`}
          onClick={() => onChange(multi ? (on ? value.filter((v) => v !== id) : [...value, id]) : id)}>
          {label}
        </button>
      );
    })}
  </div>
);

const STEPS = ["Where", "When & who", "Your style"];

export default function Onboarding({ onDone, loading, health }) {
  const start = tomorrow();
  const [step, setStep] = useState(0);
  const [link, setLink] = useState({ url: "", busy: false, result: null });
  const [p, setP] = useState({
    destination: "", inspiration: "", inspiration_url: "", origin: "",
    start_date: start, end_date: addDays(start, 2), flexible_dates: false,
    travelers: 2, budget: "medium", budget_total: "", budget_includes_flights: false,
    pace: "balanced", interests: ["Food", "Local culture"], day_start: "09:00", day_end: "21:30",
    lodging: "hotel", diet: "none", allergies: "", accessibility: "", must_see: "",
  });
  const set = (k) => (v) => setP((x) => ({ ...x, [k]: v }));
  const nights = Math.max(1, Math.round((new Date(p.end_date) - new Date(p.start_date)) / 86400000) + 1);

  async function readLink() {
    if (!link.url.trim()) return;
    setLink((l) => ({ ...l, busy: true, result: null }));
    try {
      const r = await api.inspiration(link.url);
      setLink((l) => ({ ...l, busy: false, result: r }));
      setP((x) => ({ ...x, inspiration_url: link.url,
        inspiration: r.caption ? `${r.caption}${x.inspiration ? `\n${x.inspiration}` : ""}` : x.inspiration }));
    } catch (e) {
      setLink((l) => ({ ...l, busy: false, result: { readable: false, note: e.message } }));
    }
  }

  const canNext = step === 0 ? (p.destination.trim() || p.inspiration.trim()) : step === 1 ? p.end_date >= p.start_date : true;

  function submit() {
    const out = { ...p, budget_total: p.budget_total ? Number(p.budget_total) : null };
    onDone(out);
  }

  return (
    <div className="onb">
      <div className="steps">
        {STEPS.map((s, i) => (
          <button key={s} className={`step-dot${i === step ? " on" : ""}${i < step ? " done" : ""}`}
            onClick={() => i < step && setStep(i)}>
            <span>{i < step ? "✓" : i + 1}</span>{s}
          </button>
        ))}
      </div>

      {step === 0 && (
        <div className="form">
          <label className="field">
            <span>Where do you want to go?</span>
            <input autoFocus value={p.destination} placeholder="Kyoto, Lisbon, Mexico City... (or leave empty)"
              onChange={(e) => set("destination")(e.target.value)} />
          </label>
          <div className="or">or start from something you saw</div>
          <div className="field">
            <span>📱 Paste a TikTok or YouTube link <em>(optional)</em></span>
            <div className="inline">
              <input value={link.url} placeholder="https://www.tiktok.com/@creator/video/..."
                onChange={(e) => setLink({ ...link, url: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), readLink())} />
              <button type="button" className="btn" disabled={link.busy || !link.url.trim()} onClick={readLink}>
                {link.busy ? "Reading..." : "Read link"}
              </button>
            </div>
            {link.result && (
              <p className={`hint ${link.result.readable ? "ok" : "warn"}`}>
                {link.result.readable
                  ? `✓ Read the caption${link.result.author ? ` from @${link.result.author}` : ""}. You can edit it below.`
                  : `⚠ ${link.result.note}`}
              </p>
            )}
          </div>
          <label className="field">
            <span>Describe what you saw or want</span>
            <textarea rows={3} value={p.inspiration}
              placeholder="e.g. Red gates on a mountain path at sunrise, a bamboo forest, and a street food market"
              onChange={(e) => set("inspiration")(e.target.value)} />
          </label>
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
            <Chips value={p.budget} onChange={set("budget")}
              options={[{ id: "low", label: "💸 Save money" }, { id: "medium", label: "💳 Comfortable" }, { id: "high", label: "💎 Treat myself" }]} />
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
          <div className="field"><span>What do you love?</span>
            <Chips multi value={p.interests} onChange={set("interests")} options={INTERESTS} />
          </div>
          <div className="field"><span>Pace</span>
            <Chips value={p.pace} onChange={set("pace")}
              options={[{ id: "relaxed", label: "🐢 Relaxed" }, { id: "balanced", label: "🚶 Balanced" }, { id: "packed", label: "🏃 Packed" }]} />
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
        {step > 0 && <button className="btn ghost" onClick={() => setStep(step - 1)}>← Back</button>}
        {step < 2 && <button className="btn primary big grow" disabled={!canNext} onClick={() => setStep(step + 1)}>Next →</button>}
        {step === 2 && (
          <button className="btn primary big grow" disabled={loading} onClick={submit}>
            {loading ? "Finding places..." : "✨ Find places for me"}
          </button>
        )}
      </div>
      {step === 0 && !canNext && <p className="hint center">Type a place, or describe what you saw, to continue.</p>}
      {health && !health.places && (
        <p className="hint center">Note: no Google Maps key, so places will be AI estimates (not verified).</p>
      )}
    </div>
  );
}
