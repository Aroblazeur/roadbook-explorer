import { normalizeAccommodation } from "./accommodations.js";

export const START_POINT_MAX_WAYPOINTS = 9;

export function createEmptyStartPoint() {
  return {
    departure_city: "",
    arrival_city: "",
    waypoints: [],
    transport_mode: "car",
    description: "",
    distance_km: "",
    duration: "",
    google_maps_url: "",
    accommodations: [],
    pois: [],
  };
}

export function normalizeStartPoint(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...createEmptyStartPoint(),
    departure_city: String(source.departure_city ?? ""),
    arrival_city: String(source.arrival_city ?? ""),
    waypoints: Array.isArray(source.waypoints) ? source.waypoints.map(item => String(item ?? "")) : [],
    transport_mode: String(source.transport_mode ?? "car") || "car",
    description: String(source.description ?? ""),
    distance_km: source.distance_km == null ? "" : String(source.distance_km),
    duration: String(source.duration ?? ""),
    google_maps_url: String(source.google_maps_url ?? ""),
    accommodations: Array.isArray(source.accommodations) ? source.accommodations.map(normalizeAccommodation) : [],
    pois: Array.isArray(source.pois) ? source.pois.map(normalizeStartPointPoi) : [],
  };
}

export function normalizeStartPointPoi(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    name: String(source.name ?? ""),
    region: String(source.region ?? ""),
    link_url: String(source.link_url ?? source.link ?? ""),
    description: String(source.description ?? ""),
  };
}

function mapsTravelMode(mode) {
  return ({ car: "driving", train: "transit", transit: "transit", bicycle: "bicycling", walk: "walking", motorcycle: "two-wheeler" })[mode] ?? null;
}

export function buildGoogleMapsDirectionsUrl(value) {
  const point = normalizeStartPoint(value);
  const origin = point.departure_city.trim();
  const destination = point.arrival_city.trim();
  if (!origin || !destination) return "";
  const params = new URLSearchParams({ api: "1", origin, destination });
  const travelMode = mapsTravelMode(point.transport_mode);
  if (travelMode) params.set("travelmode", travelMode);
  const waypoints = point.waypoints.map(item => item.trim()).filter(Boolean).slice(0, START_POINT_MAX_WAYPOINTS);
  if (waypoints.length) params.set("waypoints", waypoints.join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function hasStartPoint(value) {
  const point = normalizeStartPoint(value);
  return Boolean(
    point.departure_city.trim() || point.arrival_city.trim() || point.waypoints.some(item => item.trim()) ||
    point.description.trim() || point.distance_km !== "" || point.duration.trim() ||
    point.accommodations.length || point.pois.length
  );
}

export function buildStartPointRecord(value, roadbookId) {
  const point = normalizeStartPoint(value);
  const distance = String(point.distance_km).trim();
  return {
    roadbook_id: Number(roadbookId),
    departure_city: point.departure_city.trim() || null,
    arrival_city: point.arrival_city.trim() || null,
    waypoints: point.waypoints.map(item => item.trim()).filter(Boolean).slice(0, START_POINT_MAX_WAYPOINTS),
    transport_mode: point.transport_mode.trim() || null,
    description: point.description.trim() || null,
    distance_km: distance === "" || !Number.isFinite(Number(distance)) ? null : Number(distance),
    duration: point.duration.trim() || null,
    google_maps_url: buildGoogleMapsDirectionsUrl(point) || null,
    accommodations: point.accommodations.map(normalizeAccommodation).filter(item => item.name || item.url || item.photo || item.type || item.note),
    pois: point.pois.map(normalizeStartPointPoi).filter(item => item.name || item.region || item.link_url || item.description).map(item => ({
      ...item,
      link_url: item.link_url.trim() || (item.name.trim() ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([item.name, item.region].filter(Boolean).join(" "))}` : ""),
    })),
  };
}

export function startPointRoutePayload(value, roadbookId) {
  const point = normalizeStartPoint(value);
  return {
    roadbookId: Number(roadbookId),
    origin: point.departure_city.trim(),
    destination: point.arrival_city.trim(),
    waypoints: point.waypoints.map(item => item.trim()).filter(Boolean).slice(0, START_POINT_MAX_WAYPOINTS),
    transportMode: point.transport_mode,
  };
}
