import { createServerSupabase } from "./supabase-server";

export async function getPublicRoadbooks() {
  const supabase = await createServerSupabase();

  const { data } = await supabase
    .from("roadbooks")
    .select("id, slug, title, description, distance_km, elevation_gain_m, elevation_loss_m, created_at, cover_image_url, cover_media_id, metadata")
    .eq("is_public", true)
    .order("created_at", { ascending: false });

  const roadbooks = data ?? [];

  const signedUrls = {};
  for (const rb of roadbooks) {
    if (rb.cover_media_id) {
      const { data: m } = await supabase.from("media").select("bucket, path").eq("id", rb.cover_media_id).maybeSingle();
      if (m) {
        const { data: s } = await supabase.storage.from(m.bucket).createSignedUrl(m.path, 86400);
        signedUrls[rb.id] = s?.signedUrl ?? null;
      }
    }
  }

  const stagesCount = await Promise.all(
    roadbooks.map(rb =>
      supabase
        .from("stages")
        .select("id", { count: "exact", head: true })
        .eq("roadbook_id", rb.id)
        .then(({ count }) => ({ id: rb.id, count: count ?? 0 }))
    )
  );

  const countMap = Object.fromEntries(stagesCount.map(s => [s.id, s.count]));

  return roadbooks.map(rb => {
    const meta = rb.metadata || {};
    return {
      ...rb,
      metadata: undefined,
      activity: meta.activity || null,
      destination: meta.destination || null,
      project: meta.project || null,
      projectStatus: meta.projectStatus || null,
      stage_count: countMap[rb.id] ?? 0,
      coverSignedUrl: rb.cover_image_url || signedUrls[rb.id] || null,
    };
  });
}
