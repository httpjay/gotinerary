import { useMemo, useState } from "react";
import { CATEGORY_ICON, GROUPS, api, photoSrc, toMin } from "./lib";

export function Verified({ c, small }) {
  if (c.verified) {
    return <span className={`vbadge ok${small ? " sm" : ""}`} title={`Name, location, rating and hours from ${c.place?.source || "Google"}, retrieved ${c.place?.retrieved_at || ""}`}>✓ Verified · {c.place?.source || "Google"}</span>;
  }
  return <span className={`vbadge est${small ? " sm" : ""}`} title="Suggested by AI and not found in Google Places. Check it before you go.">⚠ AI estimate</span>;
}

export function Rating({ place }) {
  if (!place?.rating) return null;
  return (
    <span className="rating">★ {place.rating.toFixed(1)}
      <span className="muted-sm"> ({(place.rating_count || 0).toLocaleString()} {place.source} reviews)</span>
    </span>
  );
}

function hrs(min) {
  const h = min / 60;
  return h < 1 ? `${min} min` : `${Math.round(h * 10) / 10} h`;
}

function Card({ c, state, onSet, onFocus, focused }) {
  const [showHours, setShowHours] = useState(false);
  return (
    <div className={`dcard ${state || ""}${focused ? " focused" : ""}`} onMouseEnter={() => onFocus(c.id)}>
      <div className="dphoto">
        {c.place?.photo
          ? <img src={photoSrc(c.place.photo)} alt={c.name} loading="lazy" />
          : <div className="dphoto-empty">{CATEGORY_ICON[c.category] || "📍"}</div>}
        {state === "must" && <span className="must-tag">⭐ Must-do</span>}
        {c.place?.photo_credit && <span className="credit">Photo: {c.place.photo_credit}</span>}
      </div>
      <div className="dbody">
        <div className="dtop"><Verified c={c} small /><Rating place={c.place} /></div>
        <h4>{CATEGORY_ICON[c.category] || "📍"} {c.name}</h4>
        <p className="muted-sm">{c.place?.address || c.area}</p>
        {c.evidence && <p className="evidence">📱 In your reel: {c.evidence}</p>}
        <p className="why">{c.why}</p>
        {c.sources?.length > 0 && (
          <p className="sources">Source{c.sources.length > 1 ? "s" : ""}: {c.sources.map((s, i) => (
            <a key={s.uri} href={s.uri} target="_blank" rel="noreferrer">{s.title}{i < c.sources.length - 1 ? ", " : ""}</a>))}</p>
        )}
        <div className="facts">
          <span title="Estimated visit length">⏱ {hrs(c.duration_min)}</span>
          <span title="Estimated cost per person">{c.est_cost_usd ? `~$${c.est_cost_usd}` : "Free"} <em>est.</em></span>
          {c.needs_ticket && <span title="Estimate: usually needs a ticket or reservation">🎟 Ticket likely</span>}
          {c.distance_km != null && <span>📍 {c.distance_km} km from center</span>}
        </div>
        {c.place?.hours_text?.length > 0 && (
          <button className="linkish" onClick={() => setShowHours(!showHours)}>
            {showHours ? "Hide" : "Show"} opening hours <em>({c.place.source})</em>
          </button>
        )}
        {showHours && <ul className="hours">{c.place.hours_text.map((h) => <li key={h}>{h}</li>)}</ul>}
        <div className="dactions">
          <button className={`pick${state === "save" ? " on" : ""}`} onClick={() => onSet(c.id, state === "save" ? null : "save")}>✓ Add</button>
          <button className={`pick star${state === "must" ? " on" : ""}`} onClick={() => onSet(c.id, state === "must" ? "save" : "must")}>⭐ Must-do</button>
          <button className={`pick skip${state === "skip" ? " on" : ""}`} onClick={() => onSet(c.id, state === "skip" ? null : "skip")}>✕ Skip</button>
        </div>
      </div>
    </div>
  );
}

