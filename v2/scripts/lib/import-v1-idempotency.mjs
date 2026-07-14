const IMPORT_KEY_FIELD = "v1ImportKey";
const IMPORT_SOURCE_FIELD = "v1ImportSource";
const SOURCE_ID_FIELD = "v1SourceId";

const TABLE_CONFIG = {
  stage_pois: {
    fields: ["name", "lat", "lng", "poi_type", "description", "link_url", "region", "sort_order", "variant_id"],
    numericFields: new Set(["lat", "lng", "sort_order"]),
    metadataFields: ["source", "status", "fromVariant"],
  },
  stage_variants: {
    fields: [
      "label", "distance_km", "description", "sort_order", "departure", "arrival",
      "elevation_gain_m", "elevation_loss_m", "map_embed_url", "notes",
      "stage_photo_url", "day", "stage_label", "duration",
      "accommodation_name", "accommodation_url", "accommodation_photo", "accommodation_type", "alternatives",
    ],
    numericFields: new Set(["distance_km", "sort_order", "elevation_gain_m", "elevation_loss_m"]),
    metadataFields: [
      "type", "itemType", "hierarchyLevel", "enabled", "legacyAccommodation",
      "accommodation", "alternativeAccommodationName", "alternativeAccommodationPhoto",
      "departure", "arrival", "elevation_gain_m", "elevation_loss_m", "map_embed_url", "notes",
    ],
  },
};

export function normalizeIdentity(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr");
}

export function variantLabel(variant) {
  return variant?.name || variant?.title || "Variante";
}

export function variantScope(label) {
  return `variant:${normalizeIdentity(label)}`;
}

export function buildPoiImportKey(stageNumber, poiName, scope = "stage") {
  return `stage:${stageNumber}:poi:${normalizeIdentity(scope) || "stage"}:${normalizeIdentity(poiName)}`;
}

export function buildVariantImportKey(stageNumber, variant) {
  return `stage:${stageNumber}:variant:${normalizeIdentity(variantLabel(variant))}`;
}

export function withImportKey(metadata, importKey, sourceId = null) {
  const traced = {
    ...(metadata ?? {}),
    [IMPORT_KEY_FIELD]: importKey,
    [IMPORT_SOURCE_FIELD]: "v1",
  };
  if (sourceId != null && String(sourceId).trim()) traced[SOURCE_ID_FIELD] = String(sourceId);
  return traced;
}

function collectSourcePois(source) {
  const byName = new Map();
  const conflicts = new Set();
  for (const key of ["pois", "pointsOfInterest", "interest"]) {
    const localNames = new Set();
    for (const poi of (Array.isArray(source?.[key]) ? source[key] : [])) {
      const name = normalizeIdentity(poi?.name);
      if (!name) continue;
      if (localNames.has(name)) conflicts.add(name);
      localNames.add(name);

      const previous = byName.get(name);
      if (!previous) {
        byName.set(name, poi);
      } else if (JSON.stringify(normalizeComparable(previous)) !== JSON.stringify(normalizeComparable(poi))) {
        conflicts.add(name);
      }
    }
  }
  return { items: [...byName.values()], conflicts: [...conflicts] };
}

export function sourcePois(source) {
  return collectSourcePois(source).items;
}

function duplicateNames(items, getLabel) {
  const seen = new Set();
  const duplicates = new Set();
  for (const item of items) {
    const normalized = normalizeIdentity(getLabel(item));
    if (!normalized) continue;
    if (seen.has(normalized)) duplicates.add(normalized);
    seen.add(normalized);
  }
  return [...duplicates];
}

export function validateV1Source(stages) {
  const conflicts = [];
  for (const [stageIndex, stage] of (stages ?? []).entries()) {
    const stageNumber = stage?.stage ?? stageIndex + 1;
    for (const name of collectSourcePois(stage).conflicts) {
      conflicts.push(`Étape ${stageNumber}, portée principale : POI dupliqué "${name}"`);
    }

    const variants = Array.isArray(stage?.substeps) ? stage.substeps : [];
    for (const label of duplicateNames(variants, variantLabel)) {
      conflicts.push(`Étape ${stageNumber} : variante dupliquée "${label}"`);
    }

    for (const variant of variants) {
      const label = variantLabel(variant);
      for (const name of collectSourcePois(variant).conflicts) {
        conflicts.push(`Étape ${stageNumber}, variante "${label}" : POI dupliqué "${name}"`);
      }
    }
  }
  return conflicts;
}

export async function loadExistingChildren(supabase, stageId) {
  const [poisResult, variantsResult] = await Promise.all([
    supabase.from("stage_pois").select("*").eq("stage_id", stageId).order("id", { ascending: true }),
    supabase.from("stage_variants").select("*").eq("stage_id", stageId).order("id", { ascending: true }),
  ]);
  return {
    pois: poisResult.data ?? [],
    variants: variantsResult.data ?? [],
    poisError: poisResult.error ?? null,
    variantsError: variantsResult.error ?? null,
  };
}

function normalizeComparable(value) {
  if (value === undefined || value === null || value === "") return null;
  if (Array.isArray(value)) return value.map(normalizeComparable);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, normalizeComparable(value[key])]),
    );
  }
  return value;
}

