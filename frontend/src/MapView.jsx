import { useEffect, useMemo } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MapContainer, TileLayer, Marker, Polyline, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { BedDouble } from "lucide-react";
import { CategoryIcon } from "./icons";

// Route colours from the design tokens (Leaflet needs literal values).
const ROUTE = { next: "#BF4F24", done: "#B9B3A8", hotel: "#293B32" };

const iconCache = new Map();
function svgFor(category) {
  if (!iconCache.has(category)) iconCache.set(category, renderToStaticMarkup(<CategoryIcon category={category} size={15} strokeWidth={2.25} />));
  return iconCache.get(category);
}

function pinIcon(p, active) {
  const inner = p.label != null ? p.label : svgFor(p.icon);
  return L.divIcon({
    className: "",
    html: `<div class="pin pin-${p.status}${active ? " pin-active" : ""}">${inner}</div>`,
    iconSize: [32, 32], iconAnchor: [16, 16], popupAnchor: [0, -16],
  });
}

const hotelIcon = L.divIcon({
  className: "",
  html: `<div class="pin pin-hotel">${renderToStaticMarkup(<BedDouble size={15} strokeWidth={2.25} />)}</div>`,
  iconSize: [32, 32], iconAnchor: [16, 16],
});

function FitBounds({ bounds, focus }) {
  const map = useMap();
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 15), { duration: 0.6 });
  }, [map, focus]);
  useEffect(() => {
    if (bounds.length) map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }, [map, bounds]);
  return null;
}

/**
 * points: [{ id, lat, lng, label, status: done|upcoming|new|meal|picked|skipped|idle, title, sub }]
 * route: draw lines between points in order
 */
export default function MapView({ points, route, center, focusId, onSelect, me, hotel }) {
  const bounds = useMemo(() => {
    const b = points.map((p) => [p.lat, p.lng]);
    if (hotel) b.push([hotel.lat, hotel.lng]);
    return b;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points.map((p) => p.id).join(","), hotel?.place_id]);
  const focus = points.find((p) => p.id === focusId);
  const done = points.filter((p) => p.status === "done").map((p) => [p.lat, p.lng]);
  const rest = points.filter((p) => p.status !== "done").map((p) => [p.lat, p.lng]);
  const bridge = done.length && rest.length ? [done[done.length - 1], rest[0]] : null;
  const fromHotel = hotel && rest.length ? [[hotel.lat, hotel.lng], (done[0] || rest[0])] : null;

  return (
    <MapContainer center={[center.lat, center.lng]} zoom={13} className="map" zoomControl={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19}
      />
      <FitBounds bounds={bounds} focus={focus} />
      {route && fromHotel && <Polyline positions={fromHotel} pathOptions={{ color: ROUTE.hotel, weight: 3, dashArray: "2 8", lineCap: "round" }} />}
      {route && done.length > 1 && <Polyline positions={done} pathOptions={{ color: ROUTE.done, weight: 4, dashArray: "6 8" }} />}
      {route && bridge && <Polyline positions={bridge} pathOptions={{ color: ROUTE.done, weight: 4, dashArray: "6 8" }} />}
      {route && rest.length > 1 && <Polyline positions={rest} pathOptions={{ color: ROUTE.next, weight: 4, opacity: 0.9, dashArray: "1 9", lineCap: "round" }} />}
      {points.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={pinIcon(p, p.id === focusId)}
          eventHandlers={{ click: () => onSelect?.(p.id) }}>
          <Popup><strong>{p.title}</strong>{p.sub ? <><br />{p.sub}</> : null}</Popup>
        </Marker>
      ))}
      {hotel && (
        <Marker position={[hotel.lat, hotel.lng]}
          icon={hotelIcon}>
          <Popup><strong>{hotel.name}</strong><br />Your stay</Popup>
        </Marker>
      )}
      {me && (
        <Marker position={[me.lat, me.lng]}
          icon={L.divIcon({ className: "", html: '<div class="me-dot"></div>', iconSize: [18, 18], iconAnchor: [9, 9] })} />
      )}
    </MapContainer>
  );
}
