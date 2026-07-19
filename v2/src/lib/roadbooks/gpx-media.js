const GPX_SCOPES = new Set(["roadbook", "stage", "variant", "start", "return"]);
const GPX_ROLES = new Set(["official", "custom"]);

function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function result(media, overrides) {
  return {
    status: "invalid",
    scope: null,
    role: null,
    roadbookId: media?.roadbook_id ?? null,
    stageId: media?.stage_id ?? null,
    variantId: media?.metadata?.variant_id ?? null,
    routeId: media?.metadata?.route_id ?? null,
    source: "unknown",
    reason: null,
    ...overrides,
  };
}

export function classifyGpxMedia(media) {
  if (!media || media.type !== "gpx") {
    return result(media, { reason: "media-type-is-not-gpx" });
  }

  const roadbookId = media.roadbook_id;
  const stageId = media.stage_id ?? null;
  const metadata = media.metadata && typeof media.metadata === "object" ? media.metadata : {};
  const rawScope = metadata.scope ?? null;
  const rawRole = metadata.role ?? null;
  const variantId = metadata.variant_id ?? null;
  const routeId = typeof metadata.route_id === "string" && metadata.route_id.trim() ? metadata.route_id.trim() : null;
  const variantIdPresent = hasOwn(metadata, "variant_id");

  if (!isPositiveInteger(roadbookId)) {
    return result(media, { roadbookId, stageId, variantId, reason: "roadbook-id-is-required" });
  }

  if (rawScope != null && !GPX_SCOPES.has(rawScope)) {
    return result(media, { roadbookId, stageId, variantId, reason: "unknown-scope" });
  }

  const canonicalRole = GPX_ROLES.has(rawRole) ? rawRole : null;
  let status;
  let scope;
  let role;
  let source;

  if (canonicalRole) {
    scope = rawScope;
    role = canonicalRole;
    source = "canonical";
    status = "canonical";
  } else if (rawRole != null) {
    return result(media, { roadbookId, stageId, variantId, reason: "unknown-role" });
  } else {
    return result(media, { roadbookId, stageId, variantId, reason: "scope-and-role-are-required" });
  }

  if (!scope || !GPX_SCOPES.has(scope)) {
    return result(media, { roadbookId, stageId, variantId, source, role, reason: "scope-is-required" });
  }
  if (!role || !GPX_ROLES.has(role)) {
    return result(media, { roadbookId, stageId, variantId, source, scope, reason: "role-is-required" });
  }
  if (scope !== "variant" && variantIdPresent) {
    return result(media, { roadbookId, stageId, variantId, source, scope, role, reason: "variant-id-not-allowed-for-scope" });
  }

  if (["roadbook", "start", "return"].includes(scope)) {
    if (stageId != null) {
      return result(media, { roadbookId, stageId, variantId, routeId, source, scope, role, reason: "journey-scope-must-not-have-stage-id" });
    }
  } else if (scope === "stage") {
    if (!isPositiveInteger(stageId)) {
      return result(media, { roadbookId, stageId, variantId, source, scope, role, reason: "stage-id-is-required" });
    }
  } else {
    if (variantIdPresent && !isPositiveInteger(variantId)) {
      return result(media, { roadbookId, stageId, variantId, source, scope, role, reason: "variant-id-must-be-positive-integer" });
    }
    if (!isPositiveInteger(stageId) || !isPositiveInteger(variantId)) {
      return result(media, { roadbookId, stageId, variantId, source, scope, role, reason: "variant-scope-requires-stage-and-variant-id" });
    }
  }

  return result(media, { status, roadbookId, stageId, variantId, routeId, source, scope, role, reason: null });
}

const ALLOWED_META_FIELDS = new Set(["caption", "description", "original_name", "original_size"]);

export function buildCanonicalGpxMediaInput({ roadbookId, stageId, variantId, routeId, scope, role, existingMetadata } = {}) {
  const errors = [];

  if (!isPositiveInteger(roadbookId)) errors.push("roadbookId doit être un entier positif");
  if (!scope || !GPX_SCOPES.has(scope)) errors.push(`scope inconnu : ${scope}`);
  if (!role) errors.push("role est requis");
  else if (!GPX_ROLES.has(role)) errors.push(`role inconnu : ${role}`);

  if (errors.length > 0) return { ok: false, errors };

  if (["roadbook", "start", "return"].includes(scope)) {
    if (stageId != null) return { ok: false, errors: [`stageId interdit pour scope ${scope}`] };
  } else if (scope === "stage") {
    if (!isPositiveInteger(stageId)) return { ok: false, errors: ["stageId requis pour scope stage"] };
  } else if (scope === "variant") {
    if (!isPositiveInteger(stageId)) return { ok: false, errors: ["stageId requis pour scope variant"] };
    if (!isPositiveInteger(variantId)) return { ok: false, errors: ["variantId requis pour scope variant"] };
  }

  const metadata = { scope, role };

  if (scope === "variant" && isPositiveInteger(variantId)) metadata.variant_id = variantId;
  if (typeof routeId === "string" && routeId.trim()) metadata.route_id = routeId.trim();

  if (existingMetadata && typeof existingMetadata === "object") {
    for (const key of ALLOWED_META_FIELDS) {
      if (hasOwn(existingMetadata, key) && existingMetadata[key] != null) metadata[key] = existingMetadata[key];
    }
  }

  const record = {
    type: "gpx",
    roadbook_id: roadbookId,
    stage_id: ["roadbook", "start", "return"].includes(scope) ? null : (isPositiveInteger(stageId) ? stageId : null),
    metadata,
  };

  return { ok: true, record };
}

