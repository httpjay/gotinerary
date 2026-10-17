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
  const [link, setLink] = useState({ url: "", busy: false });
  const [links, setLinks] = useState([]); // { url, readable, caption, author, note, platform }
  const [files, setFiles] = useState([]);
  const [scan, setScan] = useState({ busy: false, error: "", summary: "" });
  const [p, setP] = useState({
    destination: "", inspiration: "", inspiration_url: "", origin: "",
    start_date: start, end_date: addDays(start, 2), flexible_dates: false,
    travelers: 2, budget: "medium", budget_total: "", budget_includes_flights: false,
    pace: "balanced", interests: ["Food", "Local culture"], day_start: "09:00", day_end: "21:30",
    lodging: "hotel", diet: "none", allergies: "", accessibility: "", must_see: "", video_places: [],
  });
  const set = (k) => (v) => setP((x) => ({ ...x, [k]: v }));
  const nights = Math.max(1, Math.round((new Date(p.end_date) - new Date(p.start_date)) / 86400000) + 1);

  async function readLink() {
    const url = link.url.trim();
    if (!url || links.some((l) => l.url === url)) return;
    setLink({ url, busy: true });
    try {
      const r = await api.inspiration(url);
      setLinks((ls) => [...ls, { url, ...r }]);
    } catch (e) {
      setLinks((ls) => [...ls, { url, readable: false, note: e.message }]);
    } finally { setLink({ url: "", busy: false }); }
  }

  function addFiles(list) {
    const ok = [...list].filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    setFiles((fs) => [...fs, ...ok].slice(0, 6));
  }

  const captions = links.filter((l) => l.caption).map((l) => `${l.platform} caption: ${l.caption}`).join("\n");

  async function findInReels() {
    setScan({ busy: true, error: "", summary: "" });
    try {
      const r = await api.mediaPlaces(files, [captions, p.inspiration].filter(Boolean).join("\n"));
      const names = new Set(p.video_places.map((v) => v.name.toLowerCase()));
      setP((x) => ({ ...x, video_places: [...x.video_places, ...r.places.filter((v) => !names.has(v.name.toLowerCase()))] }));
      setScan({ busy: false, error: r.places.length ? "" : "We couldn't find a clear place. Try a screenshot that shows the name or caption.", summary: r.summary });
    } catch (e) { setScan({ busy: false, error: e.message, summary: "" }); }
  }

  const canNext = step === 0 ? (p.destination.trim() || p.inspiration.trim() || captions || p.video_places.length) : step === 1 ? p.end_date >= p.start_date : true;

  function submit() {
    const out = { ...p, budget_total: p.budget_total ? Number(p.budget_total) : null,
      inspiration: [captions, p.inspiration].filter(Boolean).join("\n"), inspiration_url: links.map((l) => l.url).join(" ") };
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
          <div className="reelbox">
            <div className="reel-title">📱 Inspired by TikTok or Instagram reels? <em>(optional)</em></div>
            <div className="inline">
              <input value={link.url} placeholder="Paste a TikTok, Instagram or YouTube link"
                onChange={(e) => setLink({ ...link, url: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), readLink())} />
              <button type="button" className="btn" disabled={link.busy || !link.url.trim()} onClick={readLink}>
                {link.busy ? "Reading..." : "+ Add link"}
              </button>
            </div>
            {links.map((l) => (
              <div key={l.url} className={`linkitem ${l.readable ? "ok" : "warn"}`}>
                <span>{l.readable ? "✓" : "⚠"}</span>
                <div>
                  <strong>{l.platform === "tiktok" ? "TikTok" : l.platform === "instagram" ? "Instagram" : l.platform === "youtube" ? "YouTube" : "Link"}</strong>
                  {l.author ? ` · @${l.author}` : ""}
                  <div className="muted-sm">{l.readable ? `Caption: “${l.caption.slice(0, 140)}${l.caption.length > 140 ? "…" : ""}”` : l.note}</div>
                </div>
                <button type="button" className="x" onClick={() => setLinks((ls) => ls.filter((x) => x.url !== l.url))}>✕</button>
              </div>
            ))}

            <label className="drop" onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
              <input type="file" accept="image/*,video/*" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
              <span className="drop-icon">🎬</span>
              <span><strong>Add screenshots or a screen recording</strong> of the reels<br />
                <span className="muted-sm">Works for Instagram and TikTok. Gemini watches the video and reads on-screen text.</span></span>
            </label>
            {files.length > 0 && (
              <div className="files">
                {files.map((f, i) => (
                  <span key={i} className="file">{f.type.startsWith("video/") ? "🎥" : "🖼️"} {f.name.slice(0, 22)}
                    <button type="button" className="x" onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button></span>
                ))}
              </div>
            )}
            {(files.length > 0 || captions) && (
              <button type="button" className="btn primary" disabled={scan.busy || !health || health.mode !== "ai"} onClick={findInReels}>
                {scan.busy ? "🔍 Watching your reels..." : "🔍 Find places in my reels"}
              </button>
            )}
            {health && health.mode !== "ai" && (files.length > 0 || captions) && <p className="hint warn">Reading reels needs a Gemini key.</p>}
            {scan.error && <p className="hint warn">⚠ {scan.error}</p>}
            {p.video_places.length > 0 && (
              <div className="vplaces">
                {scan.summary && <p className="muted-sm">🎞 {scan.summary}</p>}
                {p.video_places.map((v) => (
                  <div key={v.name} className="vplace">
                    <div><strong>📍 {v.name}</strong>{v.city ? <span className="muted-sm">, {v.city}</span> : null}
                      <span className={`conf ${v.confidence}`}>{v.confidence === "high" ? "Clearly shown" : "Probably"}</span>
                      <div className="muted-sm">{v.source}: {v.evidence}</div></div>
                    <button type="button" className="x" title="Remove" onClick={() => set("video_places")(p.video_places.filter((x) => x.name !== v.name))}>✕</button>
                  </div>
                ))}
              </div>
            )}
            <p className="hint">Your files are sent to Google Gemini only to read them. We don't save them.</p>
          </div>
          <label className="field">
            <span>Or describe what you saw or want</span>
            <textarea rows={2} value={p.inspiration}
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
      {step === 0 && !canNext && <p className="hint center">Type a place, add a reel, or describe what you saw, to continue.</p>}
      {health && !health.places && (
        <p className="hint center">Note: no Google Maps key, so places will be AI estimates (not verified).</p>
      )}
    </div>
  );
}
