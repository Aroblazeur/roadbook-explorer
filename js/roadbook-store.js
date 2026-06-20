const REQUIRED_DAY_FIELDS = ["id", "title", "distanceKm", "elevationGainM", "durationMinutes", "summary"];

export class RoadbookDataError extends Error {}

export function parseRoadbook(payload) {
  if (!payload || payload.schemaVersion !== 1 || !payload.roadbook) {
    throw new RoadbookDataError("Unsupported or missing roadbook schema");
  }

  const source = payload.roadbook;
  if (!source.id || !source.title || !Array.isArray(source.days) || source.days.length === 0) {
    throw new RoadbookDataError("Roadbook metadata or days are missing");
  }

  const ids = new Set();
  source.days.forEach((day, index) => {
    const missing = REQUIRED_DAY_FIELDS.filter((field) => day[field] === undefined || day[field] === "");
    if (missing.length) throw new RoadbookDataError(`Day ${index + 1} is missing: ${missing.join(", ")}`);
    if (ids.has(day.id)) throw new RoadbookDataError(`Duplicate day id: ${day.id}`);
    if (day.distanceKm < 0 || day.elevationGainM < 0 || day.durationMinutes < 0) {
      throw new RoadbookDataError(`Day ${day.id} contains a negative metric`);
    }
    ids.add(day.id);
  });

  return Object.freeze({
    ...source,
    locale: source.locale || "fr-FR",
    branding: Object.freeze(source.branding || {}),
    days: Object.freeze(source.days.map(normalizeDay))
  });
}

function normalizeDay(day) {
  return Object.freeze({
    ...day,
    pois: Object.freeze(Array.isArray(day.pois) ? day.pois : []),
    supply: Object.freeze(Array.isArray(day.supply) ? day.supply : []),
    photos: Object.freeze(Array.isArray(day.photos) ? day.photos : []),
    accommodation: day.accommodation || null,
    route: Object.freeze(day.route || {})
  });
}

export function getRoadbookTotals(roadbook) {
  return roadbook.days.reduce((totals, day) => ({
    distanceKm: totals.distanceKm + Number(day.distanceKm),
    elevationGainM: totals.elevationGainM + Number(day.elevationGainM),
    durationMinutes: totals.durationMinutes + Number(day.durationMinutes)
  }), { distanceKm: 0, elevationGainM: 0, durationMinutes: 0 });
}

export function formatDuration(minutes) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} h ${String(remainder).padStart(2, "0")}` : `${hours} h`;
}

export function createRoadbookStore(roadbook) {
  let currentIndex = 0;
  const listeners = new Set();

  const snapshot = () => Object.freeze({
    roadbook,
    currentIndex,
    currentDay: roadbook.days[currentIndex],
    hasPrevious: currentIndex > 0,
    hasNext: currentIndex < roadbook.days.length - 1
  });

  const select = (target) => {
    const index = typeof target === "number"
      ? target
      : roadbook.days.findIndex((day) => day.id === target);
    if (index < 0 || index >= roadbook.days.length || index === currentIndex) return false;
    currentIndex = index;
    listeners.forEach((listener) => listener(snapshot()));
    return true;
  };

  return Object.freeze({
    getState: snapshot,
    select,
    previous: () => select(currentIndex - 1),
    next: () => select(currentIndex + 1),
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  });
}

