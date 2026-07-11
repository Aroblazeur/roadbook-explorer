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
    <>
      <header className="header">
        <div className="container">
          <div className="header-title-wrapper">
            <svg className="header-logo" viewBox="0 0 80 40" fill="none" aria-hidden="true">
              <circle cx="32" cy="26" r="9" stroke="white" strokeWidth="2" fill="none" />
              <path d="M38 17 L42 13 L46 17" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <circle cx="55" cy="26" r="4" stroke="white" strokeWidth="1.5" fill="none" />
              <rect x="22" y="18" width="12" height="2" rx="1" fill="white" opacity="0.7" />
              <rect x="22" y="22" width="8" height="2" rx="1" fill="white" opacity="0.7" />
              <rect x="22" y="26" width="10" height="2" rx="1" fill="white" opacity="0.7" />
              <rect x="22" y="30" width="6" height="2" rx="1" fill="white" opacity="0.7" />
              <path d="M14 34 L14 8 C14 6 15 5 17 5 L38 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" fill="none" />
              <path d="M24 34 L24 12 C24 11 25 10 26 10 L38 10" stroke="white" strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.6" />
              <circle cx="42" cy="14" r="3" fill="white" opacity="0.9" />
            </svg>
            <h1>{roadbook.title}</h1>
            <svg className="header-logo header-logo--outdoor" viewBox="0 0 80 40" fill="none" aria-hidden="true">
              <path d="M20 35 L36 8 L52 35" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              <path d="M12 35 L68 35" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M36 18 L44 35" stroke="white" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
              <circle cx="52" cy="22" r="4" stroke="white" strokeWidth="1.5" fill="none" />
              <circle cx="52" cy="22" r="1.5" fill="white" />
              <circle cx="20" cy="26" r="3" stroke="white" strokeWidth="1.5" fill="none" />
              <path d="M56 35 L60 28 L64 35" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
            </svg>
          </div>
          {roadbook.description && <p>{roadbook.description}</p>}
        </div>
      </header>
      <main className="container">

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

      <section className="card">
        <h2>{stageParam != null ? `Étape ${stageParam + 1}` : `Étapes (${stages.length})`}</h2>
        {stages.length === 0 && <p className="empty">Ce roadbook n&apos;a pas encore d&apos;étapes.</p>}
        <ol className="home-stage-list__items">
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

      <nav id="day-navigation" style={{ marginTop: "1.5rem" }}>
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
    </>
  );
}

function GpxOfficialSection({ gpx }) {
  return (
    <div className="card">
      <h2>Trace officielle</h2>
      <p>
        Télécharger le GPX officiel complet :{" "}
        <a href={gpx.signedUrl} download={gpx.file_name ?? "trace.gpx"}>
          {gpx.file_name ?? "trace.gpx"}
        </a>
      </p>
      <MapViewerClient gpxUrl={gpx.signedUrl} height={350} />
    </div>
  );
}

function GpxCustomSection({ gpx, totals }) {
  return (
    <div className="card">
      <h2>GPX personnalisé</h2>
      {totals && (
        <div className="stats" style={{ marginBottom: "0.75rem" }}>
          <span className="stat"><StatIconDistance /><span className="stat__value"><strong>{totals.distance ?? "—"}</strong> km</span> <span className="stat__label">Distance</span></span>
          <span className="stat"><StatIconElevationGain /><span className="stat__value"><strong>{totals.elevationGain ?? "—"}</strong> m</span> <span className="stat__label">D+</span></span>
          <span className="stat"><StatIconElevationLoss /><span className="stat__value"><strong>{totals.elevationLoss ?? "—"}</strong> m</span> <span className="stat__label">D−</span></span>
        </div>
      )}
      <p>
        Télécharger le GPX personnalisé :{" "}
        <a href={gpx.signedUrl} download={gpx.file_name ?? "personnalise.gpx"}>
          {gpx.file_name ?? "personnalise.gpx"}
        </a>
      </p>
      <MapViewerClient gpxUrl={gpx.signedUrl} height={350} />
    </div>
  );
}

