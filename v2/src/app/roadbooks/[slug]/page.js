import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import MapViewerClient from "@/components/MapViewerClient";

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

  const totalDistance = (stages ?? []).reduce((sum, s) => sum + (s.distance_km ?? 0), 0);
  const totalElevationGain = (stages ?? []).reduce((sum, s) => sum + (s.elevation_gain_m ?? 0), 0);
  const totalElevationLoss = (stages ?? []).reduce((sum, s) => sum + (s.elevation_loss_m ?? 0), 0);

  return { roadbook, stages: stages ?? [], pois, variants, images, gpxOfficial, gpxCustom, gpxByStage, coverSignedUrl, totals: { distance: totalDistance, elevationGain: totalElevationGain, elevationLoss: totalElevationLoss }, private: false };
}

export default async function RoadbookViewPage({ params, searchParams: sp }) {
  const { slug } = await params;
  const searchParams = await sp;
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

  const { roadbook, stages, pois, variants, images, gpxOfficial, gpxCustom, gpxByStage, coverSignedUrl, totals } = result;
  const stageParam = searchParams?.stage ? Number(searchParams.stage) : null;

  const poisByStage = {};
  pois.forEach(p => { if (!poisByStage[p.stage_id]) poisByStage[p.stage_id] = []; poisByStage[p.stage_id].push(p); });
  const variantsByStage = {};
  variants.forEach(v => { if (!variantsByStage[v.stage_id]) variantsByStage[v.stage_id] = []; variantsByStage[v.stage_id].push(v); });

  const visibleStages = stageParam != null && stageParam >= 0 && stageParam < stages.length
    ? [stages[stageParam]] : stages;
  const currentIdx = stageParam != null && stageParam >= 0 && stageParam < stages.length ? stageParam : null;

  return (
    <main>
      <article>
        <header>
          {coverSignedUrl && <img src={coverSignedUrl} alt="" style={{ width: "100%", maxHeight: 300, objectFit: "cover", borderRadius: 8, marginBottom: "0.5rem" }} />}
          <h1>{roadbook.title}</h1>
          {roadbook.description && <p>{roadbook.description}</p>}
          <p>Visibilité : {roadbook.is_public ? "public" : "privé"}</p>
        </header>

        {!stageParam && (
          <>
            <GlobalSummary
              distance={totals.distance}
              elevationGain={totals.elevationGain}
              elevationLoss={totals.elevationLoss}
              stageCount={stages.length}
            />
            {gpxOfficial && <GpxOfficialSection gpx={gpxOfficial} />}
          </>
        )}

        <section>
          <h2>{stageParam != null ? `Étape ${stageParam + 1}` : `Étapes (${stages.length})`}</h2>
          {stages.length === 0 && <p>Ce roadbook n&apos;a pas encore d&apos;étapes.</p>}
          <ol style={{ listStyle: "none", padding: 0 }}>
            {visibleStages.map(stage => (
              <li key={stage.id}>
                <StageCard
                  stage={stage}
                  pois={poisByStage[stage.id] ?? []}
                  variants={variantsByStage[stage.id] ?? []}
                  stageGpx={gpxByStage[stage.id] ?? null}
                  showMap={stageParam != null}
                />
              </li>
            ))}
          </ol>
        </section>

        {!stageParam && gpxCustom && <GpxCustomSection gpx={gpxCustom} totals={totals} />}
        {!stageParam && images.length > 0 && <ImagesSection images={images} />}
      </article>

      <nav style={{ marginTop: "1.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
        {currentIdx != null && currentIdx > 0
          ? <Link href={`/roadbooks/${roadbook.slug}?stage=${currentIdx - 1}`}>← Étape précédente</Link>
          : <span />}
        <Link href={currentIdx != null ? `/roadbooks/${roadbook.slug}` : "/"}>
          {currentIdx != null ? "Vue d'ensemble" : "Retour à l'accueil"}
        </Link>
        {currentIdx != null && currentIdx < stages.length - 1
          ? <Link href={`/roadbooks/${roadbook.slug}?stage=${currentIdx + 1}`}>Étape suivante →</Link>
          : <span />}
      </nav>
    </main>
  );
}

function Section({ children, ...props }) {
  return <section style={{ marginBottom: "1.5rem" }} {...props}>{children}</section>;
}

function GpxOfficialSection({ gpx }) {
  return (
    <Section>
      <h2>Trace officielle</h2>
      <p>
        Télécharger le GPX officiel complet :{" "}
        <a href={gpx.signedUrl} download={gpx.file_name ?? "trace.gpx"}>
          {gpx.file_name ?? "trace.gpx"}
        </a>
      </p>
      <MapViewerClient gpxUrl={gpx.signedUrl} height={350} />
    </Section>
  );
}

function GpxCustomSection({ gpx, totals }) {
  return (
    <Section>
      <h2>GPX personnalisé</h2>
      {totals && (
        <dl style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
          <SummaryStat label="Distance cumulée" value={totals.distance} unit="km" />
          <SummaryStat label="D+ cumulé" value={totals.elevationGain} unit="m" />
          <SummaryStat label="D− cumulé" value={totals.elevationLoss} unit="m" />
        </dl>
      )}
      <p>
        Télécharger le GPX personnalisé :{" "}
        <a href={gpx.signedUrl} download={gpx.file_name ?? "personnalise.gpx"}>
          {gpx.file_name ?? "personnalise.gpx"}
        </a>
      </p>
      <MapViewerClient gpxUrl={gpx.signedUrl} height={350} />
    </Section>
  );
}

function ImagesSection({ images }) {
  return (
    <Section>
      <h2>Images ({images.length})</h2>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
        {images.map(img => (
          <div key={img.id} style={{ width: 180 }}>
            {img.signedUrl && <img src={img.signedUrl} alt={img.file_name ?? "image"} style={{ width: "100%", height: 135, objectFit: "cover", borderRadius: 4 }} />}
            <div style={{ fontSize: "0.75rem", marginTop: "0.2rem" }}>{img.file_name}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function VariantCard({ v }) {
  const vmeta = v.metadata ?? {};
  const vType = vmeta.type;
  const vGain = v.elevation_gain_m ?? vmeta.elevation_gain_m;
  const vLoss = v.elevation_loss_m ?? vmeta.elevation_loss_m;
  const vDep = v.departure ?? vmeta.departure;
  const vArr = v.arrival ?? vmeta.arrival;
  return (
    <div style={{ border: "1px dashed #bbb", borderRadius: 12, padding: "0.75rem", marginBottom: "0.5rem", marginLeft: "1.5rem", background: "#fafafa" }}>
      <p style={{ margin: 0 }}>
        <span style={{ color: "#666" }}>↳ </span>
        {vType && <span style={{ border: "1px solid #999", borderRadius: 999, padding: "0.1rem 0.5rem", fontSize: "0.8rem", marginRight: "0.3rem" }}>{vType}</span>}
        <strong>{v.label}</strong>
      </p>
      {(vDep || vArr) && (
        <p style={{ margin: "0.25rem 0", fontSize: "0.9rem", color: "#444" }}>
          {vDep && <span>{vDep}</span>}
          {vDep && vArr && <> → </>}
          {vArr && <span>{vArr}</span>}
        </p>
      )}
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", fontSize: "0.85rem", color: "#555", marginTop: "0.25rem" }}>
        {v.distance_km != null && <span style={{ border: "1px solid #4caf50", borderRadius: 999, padding: "0.1rem 0.5rem", background: "#f1f8f2" }}><strong>{v.distance_km}</strong> km</span>}
        {vGain != null && <span style={{ border: "1px solid #4caf50", borderRadius: 999, padding: "0.1rem 0.5rem", background: "#f1f8f2" }}><strong>{vGain}</strong> m D+</span>}
        {vLoss != null && <span style={{ border: "1px solid #4caf50", borderRadius: 999, padding: "0.1rem 0.5rem", background: "#f1f8f2" }}><strong>{vLoss}</strong> m D−</span>}
      </div>
      {v.description && <p style={{ margin: "0.25rem 0", fontSize: "0.9rem" }}>{v.description}</p>}
    </div>
  );
}

function Pills({ distanceKm, elevationGain, elevationLoss, duration }) {
  const items = [];
  if (distanceKm != null) items.push({ label: "km", value: distanceKm });
  if (elevationGain != null) items.push({ label: "D+", value: elevationGain, unit: "m" });
  if (elevationLoss != null) items.push({ label: "D−", value: elevationLoss, unit: "m" });
  if (duration) items.push({ label: "Durée", value: duration });
  if (!items.length) return null;
  return (
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", margin: "0.5rem 0" }}>
      {items.map((item, i) => (
        <span key={i} style={{ border: "1px solid #4caf50", borderRadius: 999, padding: "0.2rem 0.7rem", fontSize: "0.85rem", background: "#f1f8f2", whiteSpace: "nowrap" }}>
          <strong>{item.value}</strong>{item.unit ? ` ${item.unit}` : ""} {item.label}
        </span>
      ))}
    </div>
  );
}

function StageCard({ stage, pois, variants, stageGpx, showMap = false }) {
  const meta = stage.metadata ?? {};
  return (
    <article style={{ border: "1px solid #ddd", borderRadius: 16, padding: "1rem", marginBottom: "1rem", background: "#fff", boxShadow: "0 4px 12px rgba(0,0,0,.08)" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
        <div style={{ minWidth: 42, width: 42, height: 42, borderRadius: "50%", background: "#2e7d32", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold", fontSize: "1.1rem" }}>
          {stage.stage_number}
        </div>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0 }}>
            {stage.stage_label || (stage.day ? `${stage.day}` : "")}
            {stage.title && <span style={{ fontWeight: "normal", color: "#555" }}> — {stage.title}</span>}
          </h3>
        </div>
        {stage.accommodation_name && (
          <span style={{ border: "1px solid #4caf50", borderRadius: 999, padding: "0.2rem 0.6rem", fontSize: "0.8rem", whiteSpace: "nowrap", background: "#f1f8f2" }}>
            🏕 {stage.accommodation_name}
          </span>
        )}
      </div>

      {stage.stage_photo_url && (
        <img src={stage.stage_photo_url} alt="" style={{ width: "100%", maxHeight: 200, objectFit: "cover", borderRadius: 12, margin: "0.75rem 0" }} />
      )}

      {(stage.departure || stage.arrival) && (
        <p style={{ margin: "0.25rem 0" }}>
          {stage.departure && <span>Départ : {stage.departure}</span>}
          {stage.departure && stage.arrival && <> → </>}
          {stage.arrival && <span>Arrivée : {stage.arrival}</span>}
        </p>
      )}

      <Pills distanceKm={stage.distance_km} elevationGain={stage.elevation_gain_m} elevationLoss={stage.elevation_loss_m} duration={stage.duration} />

      {meta.description && <p style={{ margin: "0.25rem 0" }}>{meta.description}</p>}
      {meta.warning && <p style={{ color: "#e65100", margin: "0.25rem 0" }}>⚠ {meta.warning}</p>}

      {stage.accommodation_photo && (
        <div style={{ margin: "0.5rem 0" }}>
          <img src={stage.accommodation_photo} alt={stage.accommodation_name ?? ""} style={{ width: "100%", maxHeight: 150, objectFit: "cover", borderRadius: 12 }} />
        </div>
      )}

      {stage.accommodation_url && (
        <p style={{ margin: "0.25rem 0" }}>
          <a href={stage.accommodation_url} target="_blank" rel="noopener noreferrer">🔗 Site web de l&apos;hébergement</a>
        </p>
      )}

      {showMap && stage.map_embed_url && (
        <div style={{ margin: "0.5rem 0" }}>
          <iframe src={stage.map_embed_url} width="100%" height="300" style={{ border: "none", borderRadius: 12 }} allowFullScreen loading="lazy" />
        </div>
      )}

      {showMap && !stage.map_embed_url && stageGpx && (
        <div style={{ margin: "0.5rem 0" }}>
          <MapViewerClient gpxUrl={stageGpx.signedUrl} height={300} />
        </div>
      )}

      {Array.isArray(stage.notes) && stage.notes.length > 0 && (
        <details style={{ marginTop: "0.5rem" }}>
          <summary>Notes ({stage.notes.length})</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
            {stage.notes.map((note, i) => (
              <div key={i} style={{ border: "1px solid #ddd", borderRadius: 12, padding: "0.75rem", background: "#f8faf8" }}>
                <p style={{ margin: 0 }}>{note.text ?? note}</p>
                {note.photo && <img src={note.photo} alt="" style={{ maxWidth: 200, marginTop: "0.25rem", borderRadius: 8 }} />}
              </div>
            ))}
          </div>
        </details>
      )}

      {pois.length > 0 && (
        <details style={{ marginTop: "0.5rem" }}>
          <summary>Points d&apos;intérêt ({pois.length})</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginTop: "0.5rem" }}>
            {pois.map(poi => (
              <div key={poi.id} style={{ display: "grid", gridTemplateColumns: poi.photo_url ? "120px 1fr" : "1fr", gap: "0.75rem", border: "1px solid #ddd", borderRadius: 12, padding: "0.75rem", background: "#fff" }}>
                {poi.photo_url && <img src={poi.photo_url} alt="" style={{ width: "100%", height: 90, objectFit: "cover", borderRadius: 8 }} />}
                <div>
                  <p style={{ margin: 0, fontWeight: "bold" }}>{poi.poi_type && <span style={{ color: "#2e7d32" }}>[{poi.poi_type}] </span>}{poi.name}</p>
                  {poi.region && <p style={{ margin: "0.2rem 0", fontSize: "0.85rem", color: "#666" }}>{poi.region}</p>}
                  {poi.description && <p style={{ margin: "0.2rem 0", fontSize: "0.9rem" }}>{poi.description}</p>}
                  {poi.link_url && <a href={poi.link_url} target="_blank" rel="noopener" style={{ fontSize: "0.85rem" }}>Ouvrir le lien →</a>}
                </div>
              </div>
            ))}
          </div>
        </details>
      )}

      {variants.length > 0 && (
        <div style={{ marginTop: "0.5rem" }}>
          <p style={{ fontWeight: "bold", fontSize: "0.9rem", color: "#555", marginBottom: "0.3rem" }}>Variantes ({variants.length})</p>
          {variants.map(v => <VariantCard key={v.id} v={v} />)}
        </div>
      )}

      {stageGpx && (
        <p style={{ marginTop: "0.5rem" }}>
          <strong>GPX d&apos;étape :</strong>{" "}
          <a href={stageGpx.signedUrl} download={stageGpx.file_name ?? "etape.gpx"}>
            {stageGpx.file_name ?? "Télécharger"}
          </a>
        </p>
      )}
    </article>
  );
}

function SummaryStat({ label, value, unit }) {
  return (
    <div>
      <dt style={{ fontWeight: "bold" }}>{label}</dt>
      <dd style={{ margin: 0, fontSize: "1.1rem" }}>{value != null ? value + (unit ? " " + unit : "") : "—"}</dd>
    </div>
  );
}

function SectionTitle({ children }) {
  return <h2 style={{ marginBottom: "0.75rem" }}>{children}</h2>;
}

function GlobalSummary({ distance, elevationGain, elevationLoss, stageCount }) {
  const hasTotal = stageCount > 0 && (distance > 0 || elevationGain > 0 || elevationLoss > 0);
  if (!hasTotal) return null;

  return (
    <Section>
      <SectionTitle>Résumé du parcours</SectionTitle>
      <dl style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap" }}>
        <SummaryStat label="Distance totale" value={distance} unit="km" />
        <SummaryStat label="Dénivelé +" value={elevationGain} unit="m" />
        <SummaryStat label="Dénivelé −" value={elevationLoss} unit="m" />
        <SummaryStat label="Étapes" value={stageCount} />
      </dl>
    </Section>
  );
}