function normalizePresence(table, presence) {
  const config = TABLE_CONFIG[table];
  if (!config) throw new Error(`Unsupported imported child table: ${table}`);
  if (!presence || !Array.isArray(presence.fields) || !Array.isArray(presence.metadataFields)) {
    throw new Error(`Source field presence is required for imported child table: ${table}`);
  }
  const requestedFields = new Set(presence?.fields ?? []);
  const requestedMetadataFields = new Set(presence?.metadataFields ?? []);
  return {
    fields: config.fields.filter(field => requestedFields.has(field)),
    metadataFields: config.metadataFields.filter(field => requestedMetadataFields.has(field)),
  };
}

function controlledSnapshot(table, row, presence) {
  const config = TABLE_CONFIG[table];
  const normalizedPresence = normalizePresence(table, presence);
  const snapshot = {};
  for (const field of normalizedPresence.fields) {
    const value = row?.[field];
    snapshot[field] = config.numericFields.has(field) && value != null && value !== ""
      ? Number(value)
      : normalizeComparable(value);
  }
  snapshot.metadata = Object.fromEntries(
    normalizedPresence.metadataFields.map(field => [field, normalizeComparable(row?.metadata?.[field])]),
  );
  return snapshot;
}

export function hasSameImportedContent(table, row, payload, presence) {
  return JSON.stringify(controlledSnapshot(table, row, presence)) === JSON.stringify(controlledSnapshot(table, payload, presence));
}

function sameBusinessIdentity(table, row, payload) {
  if (table === "stage_pois") {
    const rowScope = normalizeIdentity(row?.metadata?.fromVariant) || "stage";
    const payloadScope = normalizeIdentity(payload?.metadata?.fromVariant) || "stage";
    return normalizeIdentity(row?.name) === normalizeIdentity(payload?.name) && rowScope === payloadScope;
  }
  if (table === "stage_variants") {
    return normalizeIdentity(row?.label) === normalizeIdentity(payload?.label);
  }
  throw new Error(`Unsupported imported child table: ${table}`);
}

function hasExplicitV1Provenance(row) {
  const metadata = row?.metadata ?? {};
  return metadata[IMPORT_SOURCE_FIELD] === "v1" || metadata.source === "v1-import";
}

export function resolveImportedChild({ table, rows, payload, presence }) {
  const importKey = payload.metadata?.[IMPORT_KEY_FIELD];
  const sameIdentity = rows.filter(row => sameBusinessIdentity(table, row, payload));
  if (sameIdentity.length > 1) {
    return { status: "conflict", reason: "duplicate-business-identity", rows: sameIdentity };
  }
  const exactKey = sameIdentity.filter(row => row.metadata?.[IMPORT_KEY_FIELD] === importKey);
  if (exactKey.length === 1) {
    return {
      status: hasSameImportedContent(table, exactKey[0], payload, presence) ? "unchanged" : "changed",
      provenance: "key",
      row: exactKey[0],
    };
  }

  const differentKey = sameIdentity.filter(row => row.metadata?.[IMPORT_KEY_FIELD]);
  if (differentKey.length) return { status: "conflict", reason: "different-import-key", rows: differentKey };

  const legacy = sameIdentity.filter(row => !row.metadata?.[IMPORT_KEY_FIELD]);
  if (legacy.length > 1) return { status: "conflict", reason: "duplicate-legacy-rows", rows: legacy };
  if (legacy.length === 1) {
    if (!hasExplicitV1Provenance(legacy[0])) {
      return { status: "conflict", reason: "ambiguous-provenance", rows: legacy };
    }
    return {
      status: hasSameImportedContent(table, legacy[0], payload, presence) ? "unchanged" : "changed",
      provenance: "legacy-marker",
      row: legacy[0],
    };
  }

  return { status: "missing" };
}

function controlledUpdate(table, row, payload, presence) {
  const normalizedPresence = normalizePresence(table, presence);
  const update = Object.fromEntries(
    normalizedPresence.fields.map(field => [field, payload[field] === undefined || payload[field] === "" ? null : payload[field]]),
  );
  update.metadata = { ...(row.metadata ?? {}) };
  for (const field of normalizedPresence.metadataFields) {
    const value = payload.metadata?.[field];
    update.metadata[field] = value === undefined || value === ""
      ? null
      : value;
  }
  for (const field of [IMPORT_KEY_FIELD, IMPORT_SOURCE_FIELD, SOURCE_ID_FIELD]) {
    if (Object.prototype.hasOwnProperty.call(payload.metadata ?? {}, field)) {
      update.metadata[field] = payload.metadata[field];
    }
  }
  return update;
}

export async function persistImportedChild({ supabase, table, payload, presence, existingRows, upsert = false }) {
  const resolution = resolveImportedChild({ table, rows: existingRows, payload, presence });
  if (resolution.status === "conflict") return { action: "conflict", ...resolution };
  if (resolution.status === "unchanged") return { action: "skipped", ...resolution };
  if (resolution.status === "changed" && !upsert) {
    return { action: "conflict", reason: "source-content-changed", ...resolution };
  }

  if (resolution.status === "changed") {
    const update = controlledUpdate(table, resolution.row, payload, presence);
    const { error } = await supabase.from(table).update(update).eq("id", resolution.row.id);
    if (error) return { action: "error", error };
    Object.assign(resolution.row, update);
    return { action: "updated", row: resolution.row };
  }

  const { data, error } = await supabase.from(table).insert(payload).select("*").single();
  if (error) return { action: "error", error };
  const inserted = data ?? payload;
  existingRows.push(inserted);
  return { action: "inserted", row: inserted };
}