function ImagesSection({ images }) {
  return (
    <div className="card">
      <h2>Images ({images.length})</h2>
      <div className="flex flex-wrap gap-1">
        {images.map(img => (
          <div key={img.id} style={{ width: 180 }}>
            {img.signedUrl && <img src={img.signedUrl} alt={img.file_name ?? "image"} style={{ width: "100%", height: 135, objectFit: "cover", borderRadius: 8 }} />}
            <div className="text-muted" style={{ fontSize: "0.75rem", marginTop: "0.2rem" }}>{img.file_name}</div>
          </div>
        ))}
      </div>
    </div>
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
    <div className="variant-card">
      <p style={{ margin: 0 }}>
        <span style={{ color: "#888", marginRight: "4px" }}>↳</span>
        {vType && <span className="variant-badge">{vType}</span>}
        <strong>{v.label}</strong>
      </p>
      {(vDep || vArr) && (
        <p className="text-muted" style={{ margin: "0.25rem 0", fontSize: "0.9rem" }}>
          {vDep && <span>{vDep}</span>}
          {vDep && vArr && <> → </>}
          {vArr && <span>{vArr}</span>}
        </p>
      )}
      <div className="stats stats--compact" style={{ gap: "0.3rem", margin: "0.25rem 0 0" }}>
        {v.distance_km != null && <span className="variant-pill"><strong>{v.distance_km}</strong> km</span>}
        {vGain != null && <span className="variant-pill"><strong>{vGain}</strong> m D+</span>}
        {vLoss != null && <span className="variant-pill"><strong>{vLoss}</strong> m D−</span>}
      </div>
      {v.description && <p className="text-muted" style={{ margin: "0.25rem 0", fontSize: "0.88rem", lineHeight: "1.45" }}>{v.description}</p>}
    </div>
  );
}

function Pills({ distanceKm, elevationGain, elevationLoss, duration }) {
  const items = [];
  if (distanceKm != null) items.push({ label: "Distance", value: distanceKm, unit: "km", icon: StatIconDistance });
  if (elevationGain != null) items.push({ label: "D+", value: elevationGain, unit: "m", icon: StatIconElevationGain });
  if (elevationLoss != null) items.push({ label: "D−", value: elevationLoss, unit: "m", icon: StatIconElevationLoss });
  if (duration) items.push({ label: "Durée", value: duration, icon: StatIconDuration });
  if (!items.length) return null;
  return (
    <div className="stats stats--compact" style={{ margin: "0.5rem 0" }}>
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <span key={i} className="stat">
            {Icon && <Icon />}
            <span className="stat__value"><strong>{item.value}</strong> {item.unit}</span>
            <span className="stat__label">{item.label}</span>
          </span>
        );
      })}
    </div>
  );
}

