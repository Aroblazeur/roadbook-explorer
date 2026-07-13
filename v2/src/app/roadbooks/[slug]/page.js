import Link from "next/link";
import { notFound } from "next/navigation";
import MapViewerClient from "@/components/MapViewerClient";
import { createServerSupabase } from "@/lib/supabase-server";

async function getRoadbook(slug) {
  const supabase = await createServerSupabase();

  const { data: { user } } = await supabase.auth.getUser();

  const { data: roadbook, error } = await supabase
    .from("roadbooks")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) return { error: error.message };

  if (!roadbook) {
    if (user) return { private: true };
    return null;
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
    return <PrivateRoadbook />;
  }
  if (result.error) {
    return <TechnicalError message={result.error} />;
  }

  const { roadbook, stages, pois, variants, images, gpxOfficial, gpxCustom, gpxByStage, coverSignedUrl, totals } = result;
  const stageParam = searchParams?.stage ? Number(searchParams.stage) : null;

  const poisByStage = {};
  pois.forEach(p => { if (!poisByStage[p.stage_id]) poisByStage[p.stage_id] = []; poisByStage[p.stage_id].push(p); });
  const variantsByStage = {};
  variants.forEach(v => { if (!variantsByStage[v.stage_id]) variantsByStage[v.stage_id] = []; variantsByStage[v.stage_id].push(v); });

  const currentIdx = Number.isInteger(stageParam) && stageParam >= 0 && stageParam < stages.length ? stageParam : null;
  const currentStage = currentIdx != null ? stages[currentIdx] : null;

  return (
    <>
      <RoadbookHeader roadbook={roadbook} />
      <main className="container">
      {currentIdx == null ? (
        <>
          <RoadbookOverview
            roadbook={roadbook}
            stages={stages}
            totals={totals}
            gpxOfficial={gpxOfficial}
            gpxCustom={gpxCustom}
          />
          {images.length > 0 && <ImagesSection images={images} />}
        </>
      ) : (
        <section className="card">
          <h2>Étape {currentIdx + 1}</h2>
          <ol className="home-stage-list__items">
            <li>
              <StageCard
                stage={currentStage}
                pois={poisByStage[currentStage.id] ?? []}
                variants={variantsByStage[currentStage.id] ?? []}
                stageGpx={gpxByStage[currentStage.id] ?? null}
                showMap
              />
            </li>
          </ol>
        </section>
      )}

      <nav id="day-navigation" style={{ marginTop: "1.5rem" }}>
        {currentIdx != null && currentIdx > 0
          ? <Link href={`/roadbooks/${roadbook.slug}?stage=${currentIdx - 1}`}>← Étape précédente</Link>
          : <span />}
        <Link href={currentIdx != null ? `/roadbooks/${roadbook.slug}` : "/explore"}>
          {currentIdx != null ? "Vue d'ensemble" : "Retour aux roadbooks"}
        </Link>
        {currentIdx != null && currentIdx < stages.length - 1
          ? <Link href={`/roadbooks/${roadbook.slug}?stage=${currentIdx + 1}`}>Étape suivante →</Link>
          : <span />}
      </nav>
    </main>
    </>
  );
}