export default function Discover({ disc, prefs, social, onBuild, building, focusId, setFocusId, extra, setExtra, choice, setChoice }) {
  const [missingBusy, setMissingBusy] = useState(false);
  const [missing, setMissing] = useState(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState(null);
  const [searchBusy, setSearchBusy] = useState(false);
  const [err, setErr] = useState("");

  const all = useMemo(() => [...disc.candidates, ...extra], [disc, extra]);
  const set = (id, v) => setChoice((c) => ({ ...c, [id]: v }));
  const selected = all.filter((c) => choice[c.id] === "save" || choice[c.id] === "must");
  const totalMin = selected.reduce((a, c) => a + c.duration_min, 0);
  const days = Math.max(1, Math.round((new Date(prefs.end_date) - new Date(prefs.start_date)) / 86400000) + 1);
  const availMin = Math.min(days, 7) * Math.max(0, toMin(prefs.day_end) - toMin(prefs.day_start) - 135) * 0.72;
  const tooMuch = totalMin > availMin;

  async function findMissing() {
    setMissingBusy(true); setErr("");
    try {
      const rejected = all.filter((c) => choice[c.id] === "skip").map((c) => c.name);
      const res = await api.missing({ prefs, destination: disc.destination, center_lat: disc.center_lat,
        center_lng: disc.center_lng, selected, rejected });
      const names = new Set(all.map((c) => c.name.toLowerCase()));
      setMissing(res.filter((c) => !names.has(c.name.toLowerCase())));
    } catch (e) { setErr(e.message); } finally { setMissingBusy(false); }
  }

  async function search() {
    if (!q.trim()) return;
    setSearchBusy(true); setErr("");
    try {
      setFound(await api.search({ query: q, destination: disc.destination, center_lat: disc.center_lat, center_lng: disc.center_lng }));
    } catch (e) { setErr(e.message); } finally { setSearchBusy(false); }
  }

  function addExtra(c, state = "save") {
    setExtra((x) => (x.some((y) => y.id === c.id) ? x : [...x, c]));
    set(c.id, state);
  }

  const build = () => onBuild(selected.map((c) => ({ ...c, priority: choice[c.id] === "must" ? "must" : "normal" })));

  return (
    <div className="discover">
      <div className="disc-head">
        <h2>{disc.destination}{disc.country ? <span className="muted">, {disc.country}</span> : null}</h2>
        <p className="summary">{disc.summary}</p>
        {disc.assumptions?.length > 0 && (
          <div className="assume">
            <strong>We assumed:</strong> {disc.assumptions.join(" ")} <em>You can change these by going back.</em>
          </div>
        )}
        {!disc.verified_source && (
          <div className="nudge warn">⚠ No Google Maps key: all places are AI estimates and are not verified.</div>
        )}
        <p className="muted-sm">Tap <strong>Add</strong> on places you like, <strong>Must-do</strong> on places you can't miss, and <strong>Skip</strong> the rest.</p>
      </div>

      {err && <div className="error">⚠️ {err}</div>}

      {GROUPS.map((g) => {
        const items = all.filter((c) => c.group === g.id);
        if (g.id === "social" && !items.length) {
          if (!social || (social.status === "done" && !social.note)) return null;
          return (
            <section key={g.id} className="dgroup">
              <h3>{g.title}</h3>
              <p className="muted-sm">{g.sub}</p>
              {social.status === "loading"
                ? <div className="loading-inline"><div className="spinner" /> Searching recent articles about TikTok and Instagram spots...</div>
                : <p className="hint">{social.note}</p>}
            </section>
          );
        }
        if (!items.length) return null;
        return (
          <section key={g.id} className="dgroup">
            <h3>{g.title} <span className="count">{items.length}</span></h3>
            <p className="muted-sm">{g.sub}</p>
            <div className="dgrid">
              {items.map((c) => <Card key={c.id} c={c} state={choice[c.id]} onSet={set} onFocus={setFocusId} focused={focusId === c.id} />)}
            </div>
          </section>
        );
      })}

      <section className="dgroup">
        <h3>Add your own place</h3>
        <div className="inline">
          <input value={q} placeholder="Search a place, e.g. a cafe from a reel" onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()} />
          <button className="btn" disabled={searchBusy || !q.trim()} onClick={search}>{searchBusy ? "Searching..." : "Search"}</button>
        </div>
        {found && found.length === 0 && <p className="hint">No place found with that name. Try another spelling.</p>}
        {found && found.map((c) => (
          <div key={c.id} className="found">
            <div><strong>{c.name}</strong> <Rating place={c.place} /><br /><span className="muted-sm">{c.place?.address}</span></div>
            <button className="btn tiny" onClick={() => { addExtra(c); setFound(null); setQ(""); }}>+ Add</button>
          </div>
        ))}
      </section>

      <section className="dgroup missing">
        <h3>🔎 What might I be missing?</h3>
        <p className="muted-sm">After choosing, we look near your picks for places worth a look. Nothing is added unless you choose it.</p>
        {!missing && (
          <button className="btn" disabled={missingBusy || selected.length === 0} onClick={findMissing}>
            {missingBusy ? "Looking nearby..." : "Check nearby places"}
          </button>
        )}
        {missing && missing.length === 0 && <p className="hint">Nothing important missing. Nice picks!</p>}
        {missing && missing.length > 0 && (
          <div className="dgrid">
            {missing.map((c) => (
              <div key={c.id} className={`mini${choice[c.id] ? " on" : ""}`}>
                <div className="dtop"><Verified c={c} small /><Rating place={c.place} /></div>
                <strong>{CATEGORY_ICON[c.category] || "📍"} {c.name}</strong>
                {c.evidence && <p className="evidence">📱 In your reel: {c.evidence}</p>}
        <p className="why">{c.why}</p>
        {c.sources?.length > 0 && (
          <p className="sources">Source{c.sources.length > 1 ? "s" : ""}: {c.sources.map((s, i) => (
            <a key={s.uri} href={s.uri} target="_blank" rel="noreferrer">{s.title}{i < c.sources.length - 1 ? ", " : ""}</a>))}</p>
        )}
                {choice[c.id]
                  ? <span className="added">✓ Added</span>
                  : <button className="btn tiny" onClick={() => addExtra({ ...c, group: "gem" })}>+ Add to trip</button>}
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="buildbar">
        <div>
          <strong>{selected.length} places</strong> · about {hrs(totalMin)} of visits
          <div className={`muted-sm${tooMuch ? " over" : ""}`}>
            {tooMuch ? `That's more than your ${Math.min(days, 7)} days can hold. We'll keep must-dos first and list what doesn't fit.`
              : `You have room for about ${hrs(Math.round(availMin))} of visits.`}
          </div>
        </div>
        <button className="btn primary big" disabled={!selected.length || building} onClick={build}>
          {building ? "Building..." : "Build my itinerary →"}
        </button>
      </div>
    </div>
  );
}