function StageCard({ stage, pois, variants, stageGpx, showMap = false }) {
  const meta = stage.metadata ?? {};
  const accommodationTypeIcon = stage.accommodation_type === "hotel" ? "🏨" : stage.accommodation_type === "camping" ? "⛺" : stage.accommodation_type === "gite" ? "🏡" : stage.accommodation_type === "hostel" ? "🛏️" : "🏠";
  return (
    <div className="stage-card" style={{ margin: "12px 0" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
        <span className="stage-number-circle" style={{ minWidth: 42, width: 42, height: 42, fontSize: "1.1rem" }}>
          {stage.stage_number}
        </span>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0 }}>
            {stage.stage_label || (stage.day ? `${stage.day}` : "")}
            {stage.title && <span className="text-muted" style={{ fontWeight: "normal" }}> — {stage.title}</span>}
          </h3>
          {(stage.departure || stage.arrival) && (
            <p className="stage-route-links">
              {stage.departure && <span className="stage-city-link">Départ : {stage.departure}</span>}
              {stage.departure && stage.arrival && <> → </>}
              {stage.arrival && <span className="stage-city-link">Arrivée : {stage.arrival}</span>}
            </p>
          )}
        </div>
      </div>

      {stage.stage_photo_url && (
        <figure className="stage-photo">
          <img src={stage.stage_photo_url} alt="" className="stage-photo__image" />
        </figure>
      )}

      <Pills distanceKm={stage.distance_km} elevationGain={stage.elevation_gain_m} elevationLoss={stage.elevation_loss_m} duration={stage.duration} />

      {meta.description && <p className="stage-description">{meta.description}</p>}
      {meta.warning && <p className="stage-warning">⚠ {meta.warning}</p>}

      {/* Accommodation */}
      {stage.accommodation_name && (
        <div className="accommodation-resource">
          {stage.accommodation_photo && <img src={stage.accommodation_photo} alt={stage.accommodation_name} className="accommodation-resource__image" loading="lazy" />}
          {stage.accommodation_url ? (
            <a href={stage.accommodation_url} target="_blank" rel="noopener noreferrer" className="terrain-button terrain-button--secondary accommodation-resource__website-link" style={{ textDecoration: "none" }}>
              <span className="accommodation-type-icon">{accommodationTypeIcon}</span> {stage.accommodation_name}
            </a>
          ) : (
            <p><strong>{stage.accommodation_name}</strong></p>
          )}
        </div>
      )}

      {/* Map */}
      {showMap && stage.map_embed_url && (
        <div id="stage-map-embed" className="map-embed">
          <iframe src={stage.map_embed_url} width="100%" height="100%" allowFullScreen loading="lazy" />
        </div>
      )}
      {showMap && !stage.map_embed_url && stageGpx && (
        <div id="stage-map-embed" className="map-embed">
          <MapViewerClient gpxUrl={stageGpx.signedUrl} height={300} />
        </div>
      )}

      {/* Notes */}
      {Array.isArray(stage.notes) && stage.notes.length > 0 && (
        <details style={{ marginTop: "0.5rem" }}>
          <summary><strong>Notes ({stage.notes.length})</strong></summary>
          <ul className="note-list" style={{ marginTop: "0.5rem" }}>
            {stage.notes.map((note, i) => (
              <li key={i} className="note-item">
                <p className="note-item__text">{note.text ?? note}</p>
                {note.photo && <img src={note.photo} alt="" className="note-item__photo" />}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* POI */}
      {pois.length > 0 && (
        <details style={{ marginTop: "0.5rem" }}>
          <summary><strong>Points d&apos;intérêt ({pois.length})</strong></summary>
          <ul className="poi-list poi-list--enriched" style={{ marginTop: "0.5rem" }}>
            {pois.map(poi => (
              <li key={poi.id} className="poi-card">
                {poi.photo_url && <img src={poi.photo_url} alt="" className="poi-card__image" loading="lazy" />}
                <div className="poi-card__content">
                  <strong className="poi-card__name">{poi.poi_type && <span style={{ color: "#2e7d32" }}>[{poi.poi_type}] </span>}{poi.name}</strong>
                  {poi.region && <p className="poi-card__region">{poi.region}</p>}
                  {poi.description && <p className="poi-card__description">{poi.description}</p>}
                  {poi.link_url && <a href={poi.link_url} target="_blank" rel="noopener" className="poi-card__map-link">Ouvrir le lien →</a>}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Variants */}
      {variants.length > 0 && (
        <div style={{ marginTop: "0.75rem" }}>
          <p className="text-muted" style={{ fontWeight: "bold", fontSize: "0.9rem", marginBottom: "0.3rem" }}>Variantes ({variants.length})</p>
          {variants.map(v => <VariantCard key={v.id} v={v} />)}
        </div>
      )}

      {stageGpx && (
        <p className="gpx-actions" style={{ marginTop: "0.5rem" }}>
          <strong>GPX d&apos;étape :</strong>{" "}
          <a href={stageGpx.signedUrl} download={stageGpx.file_name ?? "etape.gpx"}>
            {stageGpx.file_name ?? "Télécharger"}
          </a>
        </p>
      )}
    </div>
  );
}

function StatIconDistance() {
  return <svg className="stat__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 17 17 4l3 3L7 20 4 17Z" /><path d="M8 13 11 16" /><path d="M11 10 14 13" /><path d="M14 7 17 10" /></svg>;
}
function StatIconElevationGain() {
  return <svg className="stat__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 18 6.5-11 4.5 7 2-3 5 7H3Z" /><path d="M16 4v6" /><path d="m13.5 6.5 2.5-2.5 2.5 2.5" /></svg>;
}
function StatIconElevationLoss() {
  return <svg className="stat__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3 18 6.5-11 4.5 7 2-3 5 7H3Z" /><path d="M16 4v6" /><path d="m13.5 7.5 2.5 2.5 2.5-2.5" /></svg>;
}
function StatIconDuration() {
  return <svg className="stat__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></svg>;
}

function GlobalSummary({ distance, elevationGain, elevationLoss, stageCount }) {
  const hasTotal = stageCount > 0 && (distance > 0 || elevationGain > 0 || elevationLoss > 0);
  if (!hasTotal) return null;

  return (
    <div className="card">
      <h2>Résumé du parcours</h2>
      <div className="stats" style={{ marginBottom: "0.5rem" }}>
        <span className="stat"><StatIconDistance /><span className="stat__value"><strong>{distance ?? "—"}</strong> km</span> <span className="stat__label">Distance</span></span>
        <span className="stat"><StatIconElevationGain /><span className="stat__value"><strong>{elevationGain ?? "—"}</strong> m</span> <span className="stat__label">D+</span></span>
        <span className="stat"><StatIconElevationLoss /><span className="stat__value"><strong>{elevationLoss ?? "—"}</strong> m</span> <span className="stat__label">D−</span></span>
        <span className="stat"><span className="stat__value"><strong>{stageCount}</strong></span> <span className="stat__label">Étapes</span></span>
      </div>
    </div>
  );
}
