import Link from "next/link";
import { notFound } from "next/navigation";
import MapViewerClient from "@/components/MapViewerClient";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSignedMediaAccess, loadExplorerGpxMedia } from "@/lib/roadbooks/loaders";
import { resolveExplorerGpxUrl } from "@/lib/roadbooks/gpx-media";

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

  const images = [];
  for (const m of allMedia) {
    if (m.type === "image") {
      const access = await getSignedMediaAccess(supabase, m, {
        context: "explorer-roadbook-image",
      });
      images.push({ ...m, signedUrl: access.signedUrl, access });
    }
  }
  const { gpxOfficial, gpxCustom, gpxByStage, gpxByVariant } = await loadExplorerGpxMedia(
    supabase,
    allMedia.filter(media => media.type === "gpx"),
  );

  let coverSignedUrl = null;
  let coverMediaAccess = { status: "absent", signedUrl: null, error: null };
  if (roadbook.cover_image_url) {
    coverSignedUrl = roadbook.cover_image_url;
    coverMediaAccess = { status: "available", signedUrl: coverSignedUrl, error: null };
  } else if (roadbook.cover_media_id) {
    const { data: coverMedia } = await supabase.from("media").select("id, bucket, path").eq("id", roadbook.cover_media_id).maybeSingle();
    if (coverMedia) {
      coverMediaAccess = await getSignedMediaAccess(supabase, coverMedia, {
        context: "explorer-roadbook-cover",
      });
      coverSignedUrl = coverMediaAccess.signedUrl;
    }
  }

  const totalDistance = (stages ?? []).reduce((sum, s) => sum + (s.distance_km ?? 0), 0);
  const totalElevationGain = (stages ?? []).reduce((sum, s) => sum + (s.elevation_gain_m ?? 0), 0);
  const totalElevationLoss = (stages ?? []).reduce((sum, s) => sum + (s.elevation_loss_m ?? 0), 0);

  return { roadbook, stages: stages ?? [], pois, variants, images, gpxOfficial, gpxCustom, gpxByStage, gpxByVariant, coverSignedUrl, coverMediaAccess, totals: { distance: totalDistance, elevationGain: totalElevationGain, elevationLoss: totalElevationLoss }, private: false };
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

  const { roadbook, stages, pois, variants, images, gpxOfficial, gpxCustom, gpxByStage, gpxByVariant, coverSignedUrl, totals } = result;
  const stageParam = searchParams?.stage ? Number(searchParams.stage) : null;
  const variantParam = searchParams?.variant ? String(searchParams.variant) : null;

  const poisByStage = {};
  const poisByVariant = {};
  pois.forEach(p => {
    if (p.variant_id != null) {
      if (!poisByVariant[p.variant_id]) poisByVariant[p.variant_id] = [];
      poisByVariant[p.variant_id].push(p);
      return;
    }
    if (!poisByStage[p.stage_id]) poisByStage[p.stage_id] = [];
    poisByStage[p.stage_id].push(p);
  });
  const variantsByStage = {};
  variants.forEach(v => { if (!variantsByStage[v.stage_id]) variantsByStage[v.stage_id] = []; variantsByStage[v.stage_id].push(v); });

  const entries = buildRoadbookEntries(stages, variantsByStage);
  const currentStageIdx = Number.isInteger(stageParam) && stageParam >= 0 && stageParam < stages.length ? stageParam : null;
  const currentVariant = variantParam == null
    ? null
    : variants.find(variant => String(variant.id) === variantParam) ?? null;
  const currentEntryIndex = currentVariant
    ? entries.findIndex(entry => entry.type === "variant" && entry.item.id === currentVariant.id)
    : currentStageIdx == null
      ? -1
      : entries.findIndex(entry => entry.type === "stage" && entry.stageIndex === currentStageIdx);
  const currentEntry = currentEntryIndex >= 0 ? entries[currentEntryIndex] : null;

  return (
    <>
      <RoadbookHeader roadbook={roadbook} />
      <main className="container">
      {currentEntry == null ? (
        <>
          <RoadbookOverview
            roadbook={roadbook}
            stages={stages}
            variantsByStage={variantsByStage}
            totals={totals}
            gpxOfficial={gpxOfficial}
            gpxCustom={gpxCustom}
          />
          {images.length > 0 && <ImagesSection images={images} />}
          <nav id="day-navigation" style={{ marginTop: "1.5rem" }}>
            <span />
            <Link href="/explore">Retour aux roadbooks</Link>
            <span />
          </nav>
        </>
      ) : currentEntry.type === "stage" ? (
        <StageDetailPage
          roadbook={roadbook}
          entries={entries}
          currentEntryIndex={currentEntryIndex}
          stage={currentEntry.item}
          stageIndex={currentEntry.stageIndex}
          pois={poisByStage[currentEntry.item.id] ?? []}
          stageGpx={gpxByStage[currentEntry.item.id] ?? null}
          stagePhotoUrl={images.find(image => image.stage_id === currentEntry.item.id && image.signedUrl)?.signedUrl ?? null}
        />
      ) : (
        <VariantDetailPage
          roadbook={roadbook}
          entries={entries}
          currentEntryIndex={currentEntryIndex}
          variant={currentEntry.item}
          parentStage={currentEntry.parentStage}
          pois={poisByVariant[currentEntry.item.id] ?? []}
          variantGpx={gpxByVariant[currentEntry.item.id] ?? null}
          variantPhotoUrl={images.find(image => String(image.metadata?.variant_id) === String(currentEntry.item.id) && image.signedUrl)?.signedUrl ?? null}
        />
      )}
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
          <Link href={`/dashboard/roadbooks/${roadbook.id}`}>✏️ Studio</Link>
        </nav>
      </div>
    </header>
  );
}

