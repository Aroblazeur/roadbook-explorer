import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

async function getRoadbook(slug) {
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

  const { data: roadbook } = await supabase
    .from("roadbooks")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (!roadbook) return null;

  if (!roadbook.is_public) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.id !== roadbook.owner_id) return { private: true };
  }

  const { data: stages } = await supabase
    .from("stages")
    .select("*")
    .eq("roadbook_id", roadbook.id)
    .order("stage_number", { ascending: true });

  const stageIds = (stages ?? []).map(s => s.id);
  let pois = [], variants = [];
  if (stageIds.length) {
    const { data: p } = await supabase.from("stage_pois").select("*").in("stage_id", stageIds).order("sort_order", { ascending: true });
    const { data: v } = await supabase.from("stage_variants").select("*").in("stage_id", stageIds).order("sort_order", { ascending: true });
    pois = p ?? [];
    variants = v ?? [];
  }

  const { data: mediaRows } = await supabase
    .from("media").select("*").eq("roadbook_id", roadbook.id).order("created_at", { ascending: false });
  const allMedia = mediaRows ?? [];

  async function signedUrl(bucket, path) {
    if (!path) return null;
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 86400);
    return data?.signedUrl ?? null;
  }

  const images = [];
  let gpxOfficial = null, gpxCustom = null;
  const gpxByStage = {};
  for (const m of allMedia) {
    if (m.type === "image") {
      images.push({ ...m, signedUrl: await signedUrl(m.bucket, m.path) });
    } else if (m.type === "gpx") {
      const url = await signedUrl(m.bucket, m.path);
      const row = { ...m, signedUrl: url };
      if (m.metadata?.scope === "stage" && m.stage_id) {
        gpxByStage[m.stage_id] = row;
      } else if (m.metadata?.gpx_role === "official") {
        gpxOfficial = row;
      } else if (m.metadata?.gpx_role === "custom") {
        gpxCustom = row;
      }
    }
  }

  // Cover image
  let coverSignedUrl = null;
  if (roadbook.cover_image_url) {
    coverSignedUrl = roadbook.cover_image_url;
  } else if (roadbook.cover_media_id) {
    const { data: coverMedia } = await supabase.from("media").select("bucket, path").eq("id", roadbook.cover_media_id).maybeSingle();
    if (coverMedia) {
      const { data: s } = await supabase.storage.from(coverMedia.bucket).createSignedUrl(coverMedia.path, 86400);
      coverSignedUrl = s?.signedUrl ?? null;
    }
  }

  return { roadbook, stages: stages ?? [], pois, variants, images, gpxOfficial, gpxCustom, gpxByStage, coverSignedUrl, private: false };
}

export default async function RoadbookViewPage({ params }) {
  const { slug } = await params;
  const result = await getRoadbook(slug);

  if (!result) return notFound();
  if (result.private) {
    return (
      <main>
        <h1>Roadbook privé</h1>
        <p>Ce roadbook est privé. Connectez-vous avec le compte propriétaire pour le consulter.</p>
        <p><Link href="/login">Se connecter</Link></p>
        <p><Link href="/">Retour à l&apos;accueil</Link></p>
      </main>
    );
  }

  const { roadbook, stages, pois, variants, images, gpxOfficial, gpxCustom, gpxByStage, coverSignedUrl } = result;

  const poisByStage = {};
  pois.forEach(p => { if (!poisByStage[p.stage_id]) poisByStage[p.stage_id] = []; poisByStage[p.stage_id].push(p); });
  const variantsByStage = {};
  variants.forEach(v => { if (!variantsByStage[v.stage_id]) variantsByStage[v.stage_id] = []; variantsByStage[v.stage_id].push(v); });

  return (
    <main>
      <article>
        <header>
          {coverSignedUrl && <img src={coverSignedUrl} alt="" style={{ width: "100%", maxHeight: 300, objectFit: "cover", borderRadius: 8, marginBottom: "0.5rem" }} />}
          <h1>{roadbook.title}</h1>
          {roadbook.description && <p>{roadbook.description}</p>}
          <p>Visibilité : {roadbook.is_public ? "public" : "privé"}</p>
        </header>

        {renderMetrics(roadbook)}

        {images.length > 0 && renderImages(images)}

        {(gpxOfficial || gpxCustom) && renderGpxSection(gpxOfficial, gpxCustom)}

        <section>
          <h2>Étapes ({stages.length})</h2>
          {stages.length === 0 && <p>Ce roadbook n&apos;a pas encore d&apos;étapes.</p>}
          <ol style={{ listStyle: "none", padding: 0 }}>
            {stages.map(stage => <li key={stage.id}>{renderStageCard(stage, poisByStage[stage.id] ?? [], variantsByStage[stage.id] ?? [], gpxByStage[stage.id] ?? null)}</li>)}
          </ol>
        </section>
      </article>

      <p><Link href="/">Retour à l&apos;accueil</Link></p>
    </main>
  );
}

