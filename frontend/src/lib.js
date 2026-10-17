const API = import.meta.env.VITE_API_URL || "";

async function post(path, body) {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const j = await res.json();
      if (j.detail) msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json();
}

export const api = {
  health: () => fetch(`${API}/api/health`).then((r) => r.json()),
  inspiration: (url) => post("/api/inspiration", { url }),
  mediaPlaces: async (files, text) => {
    const fd = new FormData();
    files.forEach((f) => fd.append("files", f));
    fd.append("text", text || "");
    const res = await fetch(`${API}/api/inspiration/media`, { method: "POST", body: fd });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.detail || `Request failed (${res.status})`);
    return j;
  },
  socialPicks: (req) => post("/api/social-picks", req),
  discover: (prefs) => post("/api/discover", prefs),
  missing: (req) => post("/api/missing", req),
  search: (req) => post("/api/places/search", req),
  build: (req) => post("/api/itinerary/build", req),
  editDay: (req) => post("/api/itinerary/day", req),
  hotels: (itinerary) => post("/api/hotels", { itinerary }),
  setHotel: (itinerary, hotel) => post("/api/itinerary/hotel", { itinerary, hotel }),
  replan: (req) => post("/api/replan", req),
  swap: (req) => post("/api/swap", req),
};

export const photoSrc = (name, w = 480) => (name ? `${API}/api/photo?name=${encodeURIComponent(name)}&w=${w}` : "");

export const CATEGORY_ICON = {
  sight: "🏛️", museum: "🖼️", food: "🍽️", food_spot: "🍢", cafe: "☕", park: "🌳",
  shopping: "🛍️", nightlife: "🌙", experience: "✨",
};

export const INTERESTS = [
  "Art", "History", "Food", "Nature", "Architecture", "Temples & shrines",
  "Shopping", "Nightlife", "Hidden gems", "Photography", "Local culture", "Adventure",
];

export const DIETS = [
  { id: "none", label: "No restrictions" }, { id: "vegetarian", label: "Vegetarian" },
  { id: "vegan", label: "Vegan" }, { id: "pescatarian", label: "Pescatarian" },
  { id: "halal", label: "Halal" }, { id: "kosher", label: "Kosher" },
  { id: "gluten-free", label: "Gluten-free" },
];

export const REASONS = [
  { id: "rain", icon: "🌧️", label: "It's raining" },
  { id: "tired", icon: "😴", label: "I'm tired" },
  { id: "late", icon: "⏰", label: "Running late" },
  { id: "closed", icon: "🚫", label: "Place is closed" },
  { id: "hungry", icon: "🍜", label: "I'm hungry" },
  { id: "custom", icon: "✏️", label: "Something else" },
];

export const GROUPS = [
  { id: "video", title: "From your reels", sub: "Places found in your videos, screenshots or description" },
  { id: "social", title: "Popular on social media", sub: "From recent web articles about TikTok and Instagram spots. Not TikTok's own data." },
  { id: "landmark", title: "Must-see landmarks", sub: "The famous places most visitors go to" },
  { id: "gem", title: "Hidden gems", sub: "Loved by locals, close to the big sights" },
  { id: "custom", title: "Added by you", sub: "Your own places" },
];

export const STATUS = [
  { id: "suggested", label: "Suggested" },
  { id: "selected", label: "Selected" },
  { id: "awaiting", label: "Awaiting booking" },
  { id: "in_progress", label: "Booking in progress" },
  { id: "confirmed", label: "Confirmed" },
  { id: "cancelled", label: "Cancelled or failed" },
];

export function mapsLink(stop, city) {
  if (stop.place?.maps_url) return stop.place.maps_url;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${stop.name}, ${city}`)}`;
}

export function nearbyFoodLink(stop) {
  return `https://www.google.com/maps/search/restaurants/@${stop.lat},${stop.lng},16z`;
}

export function bookLink(stop, city) {
  if (stop.place?.website) return stop.place.website;
  const what = stop.kind === "meal" || stop.category === "food" || stop.category === "cafe" ? "reservation" : "tickets";
  return `https://www.google.com/search?q=${encodeURIComponent(`${stop.name} ${city} ${what}`)}`;
}

export function flightLinks(it) {
  const p = it.prefs || {};
  const from = (p.origin || "").trim();
  const to = it.airport_code || it.destination;
  const dep = it.start_date;
  const ret = p.end_date || it.days[it.days.length - 1]?.date;
  const n = p.travelers || 1;
  const links = {
    "Google Flights": `https://www.google.com/travel/flights?q=${encodeURIComponent(
      `Flights from ${from || "my city"} to ${to} on ${dep} through ${ret} for ${n} adults`)}`,
  };
  if (/^[A-Za-z]{3}$/.test(from) && /^[A-Za-z]{3}$/.test(to)) {
    links["Kayak"] = `https://www.kayak.com/flights/${from.toUpperCase()}-${to.toUpperCase()}/${dep}/${ret}/${n}adults`;
    const us = (d) => { const [y, m, dd] = d.split("-"); return `${m}/${dd}/${y}`; };
    links["Expedia"] = `https://www.expedia.com/Flights-Search?trip=roundtrip&leg1=from:${from.toUpperCase()},to:${to.toUpperCase()},departure:${us(dep)}TANYT&leg2=from:${to.toUpperCase()},to:${from.toUpperCase()},departure:${us(ret)}TANYT&passengers=adults:${n}`;
  }
  return links;
}

