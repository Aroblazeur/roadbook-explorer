import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Link from "next/link";

async function getPublicRoadbooks() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll() {},
      },
    }
  );

  const { data } = await supabase
    .from("roadbooks")
    .select("id, slug, title, description, distance_km, elevation_gain_m, elevation_loss_m, created_at, cover_image_url, cover_media_id")
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

  return roadbooks.map(rb => ({
    ...rb,
    stage_count: countMap[rb.id] ?? 0,
    coverSignedUrl: rb.cover_image_url || signedUrls[rb.id] || null,
  }));
}

export default async function ExplorePage() {
  const roadbooks = await getPublicRoadbooks();

  return (
    <main>
      <h1>Explorer les roadbooks</h1>

      {roadbooks.length === 0 && <p>Aucun roadbook public pour le moment.</p>}

      <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {roadbooks.map(rb => (
          <article key={rb.id} style={{ border: "1px solid #ccc", borderRadius: 8, padding: "1rem" }}>
            {rb.coverSignedUrl && <img src={rb.coverSignedUrl} alt="" style={{ width: "100%", height: 160, objectFit: "cover", borderRadius: 4, marginBottom: "0.5rem" }} />}
            <h2 style={{ marginTop: 0 }}>
              <Link href={`/roadbooks/${rb.slug}`} style={{ textDecoration: "none" }}>
                {rb.title}
              </Link>
            </h2>

            {rb.description && (
              <p style={{ color: "#555" }}>
                {rb.description.length > 120
                  ? rb.description.slice(0, 120) + "…"
                  : rb.description}
              </p>
            )}

            <dl style={{ display: "flex", gap: "1rem", fontSize: "0.9rem", margin: 0 }}>
              {rb.distance_km != null && (
                <div>
                  <dt style={{ fontWeight: "bold" }}>Distance</dt>
                  <dd style={{ margin: 0 }}>{rb.distance_km} km</dd>
                </div>
              )}
              {rb.stage_count > 0 && (
                <div>
                  <dt style={{ fontWeight: "bold" }}>Étapes</dt>
                  <dd style={{ margin: 0 }}>{rb.stage_count}</dd>
                </div>
              )}
            </dl>
          </article>
        ))}
      </div>

      <p><Link href="/">Retour à l&apos;accueil</Link></p>
    </main>
  );
}