function RoadbookHeader({ roadbook }) {
  return (
    <header className="header roadbook-header">
      <div className="container">
        <div className="header-title-wrapper">
          <svg className="header-logo" viewBox="0 0 100 48" aria-hidden="true" focusable="false">
            <circle cx="28" cy="36" r="10" fill="none" stroke="white" strokeWidth="2.5" />
            <circle cx="28" cy="36" r="2.5" fill="white" />
            <circle cx="60" cy="36" r="10" fill="none" stroke="white" strokeWidth="2.5" />
            <circle cx="60" cy="36" r="2.5" fill="white" />
            <line x1="28" y1="36" x2="44" y2="16" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="44" y1="16" x2="60" y2="36" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="44" y1="16" x2="44" y2="36" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="28" y1="36" x2="44" y2="36" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="60" y1="36" x2="62" y2="20" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="58" y1="20" x2="66" y2="20" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="44" y1="16" x2="48" y2="14" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <line x1="45" y1="14" x2="52" y2="14" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="28" y1="36" x2="10" y2="36" stroke="rgba(255,255,255,0.8)" strokeWidth="2" strokeLinecap="round" />
            <rect x="2" y="27" width="18" height="11" rx="2" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" />
            <circle cx="11" cy="38" r="5" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" />
            <circle cx="11" cy="38" r="1.5" fill="rgba(255,255,255,0.85)" />
            <polyline points="68,26 78,10 88,26" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinejoin="round" />
            <polyline points="82,26 90,14 98,26" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <h1>{roadbook.title}</h1>
          <svg className="header-logo header-logo--outdoor" viewBox="0 0 100 48" aria-hidden="true" focusable="false">
            <polyline points="4,38 22,14 38,38" fill="none" stroke="white" strokeWidth="2.5" strokeLinejoin="round" />
            <polyline points="30,38 52,10 76,38" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M50 38 L66 20 L82 38 Z" fill="none" stroke="white" strokeWidth="2.5" strokeLinejoin="round" />
            <path d="M66 20 L66 38" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2" />
            <path d="M8 42 C26 38, 42 44, 60 40 C72 37, 84 39, 94 35" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2" strokeLinecap="round" />
            <circle cx="86" cy="10" r="2" fill="white" />
          </svg>
        </div>
        {roadbook.description && <p className="roadbook-header__description">{roadbook.description}</p>}
        <nav className="header-nav" aria-label="Navigation du roadbook">
          <Link href="/explore">Retour aux roadbooks</Link>
          <Link href="/dashboard">✏️ Studio</Link>
        </nav>
      </div>
    </header>
  );
}

function RoadbookOverview({ roadbook, stages, totals, gpxOfficial, gpxCustom }) {
  const metadata = roadbook.metadata ?? {};
  const official = metadata.official ?? {};
  const savedCurrent = metadata.stagesTotal ?? {};
  const current = {
    distance: savedCurrent.distance ?? totals.distance,
    elevationGain: savedCurrent.elevationGain ?? totals.elevationGain,
    elevationLoss: savedCurrent.elevationLoss ?? totals.elevationLoss,
    gpx: savedCurrent.gpx,
    mapEmbedUrl: savedCurrent.mapEmbedUrl,
  };

  return (
    <section id="summary" className="card roadbook-overview" aria-label="Synthèse du roadbook">
      <RouteSummary
        className="official-itinerary"
        heading="Itinéraire officiel"
        summary={official}
        gpx={gpxOfficial}
        mapTitle="Carte interactive de l'itinéraire officiel"
        downloadLabel="Télécharger le tracé officiel"
      />
      <StageOverviewList roadbookSlug={roadbook.slug} stages={stages} />
      <RouteSummary
        className="roadbook-current-summary"
        heading="Tracé total actuel"
        summary={current}
        gpx={gpxCustom}
        mapTitle="Carte interactive du tracé total actuel"
        downloadLabel="Télécharger le tracé total actuel"
      />
    </section>
  );
}

function RouteSummary({ className, heading, summary, gpx, mapTitle, downloadLabel }) {
  const traceUrl = gpx?.signedUrl ?? summary.gpx ?? null;
  const hasMetrics = summary.distance != null || summary.elevationGain != null || summary.elevationLoss != null;
  const hasMap = Boolean(summary.mapEmbedUrl || traceUrl);
  if (!hasMetrics && !hasMap) return null;

  return (
    <div className={className}>
      <h3>{heading}</h3>
      {hasMetrics && (
        <Pills distanceKm={summary.distance} elevationGain={summary.elevationGain} elevationLoss={summary.elevationLoss} />
      )}
      {summary.mapEmbedUrl ? (
        <div className={`${className}__map map-embed`}>
          <iframe src={summary.mapEmbedUrl} title={mapTitle} width="100%" height="100%" allowFullScreen loading="lazy" />
        </div>
      ) : traceUrl ? (
        <div className={`${className}__map map-embed`}>
          <MapViewerClient gpxUrl={traceUrl} height={300} />
        </div>
      ) : null}
      {traceUrl && (
        <div className={`${className}__actions`}>
          <a className="terrain-button terrain-button--secondary" href={traceUrl} download={gpx?.file_name ?? "trace.gpx"}>
            {downloadLabel}
          </a>
        </div>
      )}
    </div>
  );
}

