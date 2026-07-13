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

export async function getSignedUrl(supabase, bucket, path, expiresIn = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error) throw new Error(error.message);
  return data?.signedUrl ?? null;
}

export async function loadMediaWithUrls(supabase, roadbookId) {
  const rows = await loadMedia(supabase, roadbookId, "image");
  const rowsWithUrls = await Promise.all(
    rows.map(async row => {
      const signedUrl = await getSignedUrl(supabase, row.bucket, row.path);
      return { ...row, signedUrl };
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