function renderMetrics(roadbook) {
  const metrics = [
    { label: "Distance", value: roadbook.distance_km, unit: "km" },
    { label: "D+", value: roadbook.elevation_gain_m, unit: "m" },
    { label: "D−", value: roadbook.elevation_loss_m, unit: "m" },
  ].filter(m => m.value != null);

  if (!metrics.length) return null;

  return (
    <section>
      <h2>Métriques</h2>
      <dl style={{ display: "flex", gap: "1.5rem" }}>
        {metrics.map(m => (
          <div key={m.label}>
            <dt>{m.label}</dt>
            <dd><strong>{m.value}</strong> {m.unit}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function renderImages(images) {
  return (
    <section>
      <h2>Images ({images.length})</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
        {images.map(img => (
          <div key={img.id} style={{ width: 180 }}>
            {img.signedUrl && <img src={img.signedUrl} alt={img.file_name ?? "image"} style={{ width: "100%", height: 135, objectFit: "cover", borderRadius: 4 }} />}
            <div style={{ fontSize: "0.75rem", marginTop: "0.2rem" }}>{img.file_name}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function renderGpxSection(gpxOfficial, gpxCustom) {
  return (
    <section>
      <h2>GPX du roadbook</h2>
      {gpxOfficial && (
        <p>
          <strong>GPX officiel :</strong> {gpxOfficial.file_name}{" "}
          <a href={gpxOfficial.signedUrl} download={gpxOfficial.file_name}>Télécharger</a>
        </p>
      )}
      {gpxCustom && (
        <p>
          <strong>GPX personnalisé :</strong> {gpxCustom.file_name}{" "}
          <a href={gpxCustom.signedUrl} download={gpxCustom.file_name}>Télécharger</a>
        </p>
      )}
    </section>
  );
}

function renderStageCard(stage, pois = [], variants = [], stageGpx = null) {
  const meta = stage.metadata ?? {};
  return (
    <article style={{ border: "1px solid #ccc", borderRadius: 8, padding: "1rem", marginBottom: "1rem" }}>
      <h3>Jour {stage.stage_number}{stage.title ? <> — {stage.title}</> : null}</h3>

      {(stage.departure || stage.arrival) && (
        <p>
          {stage.departure && <span>Départ : {stage.departure}</span>}
          {stage.departure && stage.arrival && <> → </>}
          {stage.arrival && <span>Arrivée : {stage.arrival}</span>}
        </p>
      )}

      {stage.distance_km != null && <p>Distance : {stage.distance_km} km</p>}
      {stage.elevation_gain_m != null && <p>D+ : {stage.elevation_gain_m} m</p>}
      {stage.elevation_loss_m != null && <p>D− : {stage.elevation_loss_m} m</p>}
      {meta.difficulty && <p>Difficulté : {meta.difficulty}</p>}

      {stage.accommodation_name && <p>Hébergement : {stage.accommodation_name}</p>}

      {meta.description && <p>{meta.description}</p>}

      {meta.warning && <p style={{ color: "orange" }}>{meta.warning}</p>}

      {Array.isArray(stage.notes) && stage.notes.length > 0 && (
        <details>
          <summary>Notes ({stage.notes.length})</summary>
          <ul>
            {stage.notes.map((note, i) => (
              <li key={i}>{note.text ?? note}</li>
            ))}
          </ul>
        </details>
      )}

      {pois.length > 0 && (
        <details style={{ marginTop: "0.5rem" }}>
          <summary>Points d&apos;intérêt ({pois.length})</summary>
          <ul>
            {pois.map(poi => (
              <li key={poi.id}>
                {poi.poi_type && <strong>[{poi.poi_type}]</strong>} {poi.name}
                {poi.description && <> — {poi.description}</>}
                {poi.lat != null && poi.lng != null && <span> ({poi.lat}, {poi.lng})</span>}
                {poi.link_url && <> — <a href={poi.link_url} target="_blank" rel="noopener">lien</a></>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {variants.length > 0 && (
        <details style={{ marginTop: "0.5rem" }}>
          <summary>Variantes ({variants.length})</summary>
          <ul>
            {variants.map(v => (
              <li key={v.id}>
                <strong>{v.label}</strong>
                {v.description && <> — {v.description}</>}
                {v.distance_km != null && <> — {v.distance_km} km</>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {stageGpx && (
        <p style={{ marginTop: "0.5rem" }}>
          <strong>GPX d&apos;étape :</strong> {stageGpx.file_name}{" "}
          <a href={stageGpx.signedUrl} download={stageGpx.file_name}>Télécharger</a>
        </p>
      )}
    </article>
  );
}
