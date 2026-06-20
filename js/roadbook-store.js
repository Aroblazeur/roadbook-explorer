import { asArray, asNumber, asText } from "./utils.js";

const SUPPORTED_SCHEMA_VERSION = 1;

export class RoadbookDataError extends Error {
  constructor(message) {
    super(message);
    this.name = "RoadbookDataError";
  }
}

export function parseRoadbook(payload) {
  if (!payload || payload.schemaVersion !== SUPPORTED_SCHEMA_VERSION || !payload.roadbook) {
    throw new RoadbookDataError("Unsupported or missing roadbook schema");
  }

  const source = payload.roadbook;
  if (!asText(source.id) || !asText(source.title) || !Array.isArray(source.days) || source.days.length === 0) {
    throw new RoadbookDataError("Roadbook metadata or days are missing");
  }

  const ids = new Set();
  const days = source.days.map((day, index) => normalizeDay(day, index, ids));

  return Object.freeze({
    id: asText(source.id),
    title: asText(source.title),
    description: asText(source.description),
    locale: asText(source.locale, "fr-FR"),
    branding: Object.freeze({ ...(source.branding || {}) }),
    days: Object.freeze(days)
  });
}

function normalizeDay(day, index, ids) {
  if (!day || typeof day !== "object") throw new RoadbookDataError(`Day ${index + 1} is invalid`);
  const id = asText(day.id);
  const title = asText(day.title);
  if (!id || !title) throw new RoadbookDataError(`Day ${index + 1} requires an id and title`);
  if (ids.has(id)) throw new RoadbookDataError(`Duplicate day id: ${id}`);
  ids.add(id);

  return Object.freeze({
    id,
    title,
    date: asText(day.date),
    departure: asText(day.departure),
    arrival: asText(day.arrival),
    kilometers: asNumber(day.kilometers),
    elevationGain: asNumber(day.elevationGain),
    elevationLoss: asNumber(day.elevationLoss),
    durationMinutes: asNumber(day.durationMinutes),
    difficulty: asText(day.difficulty),
    accommodation: normalizeAccommodation(day.accommodation),
    description: asText(day.description),
    gpx: asText(day.gpx),
    photos: freezeArray(day.photos),
    interest: freezeArray(day.interest),
    restaurants: freezeArray(day.restaurants),
    shops: freezeArray(day.shops),
    water: freezeArray(day.water),
    variants: freezeArray(day.variants),
    notes: freezeArray(day.notes),
    warning: freezeArray(day.warning)
  });
}

function normalizeAccommodation(value) {
  if (typeof value === "string") return Object.freeze({ name: asText(value), details: "" });
  if (!value || typeof value !== "object") return null;
  return Object.freeze({ name: asText(value.name), details: asText(value.details) });
}

function freezeArray(value) {
  return Object.freeze(asArray(value).map((item) => {
    if (item && typeof item === "object") return Object.freeze({ ...item });
    return item;
  }));
}

export function getRoadbookTotals(roadbook) {
  return roadbook.days.reduce((totals, day) => ({
    kilometers: totals.kilometers + (day.kilometers || 0),
    elevationGain: totals.elevationGain + (day.elevationGain || 0),
    elevationLoss: totals.elevationLoss + (day.elevationLoss || 0),
    durationMinutes: totals.durationMinutes + (day.durationMinutes || 0)
  }), { kilometers: 0, elevationGain: 0, elevationLoss: 0, durationMinutes: 0 });
}

export function createRoadbookStore(roadbook) {
  let currentIndex = 0;
  const listeners = new Set();

  const getState = () => Object.freeze({
    roadbook,
    currentIndex,
    currentDay: roadbook.days[currentIndex],
    hasPrevious: currentIndex > 0,
    hasNext: currentIndex < roadbook.days.length - 1
  });

  const select = (target) => {
    const index = typeof target === "number" ? target : roadbook.days.findIndex((day) => day.id === target);
    if (index < 0 || index >= roadbook.days.length || index === currentIndex) return false;
    currentIndex = index;
    const state = getState();
    listeners.forEach((listener) => listener(state));
    return true;
  };

  return Object.freeze({
    getState,
    select,
    previous: () => select(currentIndex - 1),
    next: () => select(currentIndex + 1),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  });
}
