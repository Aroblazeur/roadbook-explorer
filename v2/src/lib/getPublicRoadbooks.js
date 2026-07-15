import { createServerSupabase } from "./supabase-server";
import { getSignedMediaAccess } from "./roadbooks/loaders";

async function getRoadbooksCatalog(filterQuery) {
  const supabase = await createServerSupabase();

  let query = supabase
    .from("roadbooks")
    .select("id, slug, owner_id, creator_email, title, description, distance_km, elevation_gain_m, elevation_loss_m, created_at, cover_image_url, cover_media_id, metadata, is_public");

  await filterQuery(query, supabase);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

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

export function getPublicRoadbooks() {
  return getRoadbooksCatalog(query => { query.eq("is_public", true); });
}

export function getOwnedRoadbooks(ownerId) {
  return getRoadbooksCatalog(async (query, supabase) => {
    const { data: memberships } = await supabase
      .from("roadbook_contributors")
      .select("roadbook_id")
      .eq("user_id", ownerId);
    const sharedIds = (memberships ?? []).map(item => Number(item.roadbook_id)).filter(Number.isFinite);
    if (sharedIds.length) query.or(`owner_id.eq.${ownerId},id.in.(${sharedIds.join(",")})`);
    else query.eq("owner_id", ownerId);
  });
}
