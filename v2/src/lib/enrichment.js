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
        source: String(item.source || "").trim()
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
    const prev = index.get(key) || { name: "", image: "" };
    index.set(key, {
      name: String(item.name || "").trim() || prev.name,
      image: safeImageUrl(item.image) || prev.image
    });
  });
  return index;
}

export function findPoi(poiName, poiIndex) {
  if (!poiIndex || !poiName) return null;
  const key = normalizeText(poiName);
  return poiIndex.get(key) || null;
}

export function findAccommodation(url, accommodationIndex) {
  if (!accommodationIndex || !url) return null;
  const key = normalizeAccommodationUrl(url);
  return accommodationIndex.get(key) || null;
}

export function findAccommodationByName(name, accommodationIndex) {
  if (!accommodationIndex || !name) return null;
  const normalized = normalizeText(name);
  for (const entry of accommodationIndex.values()) {
    if (normalizeText(entry.name) === normalized) return entry;
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