export function buildGpxBusinessIdentity(classification) {
  if (!classification || classification.status !== "canonical") return null;
  const { roadbookId, stageId, variantId, routeId, scope, role } = classification;
  if (!isPositiveInteger(roadbookId) || !GPX_SCOPES.has(scope) || !GPX_ROLES.has(role)) return null;
  const routeSuffix = routeId ? `:route:${routeId}` : "";
  if (["roadbook", "start", "return"].includes(scope)) return `roadbook:${roadbookId}:${scope}:${role}${routeSuffix}`;
  if (!isPositiveInteger(stageId)) return null;
  if (scope === "stage") return `roadbook:${roadbookId}:stage:${stageId}:${role}${routeSuffix}`;
  if (!isPositiveInteger(variantId)) return null;
  return `roadbook:${roadbookId}:stage:${stageId}:variant:${variantId}:${role}${routeSuffix}`;
}

export function isExplorerUsableGpx(classification) {
  return buildGpxBusinessIdentity(classification) != null;
}

export function selectUniqueGpxMedia(rows = []) {
  const classified = rows.map(media => ({ media, classification: classifyGpxMedia(media) }));
  const groups = new Map();

  for (const entry of classified) {
    const identity = buildGpxBusinessIdentity(entry.classification);
    if (!identity) continue;
    const group = groups.get(identity) ?? [];
    group.push(entry);
    groups.set(identity, group);
  }

  const unique = new Map();
  const duplicates = [];
  for (const [identity, entries] of groups) {
    if (entries.length === 1) unique.set(identity, entries[0]);
    else duplicates.push({ identity, entries });
  }

  return { classified, unique, duplicates };
}

export function selectGpxMedia(rows, target) {
  const identity = buildGpxBusinessIdentity({ status: "canonical", ...target });
  if (!identity) return { status: "invalid-target", media: null, classification: null, reason: "invalid-target" };
  const selection = selectUniqueGpxMedia(rows);
  const duplicate = selection.duplicates.find(item => item.identity === identity);
  if (duplicate) {
    return { status: "duplicate-identity", media: null, classification: null, reason: "multiple-media-share-business-identity", entries: duplicate.entries };
  }
  const selected = selection.unique.get(identity);
  if (!selected) return { status: "missing", media: null, classification: null, reason: "no-usable-media" };
  return { status: "selected", media: selected.media, classification: selected.classification, reason: null };
}

export function classifyGpxReferenceUrl(value) {
  if (typeof value !== "string" || !value.trim()) return "absent";
  const trimmed = value.trim();
  if (/\/storage\/v1\/object\/sign\//i.test(trimmed) || /^\/?object\/sign\//i.test(trimmed)) {
    return "legacy-storage-signed";
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol === "http:" || url.protocol === "https:") return "external";
  } catch {
    return "legacy-relative";
  }
  return "invalid";
}

export function resolveExplorerGpxUrl({ media = null, fallbackUrl = null } = {}) {
  if (typeof media?.signedUrl === "string" && media.signedUrl.trim()) {
    return { url: media.signedUrl, source: "signed-media" };
  }
  const fallbackType = classifyGpxReferenceUrl(fallbackUrl);
  if (fallbackType === "external") return { url: fallbackUrl, source: "external-url" };
  if (fallbackType === "legacy-storage-signed") return { url: fallbackUrl, source: "legacy-storage-url" };
  if (fallbackType === "legacy-relative") return { url: fallbackUrl, source: "legacy-relative-url" };
  return { url: null, source: "absent" };
}

export function gpxDiagnosticDetails(media, classification, overrides = {}) {
  return {
    mediaId: media?.id ?? null,
    roadbookId: classification?.roadbookId ?? media?.roadbook_id ?? null,
    stageId: classification?.stageId ?? media?.stage_id ?? null,
    variantId: classification?.variantId ?? media?.metadata?.variant_id ?? null,
    routeId: classification?.routeId ?? media?.metadata?.route_id ?? null,
    status: overrides.status ?? classification?.status ?? "invalid",
    reason: overrides.reason ?? classification?.reason ?? null,
  };
}

export function formatGpxUserError(error, fallback = "Erreur lors de l'opération GPX.") {
  if (!error) return null;
  const msg = String(error?.message ?? error);
  if (/violates row-level security|new row violates/i.test(msg)) return "Permission insuffisante pour cette action.";
  if (/duplicate key/i.test(msg)) return "Un enregistrement identique existe déjà.";
  if (/JWT|jwt|token.*expir|session/i.test(msg)) return "Session expirée. Veuillez vous reconnecter.";
  if (/network|fetch|networkerror|ECONNREFUSED/i.test(msg)) return "Erreur réseau. Vérifiez votre connexion.";
  if (/not found|introuvable/i.test(msg)) return "Ressource introuvable.";
  if (/timeout/i.test(msg)) return "L'opération a pris trop de temps. Veuillez réessayer.";
  return fallback;
}
