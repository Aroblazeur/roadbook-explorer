const FLAT_SPEED_KMH = 11;
const CLIMB_METERS_PER_HOUR = 600;
const PAUSE_HOURS = 0.5;
const ELEVATION_NOISE_THRESHOLD_M = 3;

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function haversineDistanceKm(first, second) {
  const toRadians = degrees => degrees * Math.PI / 180;
  const earthRadiusKm = 6371.0088;
  const latitudeDelta = toRadians(second.lat - first.lat);
  const longitudeDelta = toRadians(second.lng - first.lng);
  const firstLatitude = toRadians(first.lat);
  const secondLatitude = toRadians(second.lat);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) * Math.cos(secondLatitude) *
    Math.sin(longitudeDelta / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(a)));
}

function parsePoint(node) {
  const lat = finiteNumber(node.getAttribute("lat"));
  const lng = finiteNumber(node.getAttribute("lon"));
  if (lat === null || lng === null) return null;
  const elevationNode = node.getElementsByTagName("ele")[0];
  return {
    lat,
    lng,
    elevation: elevationNode ? finiteNumber(String(elevationNode.textContent || "").trim().replace(",", ".")) : null
  };
}

function calculateElevationProfile(sequences) {
  const elevations = sequences
    .flat()
    .map(point => point.elevation)
    .filter(Number.isFinite);

  if (!elevations.length) {
    return { elevationGainM: null, elevationLossM: null, elevationMinM: null, elevationMaxM: null };
  }

  let elevationGainM = 0;
  let elevationLossM = 0;

  sequences.forEach(sequence => {
    let previousElevation = null;
    let pendingDelta = 0;

    sequence.forEach(point => {
      if (!Number.isFinite(point.elevation)) return;
      if (previousElevation === null) {
        previousElevation = point.elevation;
        return;
      }

      const difference = point.elevation - previousElevation;
      previousElevation = point.elevation;
      pendingDelta += difference;

      if (Math.abs(pendingDelta) >= ELEVATION_NOISE_THRESHOLD_M) {
        if (pendingDelta > 0) elevationGainM += pendingDelta;
        else elevationLossM += Math.abs(pendingDelta);
        pendingDelta = 0;
      }
    });
  });

  return {
    elevationGainM,
    elevationLossM,
    elevationMinM: Math.min(...elevations),
    elevationMaxM: Math.max(...elevations)
  };
}

export function parseGpxMetrics(xmlText) {
  if (typeof DOMParser === "undefined") throw new Error("DOMParser indisponible");
  const document = new DOMParser().parseFromString(String(xmlText ?? ""), "application/xml");
  if (document.getElementsByTagName("parsererror").length) {
    throw new Error("GPX invalide");
  }

  const trackSegments = Array.from(document.getElementsByTagName("trkseg"));
  let sequences = trackSegments.map(segment =>
    Array.from(segment.getElementsByTagName("trkpt")).map(parsePoint).filter(Boolean)
  );

  if (!sequences.some(points => points.length > 1)) {
    const trackPoints = Array.from(document.getElementsByTagName("trkpt")).map(parsePoint).filter(Boolean);
    const routePoints = Array.from(document.getElementsByTagName("rtept")).map(parsePoint).filter(Boolean);
    sequences = [trackPoints.length > 1 ? trackPoints : routePoints];
  }

  const points = sequences.flat();
  if (points.length < 2) throw new Error("GPX sans trace exploitable");
  const elevationPointCount = points.filter(point => point.elevation !== null).length;

  let distanceKm = 0;
  sequences.forEach(sequence => {
    for (let index = 1; index < sequence.length; index += 1) {
      distanceKm += haversineDistanceKm(sequence[index - 1], sequence[index]);
    }
  });

  if (!(distanceKm > 0)) throw new Error("Distance GPX indisponible");

  const hasCompleteElevation = elevationPointCount === points.length;
  const elevationProfile = hasCompleteElevation
    ? calculateElevationProfile(sequences)
    : { elevationGainM: null, elevationLossM: null, elevationMinM: null, elevationMaxM: null };

  return {
    distanceKm,
    elevationGainM: elevationProfile.elevationGainM,
    elevationLossM: elevationProfile.elevationLossM,
    elevationMinM: elevationProfile.elevationMinM,
    elevationMaxM: elevationProfile.elevationMaxM,
    pointCount: points.length,
    elevationPointCount,
    hasElevation: elevationPointCount > 0,
    hasCompleteElevation
  };
}

export function estimateGpxHours(distanceKm, elevationGain) {
  const distance = finiteNumber(distanceKm);
  if (distance === null || distance < 0) return null;
  const gain = Math.max(0, finiteNumber(elevationGain) ?? 0);
  return distance / FLAT_SPEED_KMH + gain / CLIMB_METERS_PER_HOUR + PAUSE_HOURS;
}

export function formatDuration(hours) {
  if (!Number.isFinite(hours) || hours < 0) return "";
  const roundedMinutes = Math.round((hours * 60) / 5) * 5;
  const wholeHours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  return `${wholeHours} h ${String(minutes).padStart(2, "0")}`;
}

export async function fetchAndComputeGpxMetrics(gpxSignedUrl) {
  const res = await fetch(gpxSignedUrl, {
    headers: { Accept: "application/gpx+xml,application/xml" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const xmlText = await res.text();
  return parseGpxMetrics(xmlText);
}