export function nowHHMM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtTime(hhmm) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function fmtDate(iso) {
  const d = new Date(`${iso}T12:00:00`);
  if (isNaN(d)) return iso;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function toMin(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function addDays(iso, n) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------- Saved trips (this browser only) ----------
const KEY = "gotinerary.trips.v2";
export function loadTrips() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}
export function saveTrip(trip) {
  try {
    const all = loadTrips().filter((t) => t.id !== trip.id);
    all.unshift({ ...trip, savedAt: new Date().toISOString() });
    localStorage.setItem(KEY, JSON.stringify(all.slice(0, 10)));
  } catch { /* storage may be blocked */ }
}
export function deleteTrip(id) {
  try { localStorage.setItem(KEY, JSON.stringify(loadTrips().filter((t) => t.id !== id))); } catch { /* ignore */ }
}

// ---------- Bookings checklist ----------
export function deriveBookings(it, old = []) {
  const prev = Object.fromEntries(old.map((b) => [b.id, b]));
  const keep = (b) => ({ ...b, ...(prev[b.id] ? {
    status: prev[b.id].status, reference: prev[b.id].reference, confirmed_cost_usd: prev[b.id].confirmed_cost_usd,
  } : {}) });
  const n = it.prefs?.travelers || 1;
  const out = [];
  const fl = flightLinks(it);
  out.push(keep({ id: "flight", kind: "flight", title: `Flights to ${it.destination}`,
    detail: `${it.prefs?.origin || "Your city"} → ${it.airport_code || it.destination} · ${n} traveler${n > 1 ? "s" : ""}`,
    status: "suggested", link: Object.values(fl)[0] }));
  out.push(keep({ id: it.hotel ? `hotel-${it.hotel.place.place_id}` : "hotel", kind: "hotel",
    title: it.hotel ? it.hotel.place.name : "Place to stay",
    detail: it.hotel ? `${it.hotel.avg_km_to_stops} km average to your stops` : "Pick one in Stay & Flights",
    status: it.hotel ? "selected" : "suggested", link: it.hotel ? Object.values(it.hotel.links)[0] : "" }));
  it.days.forEach((d) => d.stops.forEach((s) => {
    if (s.kind === "visit" && s.needs_ticket) {
      out.push(keep({ id: `t-${s.id}`, kind: "ticket", title: s.name, detail: `Day ${d.day} · ${fmtTime(s.start_time)}`,
        status: "suggested", est_cost_usd: s.est_cost_usd * n, link: bookLink(s, it.destination) }));
    }
    if (s.kind === "meal" && s.meal === "dinner" && s.verified) {
      out.push(keep({ id: `r-${s.id}`, kind: "restaurant", title: s.name, detail: `Day ${d.day} dinner · ${fmtTime(s.start_time)}`,
        status: "suggested", est_cost_usd: s.est_cost_usd * n, link: bookLink(s, it.destination) }));
    }
  }));
  return out;
}

// ---------- Weather (Open-Meteo, free, no key) ----------
const WMO = (code) => {
  if (code === 0) return ["☀️", "Clear"];
  if (code <= 3) return ["⛅", "Partly cloudy"];
  if (code <= 48) return ["🌫️", "Fog"];
  if (code <= 67 || (code >= 80 && code <= 82)) return ["🌧️", "Rain"];
  if (code <= 77 || code === 85 || code === 86) return ["❄️", "Snow"];
  return ["⛈️", "Storms"];
};

export async function fetchWeather(lat, lng, startDate, days) {
  const end = addDays(startDate, days - 1);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=auto&start_date=${startDate}&end_date=${end}`;
  const r = await fetch(url);
  if (!r.ok) return {};
  const j = await r.json();
  const out = {};
  (j.daily?.time || []).forEach((t, i) => {
    const [icon, text] = WMO(j.daily.weathercode[i]);
    out[t] = {
      icon, text,
      max: Math.round(j.daily.temperature_2m_max[i]),
      min: Math.round(j.daily.temperature_2m_min[i]),
      rain: j.daily.precipitation_probability_max[i] ?? 0,
    };
  });
  return out;
}

// ---------- Calendar export (.ics) ----------
export function downloadICS(it) {
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = (date, hhmm) => date.replaceAll("-", "") + "T" + hhmm.replace(":", "") + "00";
  const esc = (s) => (s || "").replace(/[,;\\]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const now = new Date();
  const dtstamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T000000Z`;
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//GoTinerary//EN"];
  it.days.forEach((d) => d.stops.forEach((s) => {
    lines.push("BEGIN:VEVENT", `UID:${s.id}@gotinerary`, `DTSTAMP:${dtstamp}`,
      `DTSTART:${stamp(d.date, s.start_time)}`, `DTEND:${stamp(d.date, s.end_time)}`,
      `SUMMARY:${esc(s.name)}`, `DESCRIPTION:${esc(s.description)}`,
      `GEO:${s.lat};${s.lng}`, "END:VEVENT");
  }));
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `gotinerary-${it.destination.toLowerCase().replace(/\s+/g, "-")}.ics`;
  a.click();
}

export function shareText(it) {
  const lines = [`GoTinerary: ${it.destination}, ${fmtDate(it.start_date)}`];
  it.days.forEach((d) => {
    lines.push("", `Day ${d.day} (${fmtDate(d.date)}): ${d.theme}`);
    d.stops.forEach((s) => lines.push(`  ${fmtTime(s.start_time)}  ${s.name}`));
  });
  return lines.join("\n");
}
