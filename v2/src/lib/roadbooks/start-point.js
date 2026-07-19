import { normalizeAccommodation } from "./accommodations.js";

export const START_POINT_MAX_WAYPOINTS = 9;

export const TRANSPORT_OPTIONS = [
  ["car", "Voiture"],
  ["train", "Train / transports en commun"],
  ["bicycle", "Vélo"],
  ["walk", "À pied"],
  ["motorcycle", "Moto"],
  ["other", "Autre"],
];

export function transportLabel(mode) {
  return Object.fromEntries(TRANSPORT_OPTIONS)[mode] || String(mode ?? "");
}

export function createEmptyTransportSegment() {
  return {
    departure_city: "",
    arrival_city: "",
    waypoints: [],
    transport_mode: "car",
    distance_km: "",
    duration: "",
    google_maps_url: "",
  };
}

export function normalizeTransportSegment(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...createEmptyTransportSegment(),
    departure_city: String(source.departure_city ?? ""),
    arrival_city: String(source.arrival_city ?? ""),
    waypoints: Array.isArray(source.waypoints) ? source.waypoints.map(item => String(item ?? "")).slice(0, START_POINT_MAX_WAYPOINTS) : [],
    transport_mode: String(source.transport_mode ?? "car") || "car",
    distance_km: source.distance_km == null ? "" : String(source.distance_km),
    duration: String(source.duration ?? ""),
    google_maps_url: String(source.google_maps_url ?? ""),
  };
}

export function createEmptyJourney() {
  return { transport_segments: [], route_maps: [], photos: [], description: "", accommodations: [], pois: [] };
}

function normalizeRouteMaps(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => typeof item === "string"
    ? { label: "", url: String(item) }
    : { label: String(item?.label ?? ""), url: String(item?.url ?? "") });
}

function normalizeJourneyPhotos(value) {
  if (!Array.isArray(value)) return [];
  return value.map(item => typeof item === "string"
    ? { url: String(item), photoMediaId: null, caption: "" }
    : {
        url: String(item?.url ?? item?.photo_url ?? ""),
        photoMediaId: Number(item?.photoMediaId ?? item?.photo_media_id) || null,
        caption: String(item?.caption ?? ""),
      });
}

function normalizeStartPointPoi(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    name: String(source.name ?? ""),
    region: String(source.region ?? ""),
    link_url: String(source.link_url ?? source.link ?? ""),
    description: String(source.description ?? ""),
    photo_url: String(source.photo_url ?? source.photo ?? ""),
    photoMediaId: Number(source.photoMediaId ?? source.photo_media_id) || null,
    preview: source.preview && typeof source.preview === "object" ? source.preview : null,
  };
}

function hasLegacyRoute(source) {
  return Boolean(
    String(source?.departure_city ?? "").trim() || String(source?.arrival_city ?? "").trim() ||
    (Array.isArray(source?.waypoints) && source.waypoints.some(item => String(item ?? "").trim())) ||
    source?.distance_km != null || String(source?.duration ?? "").trim() || String(source?.google_maps_url ?? "").trim()
  );
}

export function normalizeJourney(value, { acceptLegacy = true } = {}) {
  const source = value && typeof value === "object" ? value : {};
  let segments = Array.isArray(source.transport_segments)
    ? source.transport_segments.map(normalizeTransportSegment)
    : Array.isArray(source.segments)
      ? source.segments.map(normalizeTransportSegment)
      : [];
  if (!segments.length && acceptLegacy && hasLegacyRoute(source)) segments = [normalizeTransportSegment(source)];
  return {
    ...createEmptyJourney(),
    transport_segments: segments,
    route_maps: normalizeRouteMaps(source.route_maps ?? source.routeMaps),
    photos: normalizeJourneyPhotos(source.photos),
    description: String(source.description ?? ""),
    accommodations: Array.isArray(source.accommodations) ? source.accommodations.map(normalizeAccommodation) : [],
    pois: Array.isArray(source.pois) ? source.pois.map(normalizeStartPointPoi) : [],
  };
}

export function createEmptyStartPoint() {
  return { ...createEmptyJourney(), return_trip: createEmptyJourney() };
}

export function normalizeStartPoint(value) {
  const source = value && typeof value === "object" ? value : {};
  return {
    ...normalizeJourney(source),
    return_trip: normalizeJourney(source.return_trip, { acceptLegacy: false }),
  };
}

function mapsTravelMode(mode) {
  return ({ car: "driving", train: "transit", transit: "transit", bicycle: "bicycling", walk: "walking", motorcycle: "two-wheeler" })[mode] ?? null;
}

