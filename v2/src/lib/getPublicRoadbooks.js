import { createServerSupabase } from "./supabase-server";
import { getSignedMediaAccess } from "./roadbooks/loaders";

export async function getPublicRoadbooks() {
  const supabase = await createServerSupabase();

  const { data } = await supabase
    .from("roadbooks")
    .select("id, slug, title, description, distance_km, elevation_gain_m, elevation_loss_m, created_at, cover_image_url, cover_media_id, metadata")
    .eq("is_public", true)
    .order("created_at", { ascending: false });

  const roadbooks = data ?? [];

  const coverAccessByRoadbook = {};
  for (const rb of roadbooks) {
    if (rb.cover_media_id) {
      const { data: m } = await supabase.from("media").select("id, bucket, path").eq("id", rb.cover_media_id).maybeSingle();
      if (m) {
        coverAccessByRoadbook[rb.id] = await getSignedMediaAccess(supabase, m, {
          context: "catalog-cover",
        });
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
    const coverAccess = rb.cover_image_url
      ? { status: "available", signedUrl: rb.cover_image_url, error: null }
      : coverAccessByRoadbook[rb.id] ?? { status: "absent", signedUrl: null, error: null };
    return {
      ...rb,
      metadata: undefined,
      activity: meta.activity || null,
      destination: meta.destination || null,
      project: meta.project || null,
      projectStatus: meta.projectStatus || null,
      stage_count: countMap[rb.id] ?? 0,
      coverSignedUrl: coverAccess.signedUrl,
      coverMediaAccess: coverAccess,
    };
  });
}
