function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['']/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

function normalizeAccommodationUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    url.pathname = url.pathname.replace(/\/+$/g, "") || "/";
    const sortedParams = [...url.searchParams.entries()]
      .sort(([aKey, aVal], [bKey, bVal]) => aKey.localeCompare(bKey) || aVal.localeCompare(bVal));
    url.search = "";
    sortedParams.forEach(([k, v]) => url.searchParams.append(k, v));
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function safeImageUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function safeDescription(value) {
  const text = String(value || "").trim();
  return /https?:\/\//i.test(text) ? "" : text;
}

function safeCoordinates(value) {
  if (!value || typeof value !== "object") return null;
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  return Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
         Number.isFinite(lng) && lng >= -180 && lng <= 180
    ? { lat, lng } : null;
}

export function createPoiIndex(items) {
  const index = new Map();
  (items || []).forEach(item => {
    if (!item || item.status !== "ok") return;
    const key = normalizeText(item.name);
    if (!key) return;
    if (!index.has(key)) {
      index.set(key, {
        name: String(item.name || "").trim(),
        image: safeImageUrl(item.image),
        description: safeDescription(item.description),
        coordinates: safeCoordinates(item.coordinates),
        url: safeImageUrl(item.url || item.link || item.sourceUrl),
        source: String(item.source || "").trim(),
        location: String(item.location || item.region || item.address || "").trim(),
      });
    }
  });
  return index;
}

export function createAccommodationIndex(items) {
  const index = new Map();
  (items || []).forEach(item => {
    if (!item || item.status !== "ok") return;
    const key = normalizeAccommodationUrl(item.url);
    if (!key) return;
    const prev = index.get(key) || { name: "", image: "", description: "", url: "", location: "" };
    index.set(key, {
      name: String(item.name || "").trim() || prev.name,
      image: safeImageUrl(item.image) || prev.image,
      description: safeDescription(item.description) || prev.description,
      url: safeImageUrl(item.url) || prev.url,
      location: String(item.location || item.region || item.address || "").trim() || prev.location,
    });
  });
  return index;
}

function matchesLocation(entry, locations) {
  const expected = (locations ?? []).map(normalizeText).filter(value => value.length >= 3);
  if (!expected.length) return true;
  const evidence = normalizeText([entry?.name, entry?.description, entry?.location, entry?.url].filter(Boolean).join(" "));
  return expected.some(location => evidence.includes(location));
}

export function findPoi(poiName, poiIndex, locations = []) {
  if (!poiIndex || !poiName) return null;
  const key = normalizeText(poiName);
  const entry = poiIndex.get(key) || null;
  return entry && matchesLocation(entry, locations) ? entry : null;
}

export function findAccommodation(url, accommodationIndex, locations = []) {
  if (!accommodationIndex || !url) return null;
  const key = normalizeAccommodationUrl(url);
  const entry = accommodationIndex.get(key) || null;
  return entry && matchesLocation(entry, locations) ? entry : null;
}

export function findAccommodationByName(name, accommodationIndex, locations = []) {
  if (!accommodationIndex || !name) return null;
  const normalized = normalizeText(name);
  for (const entry of accommodationIndex.values()) {
    if (normalizeText(entry.name) === normalized && matchesLocation(entry, locations)) return entry;
  }
  return null;
}

export async function loadEnrichmentData(slug, type) {
  if (typeof fetch === "undefined") return null;
  try {
    const res = await fetch(`/api/enrichment/${encodeURIComponent(slug)}/${type}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function enrichResourceBatch(items) {
  if (typeof fetch === "undefined" || !Array.isArray(items) || !items.length) return new Map();
  try {
    const response = await fetch("/api/resource-enrichment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    });
    if (!response.ok) return new Map();
    const payload = await response.json();
    return new Map((payload.results ?? []).map(item => [String(item.id), item]));
  } catch {
    return new Map();
  }
}
