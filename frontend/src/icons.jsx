import {
  Ban, BatteryLow, Clock, CloudFog, CloudLightning, CloudRain, CloudSun, Coffee, Frame, Landmark, MapPin,
  Moon, PenLine, ShoppingBag, Snowflake, Soup, Sparkles, Sun, Trees, Utensils,
} from "lucide-react";

// lib.js keeps emoji ids for its data; the UI shows these line icons instead.
const CATEGORY = {
  sight: Landmark, museum: Frame, food: Utensils, food_spot: Soup, cafe: Coffee, park: Trees,
  shopping: ShoppingBag, nightlife: Moon, experience: Sparkles,
};
const REASON = { rain: CloudRain, tired: BatteryLow, late: Clock, closed: Ban, hungry: Utensils, custom: PenLine };
const WEATHER = { Clear: Sun, "Partly cloudy": CloudSun, Fog: CloudFog, Rain: CloudRain, Snow: Snowflake, Storms: CloudLightning };

export function CategoryIcon({ category, size = 16, ...rest }) {
  const I = CATEGORY[category] || MapPin;
  return <I size={size} aria-hidden="true" {...rest} />;
}

export function ReasonIcon({ id, size = 20 }) {
  const I = REASON[id] || PenLine;
  return <I size={size} aria-hidden="true" />;
}

export function WeatherIcon({ text, size = 14 }) {
  const I = WEATHER[text] || CloudSun;
  return <I size={size} aria-label={text} />;
}

// Illustrated cover (layered mountains, lake and a dotted route) used on Welcome and the trip postcard.
export function Landscape() {
  return (
    <svg className="cover-svg" viewBox="0 0 600 800" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="gt-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F6EAC4" />
          <stop offset="0.55" stopColor="#FBF7EF" />
        </linearGradient>
        <linearGradient id="gt-lake" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7E9A86" />
          <stop offset="1" stopColor="#3B5444" />
        </linearGradient>
      </defs>
      <rect width="600" height="800" fill="url(#gt-sky)" />
      <circle cx="430" cy="210" r="74" fill="#E8C76A" />
      <path d="M0 430 L70 300 L120 360 L190 220 L250 330 L300 260 L360 350 L420 240 L480 330 L540 280 L600 350 L600 520 L0 520 Z" fill="#DCE6D9" />
      <path d="M0 470 L60 400 L130 450 L200 360 L270 440 L340 380 L410 450 L470 400 L540 440 L600 410 L600 560 L0 560 Z" fill="#A9BCA6" />
      <path d="M0 520 Q 80 470 150 505 T 300 500 T 450 495 T 600 500 L600 600 L0 600 Z" fill="#496653" />
      <rect y="560" width="600" height="240" fill="url(#gt-lake)" />
      <path d="M0 600 Q 120 585 260 600 T 600 595" stroke="#FBF7EF" strokeOpacity=".35" strokeWidth="2" fill="none" />
      <path d="M40 640 Q 200 630 330 645" stroke="#FBF7EF" strokeOpacity=".25" strokeWidth="2" fill="none" />
      <path d="M110 520 C 170 430, 250 470, 300 400 S 400 300, 470 310" stroke="#E87945" strokeWidth="4"
        strokeLinecap="round" strokeDasharray="0.5 14" fill="none" />
      <circle cx="110" cy="520" r="9" fill="#293B32" stroke="#FBF7EF" strokeWidth="3" />
      <circle cx="470" cy="310" r="11" fill="#E87945" stroke="#FBF7EF" strokeWidth="3" />
    </svg>
  );
}

// Brand symbol: a circle with a dotted route from a forest dot to a terracotta destination.
export function Mark({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <circle cx="18" cy="18" r="16.5" stroke="var(--color-primary)" strokeWidth="1.75" />
      <path d="M9 26 C 13 18, 20 24, 26 11" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeDasharray="0.5 4" />
      <circle cx="9" cy="26" r="2.5" fill="var(--color-primary)" />
      <circle cx="26" cy="11" r="3.25" fill="var(--color-accent)" />
    </svg>
  );
}
