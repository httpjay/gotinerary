import { useState } from "react";
import { INTERESTS } from "./lib";

function tomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

const Chips = ({ options, value, onChange, multi }) => (
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

export default function TripForm({ onSubmit, loading, mode }) {
  const [f, setF] = useState({
    destination: "", start_date: tomorrow(), days: 3, budget: "medium",
    pace: "balanced", interests: ["Art", "Food"], must_see: "",
  });
  const set = (k) => (v) => setF((p) => ({ ...p, [k]: v }));

  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); onSubmit(f); }}>
      <label className="field">
        <span>Where are you going?</span>
        <input required value={f.destination} placeholder="Paris, Tokyo, Mexico City..."
          onChange={(e) => set("destination")(e.target.value)} />
      </label>
      {mode === "demo" && (
        <p className="hint">Demo mode is on (no API key), so any city will show a sample Paris trip.</p>
      )}
      <div className="row">
        <label className="field">
          <span>Start date</span>
          <input type="date" value={f.start_date} onChange={(e) => set("start_date")(e.target.value)} />
        </label>
        <label className="field">
          <span>Days</span>
          <select value={f.days} onChange={(e) => set("days")(Number(e.target.value))}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} {n === 1 ? "day" : "days"}</option>)}
          </select>
        </label>
      </div>
      <div className="field">
        <span>Budget</span>
        <Chips value={f.budget} onChange={set("budget")}
          options={[{ id: "low", label: "💸 Low" }, { id: "medium", label: "💳 Medium" }, { id: "high", label: "💎 High" }]} />
      </div>
      <div className="field">
        <span>Pace</span>
        <Chips value={f.pace} onChange={set("pace")}
          options={[{ id: "relaxed", label: "🐢 Relaxed" }, { id: "balanced", label: "🚶 Balanced" }, { id: "packed", label: "🏃 Packed" }]} />
      </div>
      <div className="field">
        <span>What do you love?</span>
        <Chips multi value={f.interests} onChange={set("interests")} options={INTERESTS} />
      </div>
      <label className="field">
        <span>Anything you must see? <em>(optional)</em></span>
        <input value={f.must_see} placeholder="e.g. a jazz bar, the best croissant"
          onChange={(e) => set("must_see")(e.target.value)} />
      </label>
      <button className="btn primary big" disabled={loading}>
        {loading ? "Planning your trip..." : "✈️ Plan my trip"}
      </button>
    </form>
  );
}