export function buildGoogleMapsDirectionsUrl(value) {
  const segment = normalizeTransportSegment(value?.transport_segments?.[0] ?? value);
  const origin = segment.departure_city.trim();
  const destination = segment.arrival_city.trim();
  if (!origin || !destination) return "";
  const params = new URLSearchParams({ api: "1", origin, destination });
  const travelMode = mapsTravelMode(segment.transport_mode);
  if (travelMode) params.set("travelmode", travelMode);
  const waypoints = segment.waypoints.map(item => item.trim()).filter(Boolean).slice(0, START_POINT_MAX_WAYPOINTS);
  if (waypoints.length) params.set("waypoints", waypoints.join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function journeySegments(value) {
  return normalizeJourney(value).transport_segments;
}

export function journeyCities(value) {
  const cities = [];
  journeySegments(value).forEach(segment => {
    [segment.departure_city, ...segment.waypoints, segment.arrival_city].filter(Boolean).forEach(city => {
      if (city.trim() && cities.at(-1) !== city.trim()) cities.push(city.trim());
    });
  });
  return cities;
}

export function journeyTransportModes(value) {
  return [...new Set(journeySegments(value).map(segment => segment.transport_mode).filter(Boolean))];
}

export function journeyDistance(value) {
  const distances = journeySegments(value).map(segment => String(segment.distance_km).trim()).filter(Boolean).map(Number).filter(Number.isFinite);
  if (!distances.length) return "";
  return Math.round(distances.reduce((sum, distance) => sum + distance, 0) * 100) / 100;
}

export function hasJourney(value) {
  const journey = normalizeJourney(value);
  return Boolean(
    journey.transport_segments.some(segment => hasLegacyRoute(segment)) || journey.description.trim() ||
    journey.route_maps.some(item => item.url.trim()) || journey.photos.some(item => item.url.trim() || item.photoMediaId) ||
    journey.accommodations.length || journey.pois.length
  );
}

export function hasStartJourney(value) {
  return hasJourney(normalizeStartPoint(value));
}

export function hasReturnTrip(value) {
  return hasJourney(normalizeStartPoint(value).return_trip);
}

export function hasStartPoint(value) {
  const point = normalizeStartPoint(value);
  return hasJourney(point) || hasJourney(point.return_trip);
}

function buildJourneyValue(value) {
  const journey = normalizeJourney(value);
  return {
    transport_segments: journey.transport_segments.map(segment => ({
      ...normalizeTransportSegment(segment),
      departure_city: segment.departure_city.trim(),
      arrival_city: segment.arrival_city.trim(),
      waypoints: segment.waypoints.map(item => item.trim()).filter(Boolean).slice(0, START_POINT_MAX_WAYPOINTS),
      distance_km: String(segment.distance_km).trim() === "" || !Number.isFinite(Number(segment.distance_km)) ? null : Number(segment.distance_km),
      google_maps_url: buildGoogleMapsDirectionsUrl(segment) || null,
    })).filter(segment => hasLegacyRoute(segment)),
    route_maps: journey.route_maps.map(item => ({ label: item.label.trim(), url: item.url.trim() })).filter(item => item.url),
    photos: journey.photos.map(item => ({ url: item.url.trim(), photoMediaId: item.photoMediaId, caption: item.caption.trim() })).filter(item => item.url || item.photoMediaId),
    description: journey.description.trim() || null,
    accommodations: journey.accommodations.map(normalizeAccommodation).filter(item => item.name || item.url || item.photo || item.photoMediaId || item.type || item.price || item.note || item.description),
    pois: journey.pois.map(normalizeStartPointPoi).filter(item => item.name || item.region || item.link_url || item.description || item.photo_url || item.photoMediaId).map(item => ({
      ...item,
      link_url: item.link_url.trim() || (item.name.trim() ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([item.name, item.region].filter(Boolean).join(" "))}` : ""),
    })),
  };
}

export function buildStartPointRecord(value, roadbookId) {
  const point = normalizeStartPoint(value);
  const start = buildJourneyValue(point);
  const first = start.transport_segments[0] ?? normalizeTransportSegment({});
  const last = start.transport_segments.at(-1) ?? first;
  const distance = journeyDistance(start);
  const modes = journeyTransportModes(start);
  return {
    roadbook_id: Number(roadbookId),
    departure_city: first.departure_city || null,
    arrival_city: last.arrival_city || null,
    waypoints: start.transport_segments.flatMap(segment => segment.waypoints),
    transport_mode: modes.length > 1 ? "multimodal" : modes[0] || null,
    description: start.description,
    distance_km: distance === "" ? null : distance,
    duration: start.transport_segments.length === 1 ? start.transport_segments[0].duration || null : null,
    google_maps_url: start.transport_segments.length === 1 ? start.transport_segments[0].google_maps_url : null,
    route_maps: start.route_maps,
    photos: start.photos,
    accommodations: start.accommodations,
    pois: start.pois,
    transport_segments: start.transport_segments,
    return_trip: buildJourneyValue(point.return_trip),
  };
}

export function startPointRoutePayload(value, roadbookId) {
  const segment = normalizeTransportSegment(value);
  return {
    roadbookId: Number(roadbookId),
    origin: segment.departure_city.trim(),
    destination: segment.arrival_city.trim(),
    waypoints: segment.waypoints.map(item => item.trim()).filter(Boolean).slice(0, START_POINT_MAX_WAYPOINTS),
    transportMode: segment.transport_mode,
  };
}
