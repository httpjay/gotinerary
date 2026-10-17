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
  plan: (req) => post("/api/plan", req),
  replan: (req) => post("/api/replan", req),
  swap: (req) => post("/api/swap", req),
};

export const CATEGORY_ICON = {
  sight: "🏛️", museum: "🖼️", food: "🍽️", cafe: "☕", park: "🌳",
  shopping: "🛍️", nightlife: "🌙", experience: "✨",
};

export const INTERESTS = [
  "Art", "History", "Food", "Nature", "Architecture",
  "Shopping", "Nightlife", "Hidden gems", "Photography", "Local culture",
];

export const REASONS = [
  { id: "rain", icon: "🌧️", label: "It's raining" },
  { id: "tired", icon: "😴", label: "I'm tired" },
  { id: "late", icon: "⏰", label: "Running late" },
  { id: "closed", icon: "🚫", label: "Place is closed" },
  { id: "hungry", icon: "🍜", label: "I'm hungry" },
  { id: "custom", icon: "✏️", label: "Something else" },
];

export function mapsLink(stop, city) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${stop.name}, ${city}`)}`;
}

export function bookLink(stop, city) {
  const what = stop.category === "food" || stop.category === "cafe" ? "reservation" : "tickets";
  return `https://www.google.com/search?q=${encodeURIComponent(`${stop.name} ${city} ${what}`)}`;
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
  const end = new Date(`${startDate}T12:00:00`);
  end.setDate(end.getDate() + days - 1);
  const endIso = end.toISOString().slice(0, 10);
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    `&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=auto&start_date=${startDate}&end_date=${endIso}`;
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
  const esc = (s) => s.replace(/[,;\\]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
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
