import {
  gpxDiagnosticDetails,
  selectUniqueGpxMedia,
} from "./gpx-media.js";

export async function loadRoadbook(supabase, roadbookId) {
  const { data, error } = await supabase
    .from("roadbooks")
    .select("*")
    .eq("id", roadbookId)
    .single();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Roadbook introuvable.");
  return data;
}

export async function loadRoadbookSafe(supabase, roadbookId) {
  try {
    return await loadRoadbook(supabase, roadbookId);
  } catch {
    return null;
  }
}

export async function loadStages(supabase, roadbookId) {
  const { data, error } = await supabase
    .from("stages")
    .select("*")
    .eq("roadbook_id", Number(roadbookId))
    .order("stage_number", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function loadPois(supabase, stageIds) {
  if (!stageIds?.length) return [];
  const { data, error } = await supabase
    .from("stage_pois")
    .select("*")
    .in("stage_id", stageIds)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function loadVariants(supabase, stageIds) {
  if (!stageIds?.length) return [];
  const { data, error } = await supabase
    .from("stage_variants")
    .select("*")
    .in("stage_id", stageIds)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function loadMedia(supabase, roadbookId, type) {
  let query = supabase
    .from("media")
    .select("*")
    .eq("roadbook_id", Number(roadbookId));
  if (type) query = query.eq("type", type);
  query = query.order("created_at", { ascending: false });
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function loadCoverMedia(supabase, mediaId) {
  if (!mediaId) return null;
  const { data, error } = await supabase
    .from("media")
    .select("bucket, path")
    .eq("id", mediaId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export const MEDIA_SIGNED_URL_TTL_SECONDS = 3600;

function serializeMediaAccessError(error, fallbackMessage) {
  const redact = value => String(value)
    .replace(/https?:\/\/\S+/gi, "[url-redacted]")
    .replace(/([?&](?:token|signature)=)[^&\s]+/gi, "$1[redacted]");
  return {
    message: redact(error?.message ?? fallbackMessage),
    code: error?.code == null ? null : redact(error.code),
    statusCode: error?.statusCode ?? error?.status ?? null,
  };
}

export async function getSignedMediaAccess(
  supabase,
  media,
  { expiresIn = MEDIA_SIGNED_URL_TTL_SECONDS, context = "media", logger = console.error } = {},
) {
  if (!media?.bucket || !media?.path) {
    return { status: "absent", signedUrl: null, error: null };
  }

  const { data, error } = await supabase.storage
    .from(media.bucket)
    .createSignedUrl(media.path, expiresIn);

  if (error || !data?.signedUrl) {
    const safeError = serializeMediaAccessError(error, "URL signée indisponible");
    logger?.("[media-access] signed-url-failed", {
      context,
      mediaId: media.id ?? null,
      bucket: media.bucket,
      path: media.path,
      ...safeError,
    });
    return { status: "inaccessible", signedUrl: null, error: safeError };
  }

  return { status: "available", signedUrl: data.signedUrl, error: null };
}

export async function getSignedUrl(
  supabase,
  bucket,
  path,
  expiresIn = MEDIA_SIGNED_URL_TTL_SECONDS,
) {
  const access = await getSignedMediaAccess(
    supabase,
    { bucket, path },
    { expiresIn, context: "signed-url" },
  );
  if (access.status === "absent") return null;
  if (access.status === "inaccessible") {
    const error = new Error(access.error?.message ?? "Média inaccessible");
    error.mediaAccess = access;
    throw error;
  }
  return access.signedUrl;
}

export async function loadExplorerGpxMedia(
  supabase,
  rows,
  { logger = console.error } = {},
) {
  const selection = selectUniqueGpxMedia(rows);

  for (const { media, classification } of selection.classified) {
    if (classification.status === "ambiguous" || classification.status === "invalid") {
      logger?.(`[gpx-media] ${classification.status}`, gpxDiagnosticDetails(media, classification));
    }
  }

  for (const duplicate of selection.duplicates) {
    for (const { media, classification } of duplicate.entries) {
      logger?.("[gpx-media] duplicate-identity", gpxDiagnosticDetails(media, classification, {
        status: "duplicate-identity",
        reason: "multiple-media-share-business-identity",
      }));
    }
  }

  const signedRows = await Promise.all(
    [...selection.unique.values()].map(async ({ media, classification }) => {
      const access = await getSignedMediaAccess(supabase, media, {
        context: "explorer-roadbook-gpx",
        logger: null,
      });
      if (access.status !== "available") {
        logger?.("[gpx-media] signed-url-unavailable", gpxDiagnosticDetails(media, classification, {
          status: "inaccessible",
          reason: "signed-url-unavailable",
        }));
      }
      return { media: { ...media, signedUrl: access.signedUrl, access }, classification };
    }),
  );

  let gpxOfficial = null;
  let gpxCustom = null;
  const gpxByStage = {};
  const gpxByVariant = {};
  for (const { media, classification } of signedRows) {
    if (classification.scope === "roadbook" && classification.role === "official") gpxOfficial = media;
    else if (classification.scope === "roadbook" && classification.role === "custom") gpxCustom = media;
    else if (classification.scope === "stage") gpxByStage[classification.stageId] = media;
    else if (classification.scope === "variant") gpxByVariant[classification.variantId] = media;
  }

  return {
    gpxOfficial,
    gpxCustom,
    gpxByStage,
    gpxByVariant,
    diagnostics: {
      classified: selection.classified,
      duplicates: selection.duplicates,
    },
  };
}

export async function loadMediaWithUrls(supabase, roadbookId) {
  const rows = await loadMedia(supabase, roadbookId, "image");
  const rowsWithUrls = await Promise.all(
    rows.map(async row => {
      const access = await getSignedMediaAccess(supabase, row, {
        context: "studio-media-list",
      });
      return { ...row, signedUrl: access.signedUrl, access };
    })
  );
  return rowsWithUrls;
}

export async function loadGpxRows(supabase, roadbookId) {
  const rows = await loadMedia(supabase, roadbookId, "gpx");
  return rows ?? [];
}

export async function loadStudioData(supabase, roadbookId) {
  const roadbook = await loadRoadbook(supabase, roadbookId);
  const stages = await loadStages(supabase, roadbookId);
  const stageIds = stages.map(s => s.id);
  const [pois, variants] = await Promise.all([
    loadPois(supabase, stageIds),
    loadVariants(supabase, stageIds),
  ]);
  const [media, gpxRows] = await Promise.all([
    loadMediaWithUrls(supabase, roadbookId),
    loadGpxRows(supabase, roadbookId),
  ]);
  return { roadbook, stages, pois, variants, media, gpxRows };
}