function StageOverviewList({ roadbookSlug, stages }) {
  return (
    <section className="home-stage-list" aria-labelledby="home-stage-list-title">
      <h2 id="home-stage-list-title">Étapes</h2>
      {stages.length === 0 ? (
        <p className="empty">Ce roadbook n&apos;a pas encore d&apos;étapes.</p>
      ) : (
        <ol className="home-stage-list__items">
          {stages.map((stage, index) => (
            <li key={stage.id}>
              <StageOverviewCard roadbookSlug={roadbookSlug} stage={stage} index={index} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function StageOverviewCard({ roadbookSlug, stage, index }) {
  const metadata = stage.metadata ?? {};
  const isSubstep = Boolean(stage.is_substep ?? metadata.isSubstep ?? metadata.is_substep);
  const route = [stage.departure, stage.arrival].filter(Boolean).join(" → ")
    || stage.title
    || stage.stage_label
    || `Étape ${index + 1}`;

  return (
    <Link
      className={`home-stage-card${isSubstep ? " home-stage-card--substep" : ""}`}
      href={`/roadbooks/${roadbookSlug}?stage=${index}`}
      aria-label={`Ouvrir l'étape ${stage.stage_number ?? index + 1} : ${route}`}
    >
      <span className="home-stage-card__number">{isSubstep ? "↳" : stage.stage_number ?? index + 1}</span>
      <span className="home-stage-card__content">
        <strong className="home-stage-card__route">{route}</strong>
        {isSubstep && metadata.type && <span className="home-stage-card__substep-type">{metadata.type}</span>}
        <span className="home-stage-card__stats stats stats--compact">
          <OverviewStat value={stage.distance_km} unit="km" label="Distance" icon={StatIconDistance} />
          <OverviewStat value={stage.elevation_gain_m} unit="m" label="D+" icon={StatIconElevationGain} />
          <OverviewStat value={stage.elevation_loss_m} unit="m" label="D−" icon={StatIconElevationLoss} />
        </span>
      </span>
      {(stage.accommodation_type || stage.accommodation_name) && (
        <span className="home-stage-card__accommodation" aria-label={`Hébergement${stage.accommodation_name ? ` : ${stage.accommodation_name}` : ""}`}>
          {accommodationIcon(stage.accommodation_type, stage.accommodation_name)}
        </span>
      )}
    </Link>
  );
}

function OverviewStat({ value, unit, label, icon: Icon }) {
  if (value == null) return null;
  return (
    <span className="stat">
      <Icon />
      <span className="stat__value"><strong>{value}</strong> {unit}</span>
      <span className="stat__label">{label}</span>
    </span>
  );
}

function accommodationIcon(type, name) {
  const normalized = `${type ?? ""} ${name ?? ""}`.toLowerCase();
  if (normalized.includes("camp")) return "⛺";
  if (normalized.includes("hotel") || normalized.includes("hôtel")) return "🏨";
  if (normalized.includes("gite") || normalized.includes("gîte")) return "🏡";
  if (normalized.includes("hostel") || normalized.includes("auberge")) return "🛏️";
  return name ? "🏠" : "—";
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

function PrivateRoadbook() {
  return (
    <main className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
      <div className="card" style={{ maxWidth: 480, margin: "0 auto" }}>
        <h1>Roadbook privé</h1>
        <p>Ce roadbook n&apos;est pas accessible avec votre compte.</p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", marginTop: "1.5rem", flexWrap: "wrap" }}>
          <Link href="/" className="terrain-button" style={{ display: "inline-flex", padding: "0.6rem 1.2rem", borderRadius: 8, background: "var(--primary)", color: "#fff", textDecoration: "none", fontWeight: 700 }}>
            Explorer
          </Link>
          <Link href="/login" className="terrain-button terrain-button--secondary" style={{ display: "inline-flex", padding: "0.6rem 1.2rem", borderRadius: 8, textDecoration: "none", fontWeight: 700 }}>
            Se connecter
          </Link>
        </div>
      </div>
    </main>
  );
}

function TechnicalError({ message }) {
  return (
    <main className="container" style={{ paddingTop: "4rem", textAlign: "center" }}>
      <div className="card" style={{ maxWidth: 480, margin: "0 auto" }}>
        <h1>Erreur technique</h1>
        <p>Impossible de charger ce roadbook pour le moment.</p>
        {message && <p style={{ fontSize: "0.85rem", color: "var(--text-light)" }}>{message}</p>}
        <p style={{ marginTop: "1.5rem" }}>
          <Link href="/">Retour à l&apos;accueil</Link>
        </p>
      </div>
    </main>
  );
}