function RoadbookOverview({ roadbook, stages, variantsByStage, totals, gpxOfficial, gpxCustom }) {
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
      <StageOverviewList roadbookSlug={roadbook.slug} stages={stages} variantsByStage={variantsByStage} />
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
  const traceUrl = safeResourceUrl(resolveExplorerGpxUrl({ media: gpx, fallbackUrl: summary.gpx }).url);
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

function buildRoadbookEntries(stages, variantsByStage) {
  return stages.flatMap((stage, stageIndex) => [
    { type: "stage", item: stage, stageIndex },
    ...(variantsByStage[stage.id] ?? []).map((variant, variantIndex) => ({
      type: "variant",
      item: variant,
      parentStage: stage,
      stageIndex,
      variantIndex,
    })),
  ]);
}

function roadbookEntryHref(roadbookSlug, entry) {
  return entry.type === "variant"
    ? `/roadbooks/${roadbookSlug}?variant=${entry.item.id}`
    : `/roadbooks/${roadbookSlug}?stage=${entry.stageIndex}`;
}

function StageOverviewList({ roadbookSlug, stages, variantsByStage }) {
  return (
    <section className="home-stage-list" aria-labelledby="home-stage-list-title">
      <h2 id="home-stage-list-title">Étapes</h2>
      {stages.length === 0 ? (
        <p className="empty">Ce roadbook n&apos;a pas encore d&apos;étapes.</p>
      ) : (
        <ol className="home-stage-list__items">
          {buildRoadbookEntries(stages, variantsByStage).map(entry => (
            <li key={`${entry.type}-${entry.item.id}`}>
              {entry.type === "variant" ? (
                <VariantOverviewCard roadbookSlug={roadbookSlug} entry={entry} />
              ) : (
                <StageOverviewCard roadbookSlug={roadbookSlug} stage={entry.item} index={entry.stageIndex} />
              )}
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

function VariantOverviewCard({ roadbookSlug, entry }) {
  const { item: variant, parentStage } = entry;
  const metadata = variant.metadata ?? {};
  const type = metadata.type || metadata.itemType || "Variante";
  const departure = variant.departure ?? metadata.departure;
  const arrival = variant.arrival ?? metadata.arrival;
  const route = variant.label
    || [departure, arrival].filter(Boolean).join(" → ")
    || `Variante de l'étape ${parentStage.stage_number ?? entry.stageIndex + 1}`;

  return (
    <Link
      className="home-stage-card home-stage-card--substep"
      href={roadbookEntryHref(roadbookSlug, entry)}
      aria-label={`Ouvrir la variante ${route}`}
    >
      <span className="home-stage-card__number">↳</span>
      <span className="home-stage-card__content">
        <strong className="home-stage-card__route">{route}</strong>
        <span className="home-stage-card__substep-type">{type}</span>
        <span className="home-stage-card__stats stats stats--compact">
          <OverviewStat value={variant.distance_km} unit="km" label="Distance" icon={StatIconDistance} />
          <OverviewStat value={variant.elevation_gain_m ?? metadata.elevation_gain_m} unit="m" label="D+" icon={StatIconElevationGain} />
          <OverviewStat value={variant.elevation_loss_m ?? metadata.elevation_loss_m} unit="m" label="D−" icon={StatIconElevationLoss} />
        </span>
      </span>
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
  const availableImages = images.filter(img => img.access?.status === "available" && img.signedUrl);
  const inaccessibleCount = images.filter(img => img.access?.status === "inaccessible").length;

  return (
    <div className="card">
      <h2>Images ({availableImages.length})</h2>
      {inaccessibleCount > 0 && (
        <p className="text-muted" role="status">
          {inaccessibleCount === 1 ? "Une image est inaccessible." : `${inaccessibleCount} images sont inaccessibles.`}
        </p>
      )}
      {availableImages.length > 0 && <div className="flex flex-wrap gap-1">
        {availableImages.map(img => (
          <div key={img.id} style={{ width: 180 }}>
            <img src={img.signedUrl} alt={img.file_name ?? "image"} style={{ width: "100%", height: 135, objectFit: "cover", borderRadius: 8 }} />
            <div className="text-muted" style={{ fontSize: "0.75rem", marginTop: "0.2rem" }}>{img.file_name}</div>
          </div>
        ))}
      </div>}
    </div>
  );
}

function StageDetailPage({ roadbook, entries, currentEntryIndex, stage, stageIndex, pois, stageGpx, stagePhotoUrl }) {
  return (
    <section className="stage-detail-page" aria-label="Fiche détaillée de l'étape">
      <StageDetailNavigation roadbook={roadbook} entries={entries} currentEntryIndex={currentEntryIndex} />
      <StageCard
        stage={stage}
        stageIndex={stageIndex}
        pois={pois}
        stageGpx={stageGpx}
        stagePhotoUrl={stagePhotoUrl}
      />
    </section>
  );
}

function StageDetailNavigation({ roadbook, entries, currentEntryIndex }) {
  const overviewHref = `/roadbooks/${roadbook.slug}`;
  const currentEntry = entries[currentEntryIndex];
  const previousHref = currentEntryIndex === 0
    ? overviewHref
    : roadbookEntryHref(roadbook.slug, entries[currentEntryIndex - 1]);
  const nextHref = currentEntryIndex < entries.length - 1
    ? roadbookEntryHref(roadbook.slug, entries[currentEntryIndex + 1])
    : null;
  const stageNumber = currentEntry.parentStage?.stage_number ?? currentEntry.item.stage_number ?? currentEntry.stageIndex + 1;
  const currentLabel = currentEntry.type === "variant"
    ? `Variante – ${currentEntry.item.label || `étape ${stageNumber}`}`
    : currentEntry.item.stage_label || (currentEntry.item.day ? String(currentEntry.item.day) : `Étape ${stageNumber}`);

  return (
    <nav className="stage-detail-navigation card" aria-label="Navigation entre les étapes">
      <Link className="stage-detail-button stage-detail-button--secondary" href="/explore">
        ← Retour aux roadbooks
      </Link>
      <Link className="stage-detail-button" href={previousHref}>
        ← Étape précédente
      </Link>
      <div className="stage-detail-navigation__current">
        <strong>{currentLabel}</strong>
        <Link href={overviewHref}>Retour aux étapes</Link>
      </div>
      {nextHref ? (
        <Link className="stage-detail-button" href={nextHref}>
          Étape suivante →
        </Link>
      ) : (
        <span className="stage-detail-button stage-detail-button--disabled" aria-disabled="true">
          Étape suivante →
        </span>
      )}
    </nav>
  );
}

function VariantDetailPage({ roadbook, entries, currentEntryIndex, variant, parentStage, pois, variantGpx, variantPhotoUrl }) {
  return (
    <section className="stage-detail-page" aria-label="Fiche détaillée de la variante">
      <StageDetailNavigation roadbook={roadbook} entries={entries} currentEntryIndex={currentEntryIndex} />
      <VariantCard
        variant={variant}
        contextCity={parentStage?.arrival || parentStage?.departure || ""}
        pois={pois}
        variantGpx={variantGpx}
        variantPhotoUrl={variantPhotoUrl}
      />
    </section>
  );
}

function VariantCard({ variant, contextCity, pois = [], variantGpx, variantPhotoUrl }) {
  const meta = variant.metadata ?? {};
  const type = meta.type || meta.itemType;
  const gain = variant.elevation_gain_m ?? meta.elevation_gain_m;
  const loss = variant.elevation_loss_m ?? meta.elevation_loss_m;
  const departure = variant.departure ?? meta.departure;
  const arrival = variant.arrival ?? meta.arrival;
  const mapUrl = safeResourceUrl(variant.map_embed_url ?? meta.map_embed_url, { relative: false });
  const gpxUrl = safeResourceUrl(resolveExplorerGpxUrl({ media: variantGpx, fallbackUrl: variant.gpx_url }).url);
  const photoUrl = safeResourceUrl(variantPhotoUrl || variant.stage_photo_url || meta.stagePhoto);
  const notes = normalizeNoteItems(variant.notes ?? meta.notes);
  const legacyAccommodation = normalizeAccommodation(meta.accommodation ?? meta.legacyAccommodation);
  const accommodation = normalizeAccommodation({
    name: variant.accommodation_name ?? legacyAccommodation.name,
    url: variant.accommodation_url ?? legacyAccommodation.url,
    photo: variant.accommodation_photo ?? legacyAccommodation.photo,
    type: variant.accommodation_type ?? legacyAccommodation.type,
    note: meta.accommodationNote ?? legacyAccommodation.note,
  });
  const alternatives = normalizeAlternatives(variant.alternatives ?? meta.accommodation?.alternatives);
  if (meta.alternativeAccommodationName || meta.alternativeAccommodationPhoto) {
    alternatives.push(normalizeAccommodation({
      name: meta.alternativeAccommodationName,
      photo: meta.alternativeAccommodationPhoto,
    }));
  }

  return (
    <article className="stage-detail-card stage-detail-card--primary stage-detail-variant card">
      <header className="stage-detail-variant__header">
        <span className="stage-detail-variant__marker" aria-hidden="true">↳</span>
        <div>
          {type && <span className="stage-detail-variant__badge">{type}</span>}
          <h2>{variant.label || "Variante"}</h2>
        </div>
      </header>
      {photoUrl && (
        <figure className="stage-detail-photo">
          <img src={photoUrl} alt={`Photo de ${variant.label || "la variante"}`} loading="lazy" />
        </figure>
      )}
      {(departure || arrival) && <StageRoute departure={departure} arrival={arrival} />}
      <div className="stage-detail-variant__stats" aria-label="Statistiques de la variante">
        {variant.distance_km != null && <span><strong>{formatNumber(variant.distance_km)}</strong> km</span>}
        {gain != null && <span><strong>{formatNumber(gain)}</strong> m D+</span>}
        {loss != null && <span><strong>{formatNumber(loss)}</strong> m D−</span>}
        {variant.duration && <span><strong>{variant.duration}</strong></span>}
      </div>
      {variant.description && <p className="stage-detail-variant__description">{variant.description}</p>}
      <div className="stage-detail-variant__pois">
        <h4>Points d&apos;intérêt</h4>
        {pois.length > 0 ? (
          <ul className="stage-detail-poi-list">
            {pois.map(poi => <PoiCard key={poi.id} poi={poi} />)}
          </ul>
        ) : (
          <p className="stage-detail-empty">Non renseigné</p>
        )}
      </div>
      {notes.length > 0 && (
        <div className="stage-detail-variant__notes">
          <h4>Notes</h4>
          <NoteList notes={notes} imageAlt="Photo associée à la variante" />
        </div>
      )}
      {hasAccommodation(accommodation) && (
        <div className="stage-detail-variant__accommodation">
          <h4>Hébergement</h4>
          <AccommodationResource accommodation={accommodation} contextCity={arrival || departure || contextCity} compact />
        </div>
      )}
      {alternatives.filter(hasAccommodation).length > 0 && (
        <div className="stage-detail-variant__accommodation">
          <h4>Hébergements alternatifs</h4>
          <div className="stage-detail-accommodation-list">
            {alternatives.filter(hasAccommodation).map((item, index) => (
              <AccommodationResource key={`${item.name}-${item.url}-${index}`} accommodation={item} contextCity={arrival || departure || contextCity} compact />
            ))}
          </div>
        </div>
      )}
      {(mapUrl || gpxUrl) && (
        <div className="stage-detail-variant__map">
          <h4>Tracé de la variante</h4>
          {mapUrl ? (
            <div className="stage-detail-map">
              <iframe src={mapUrl} title={`Carte de la variante ${variant.label || ""}`} allowFullScreen loading="lazy" />
            </div>
          ) : (
            <div className="stage-detail-map">
              <MapViewerClient gpxUrl={gpxUrl} height={260} />
            </div>
          )}
          {gpxUrl && (
            <a className="stage-detail-button stage-detail-button--secondary" href={gpxUrl} download>
              Télécharger le GPX de la variante
            </a>
          )}
        </div>
      )}
    </article>
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

function StageCard({ stage, stageIndex, pois, stageGpx, stagePhotoUrl }) {
  const meta = stage.metadata ?? {};
  const stageNumber = stage.stage_number ?? stageIndex + 1;
  const stageLabel = stage.stage_label || (stage.day ? String(stage.day) : `Étape ${stageNumber}`);
  const title = stageHeadingTitle(stage, stageNumber, stageLabel);
  const photoUrl = safeResourceUrl(stagePhotoUrl || stage.stage_photo_url);
  const stageGpxUrl = safeResourceUrl(resolveExplorerGpxUrl({ media: stageGpx, fallbackUrl: stage.gpx_url }).url);
  const mapUrl = safeResourceUrl(stage.map_embed_url, { relative: false });
  const normalizedNotes = normalizeNoteItems(stage.notes);
  const warningNotes = normalizedNotes.filter(note => note.type === "warning");
  const notes = normalizedNotes.filter(note => note.type !== "warning");
  const warnings = normalizeWarnings(meta.warning, meta.warnings, warningNotes);
  const accommodation = normalizeAccommodation({
    name: stage.accommodation_name,
    url: stage.accommodation_url,
    photo: stage.accommodation_photo,
    type: stage.accommodation_type,
    note: meta.accommodationNote ?? meta.accommodation?.note,
  });
  const alternatives = normalizeAlternatives(stage.alternatives);
  if (meta.alternativeAccommodationName || meta.alternativeAccommodationPhoto) {
    alternatives.push(normalizeAccommodation({
      name: meta.alternativeAccommodationName,
      photo: meta.alternativeAccommodationPhoto,
    }));
  }
  const contextCity = stage.arrival || stage.departure || "";

  return (
    <>
      <article className="stage-detail-card stage-detail-card--primary card">
        <header className="stage-detail-heading">
          <span className="stage-detail-heading__number" aria-hidden="true">{stage.is_substep ? "↳" : stageNumber}</span>
          <div>
            <h2>{title || `Étape ${stageNumber}`}</h2>
            {(stage.departure || stage.arrival) && <StageRoute departure={stage.departure} arrival={stage.arrival} />}
          </div>
        </header>

        {photoUrl && (
          <figure className="stage-detail-photo">
            <img src={photoUrl} alt={`Photo de ${stage.title || stageLabel}`} loading="lazy" />
          </figure>
        )}

        <StageDetailStats stage={stage} />
        {(meta.description || stage.description) && <p className="stage-detail-description">{meta.description || stage.description}</p>}
        {warnings.length > 0 && (
          <div className="stage-detail-warning" role="note" aria-label="Avertissement">
            <span aria-hidden="true">⚠</span>
            <div>{warnings.map((warning, index) => <p key={`${warning}-${index}`}>{warning}</p>)}</div>
          </div>
        )}
      </article>

      <section className="stage-detail-card stage-detail-notes card" aria-labelledby="stage-detail-notes-title">
        <h2 id="stage-detail-notes-title">Notes ({notes.length})</h2>
        {notes.length > 0 && <NoteList notes={notes} imageAlt="Photo associée à la note" />}
      </section>

      <section className="stage-detail-card stage-detail-pois card" aria-labelledby="stage-detail-pois-title">
        <h2 id="stage-detail-pois-title">Points d&apos;intérêt</h2>
        {pois.length > 0 ? (
          <ul className="stage-detail-poi-list">
            {pois.map(poi => <PoiCard key={poi.id} poi={poi} />)}
          </ul>
        ) : (
          <p className="stage-detail-empty">Non renseigné</p>
        )}
      </section>

      {hasAccommodation(accommodation) && (
        <section className="stage-detail-card stage-detail-accommodations card" aria-labelledby="stage-detail-primary-accommodation-title">
          <h2 id="stage-detail-primary-accommodation-title">Hébergement principal</h2>
          <AccommodationResource accommodation={accommodation} contextCity={contextCity} />
        </section>
      )}

      {(mapUrl || stageGpxUrl) && (
        <section className="stage-detail-card stage-detail-map-card card" aria-labelledby="stage-detail-map-title">
          <h2 id="stage-detail-map-title">Carte interactive</h2>
          {mapUrl ? (
            <div className="stage-detail-map">
              <iframe src={mapUrl} title={`Carte de ${title || `l'étape ${stageNumber}`}`} allowFullScreen loading="lazy" />
            </div>
          ) : (
            <div className="stage-detail-map">
              <MapViewerClient gpxUrl={stageGpxUrl} height={300} />
            </div>
          )}
          {stageGpxUrl && (
            <div className="stage-detail-map-card__actions">
              <a
                className="stage-detail-button stage-detail-button--secondary"
                href={stageGpxUrl}
                download={stageGpx?.file_name ?? `etape-${stageNumber}.gpx`}
              >
                Télécharger le GPX de l&apos;étape
              </a>
            </div>
          )}
        </section>
      )}

      {alternatives.filter(hasAccommodation).length > 0 && (
        <section className="stage-detail-card stage-detail-accommodations card" aria-labelledby="stage-detail-alternatives-title">
          <h2 id="stage-detail-alternatives-title">Hébergements alternatifs</h2>
          <div className="stage-detail-accommodation-list">
            {alternatives.filter(hasAccommodation).map((item, index) => (
              <AccommodationResource key={`${item.name}-${item.url}-${index}`} accommodation={item} contextCity={contextCity} />
            ))}
          </div>
        </section>
      )}

    </>
  );
}

function StageRoute({ departure, arrival }) {
  return (
    <p className="stage-detail-route">
      {departure && (
        <a href={googleMapsSearchUrl(departure)} target="_blank" rel="noopener noreferrer">
          {departure}
        </a>
      )}
      {departure && arrival && <span aria-hidden="true"> → </span>}
      {arrival && (
        <a href={googleMapsSearchUrl(arrival)} target="_blank" rel="noopener noreferrer">
          {arrival}
        </a>
      )}
    </p>
  );
}

function StageDetailStats({ stage }) {
  const items = [
    { label: "Distance", value: formatMetric(stage.distance_km, "km"), icon: StatIconDistance },
    { label: "D+", value: formatMetric(stage.elevation_gain_m, "m"), icon: StatIconElevationGain },
    { label: "D−", value: formatMetric(stage.elevation_loss_m, "m"), icon: StatIconElevationLoss },
    { label: "Durée", value: textValue(stage.duration) || "Non renseigné", icon: StatIconDuration },
  ];

  return (
    <div className="stage-detail-stats" aria-label="Statistiques de l'étape">
      {items.map(item => {
        const Icon = item.icon;
        return (
          <div className="stage-detail-stat" key={item.label} aria-label={`${item.label} : ${item.value}`}>
            <Icon />
            <span className="stage-detail-stat__label">{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        );
      })}
    </div>
  );
}

function NoteList({ notes, imageAlt }) {
  return (
    <ul className="stage-detail-note-list">
      {notes.map((note, index) => (
        <li className="stage-detail-note" key={`${note.text}-${index}`}>
          <p>{note.text}</p>
          {note.photo && <img src={note.photo} alt={imageAlt} loading="lazy" />}
        </li>
      ))}
    </ul>
  );
}

function PoiCard({ poi }) {
  const photoUrl = safeResourceUrl(poi.photo_url);
  const poiType = poi.poi_type || poi.type;
  const linkUrl = safeResourceUrl(poi.link_url, { relative: false }) || poiMapUrl(poi);

  return (
    <li className={`stage-detail-poi${photoUrl ? "" : " stage-detail-poi--without-image"}`}>
      {photoUrl && <img src={photoUrl} alt={`Photo de ${poi.name || "ce point d'intérêt"}`} loading="lazy" />}
      <div className="stage-detail-poi__content">
        <strong className="stage-detail-poi__name">{poiType && <span>[{poiType}] </span>}{poi.name || "Point d'intérêt"}</strong>
        {poi.region && <p className="stage-detail-poi__region">{poi.region}</p>}
        {poi.description && <p className="stage-detail-poi__description">{poi.description}</p>}
        {linkUrl && (
          <a className="stage-detail-poi__link" href={linkUrl} target="_blank" rel="noopener noreferrer">
            {poi.link_url ? "Ouvrir le lien" : "Voir sur la carte"} →
          </a>
        )}
      </div>
    </li>
  );
}

function AccommodationResource({ accommodation, contextCity, compact = false }) {
  const name = accommodation.name || "Hébergement";
  const photoUrl = safeResourceUrl(accommodation.photo);
  const websiteUrl = safeResourceUrl(accommodation.url, { relative: false });
  const mapUrl = googleMapsSearchUrl([name, contextCity].filter(Boolean).join(" "));

  return (
    <article className={`stage-detail-accommodation${compact ? " stage-detail-accommodation--compact" : ""}`}>
      {photoUrl ? (
        <img className="stage-detail-accommodation__image" src={photoUrl} alt={`Photo de ${name}`} loading="lazy" />
      ) : (
        <div className="stage-detail-accommodation__placeholder" aria-hidden="true">
          <span>{accommodationIcon(accommodation.type, name)}</span>
          <span>Hébergement</span>
        </div>
      )}
      <div className="stage-detail-accommodation__actions">
        <div className="stage-detail-accommodation__identity">
          {websiteUrl ? (
            <a className="stage-detail-button stage-detail-button--secondary" href={websiteUrl} target="_blank" rel="noopener noreferrer">
              <span aria-hidden="true">{accommodationIcon(accommodation.type, name)}</span> {name}
            </a>
          ) : (
            <span className="stage-detail-accommodation__name">
              <span aria-hidden="true">{accommodationIcon(accommodation.type, name)}</span> {name}
            </span>
          )}
          {accommodation.note && <p className="stage-detail-accommodation__note">{accommodation.note}</p>}
        </div>
        <a className="stage-detail-accommodation__map" href={mapUrl} target="_blank" rel="noopener noreferrer" aria-label={`Rechercher ${name} sur Google Maps`}>
          Carte
        </a>
      </div>
    </article>
  );
}

function normalizeNoteItems(value) {
  if (!Array.isArray(value)) return [];
  return value.map(note => {
    if (note && typeof note === "object") {
      return {
        text: textValue(note.text ?? note.note),
        photo: safeResourceUrl(note.photo),
        type: textValue(note.type).toLowerCase(),
      };
    }
    return { text: textValue(note), photo: null, type: "" };
  }).filter(note => note.text);
}

function normalizeWarnings(...sources) {
  return sources.flatMap(source => {
    if (Array.isArray(source)) return source.map(item => textValue(item?.text ?? item));
    return [textValue(source?.text ?? source)];
  }).filter(Boolean);
}

function normalizeAccommodation(value) {
  if (typeof value === "string") return { name: textValue(value), url: "", photo: "", type: "", note: "" };
  const source = value && typeof value === "object" ? value : {};
  return {
    name: textValue(source.displayName ?? source.name),
    url: textValue(source.website ?? source.url),
    photo: textValue(source.photo),
    type: textValue(source.type),
    note: textValue(source.comment ?? source.note),
  };
}

function normalizeAlternatives(value) {
  return Array.isArray(value) ? value.map(normalizeAccommodation) : [];
}

function hasAccommodation(value) {
  return Boolean(value && (value.name || value.url || value.photo));
}

function textValue(value) {
  if (value == null) return "";
  return String(value).trim();
}

function stageHeadingTitle(stage, stageNumber, fallback) {
  const title = textValue(stage.title);
  if (!title) return fallback;
  const routeStart = [stage.departure, stage.arrival]
    .map(textValue)
    .filter(Boolean)
    .map(city => title.toLocaleLowerCase("fr-FR").indexOf(city.toLocaleLowerCase("fr-FR")))
    .filter(index => index >= 0)
    .sort((a, b) => a - b)[0];
  if (routeStart == null) return title;
  const prefix = title.slice(0, routeStart).replace(/[\s→–—-]+$/u, "").trim();
  return prefix || `Étape ${stageNumber}`;
}

function safeResourceUrl(value, { relative = true } = {}) {
  const candidate = textValue(value);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? candidate : null;
  } catch {
    if (!relative || candidate.startsWith("//") || candidate.includes(":")) return null;
    return candidate;
  }
}

function googleMapsSearchUrl(query) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(textValue(query))}`;
}

function poiMapUrl(poi) {
  const latitude = Number(poi.latitude ?? poi.lat);
  const longitude = Number(poi.longitude ?? poi.lng);
  if (Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180) {
    return googleMapsSearchUrl(`${latitude},${longitude}`);
  }
  return poi.name ? googleMapsSearchUrl(poi.name) : null;
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "—";
}

function formatMetric(value, unit) {
  return value == null || value === "" ? `— ${unit}` : `${formatNumber(value)} ${unit}`;
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
