import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { CATEGORY_ICON, fmtTime } from "./lib";

function pinIcon(n, status, active) {
  return L.divIcon({
    className: "",
    html: `<div class="pin pin-${status}${active ? " pin-active" : ""}">${n}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -14],
  });
}

function FitBounds({ points, focus }) {
  const map = useMap();
  useEffect(() => {
    if (focus) {
      map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
    } else if (points.length) {
      map.fitBounds(points, { padding: [50, 50], maxZoom: 15 });
    }
  }, [map, points, focus]);
  return null;
}

export default function MapView({ day, center, focusId, onSelect, me }) {
  const stops = useMemo(() => day?.stops ?? [], [day]);
  const points = useMemo(() => stops.map((s) => [s.lat, s.lng]), [stops]);
  const focus = stops.find((s) => s.id === focusId);
  const done = stops.filter((s) => s.status === "done").map((s) => [s.lat, s.lng]);
  const rest = stops.filter((s) => s.status !== "done").map((s) => [s.lat, s.lng]);
  const bridge = done.length && rest.length ? [done[done.length - 1], rest[0]] : null;

  return (
    <MapContainer center={[center.lat, center.lng]} zoom={13} className="map" zoomControl={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
      />
      <FitBounds points={points} focus={focus} />
      {done.length > 1 && <Polyline positions={done} pathOptions={{ color: "#9aa5b1", weight: 4, dashArray: "6 8" }} />}
      {bridge && <Polyline positions={bridge} pathOptions={{ color: "#9aa5b1", weight: 4, dashArray: "6 8" }} />}
      {rest.length > 1 && <Polyline positions={rest} pathOptions={{ color: "#f26522", weight: 4, opacity: 0.85 }} />}
      {stops.map((s, i) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={pinIcon(i + 1, s.status, s.id === focusId)}
          eventHandlers={{ click: () => onSelect?.(s.id) }}>
          <Popup>
            <strong>{CATEGORY_ICON[s.category] || "📍"} {s.name}</strong>
            <br />{fmtTime(s.start_time)} to {fmtTime(s.end_time)}
          </Popup>
        </Marker>
      ))}
      {me && (
        <Marker position={[me.lat, me.lng]}
          icon={L.divIcon({ className: "", html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] })} />
      )}
    </MapContainer>
  );
}
