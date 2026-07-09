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
    <main className="container">
      <header className="card">
        {coverSignedUrl && <img src={coverSignedUrl} alt="" className="stage-photo__image" style={{ maxHeight: 300, marginBottom: "0.5rem" }} />}
        <h1>{roadbook.title}</h1>
        {roadbook.description && <p>{roadbook.description}</p>}
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
          <span className="stat"><span className="stat__value"><strong>{totals.distance ?? "—"}</strong> km Distance cumulée</span></span>
          <span className="stat"><span className="stat__value"><strong>{totals.elevationGain ?? "—"}</strong> m D+ cumulé</span></span>
          <span className="stat"><span className="stat__value"><strong>{totals.elevationLoss ?? "—"}</strong> m D− cumulé</span></span>
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
        <span style={{ color: "#666" }}>↳ </span>
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
      <div className="stats" style={{ gap: "0.3rem", margin: "0.25rem 0 0" }}>
        {v.distance_km != null && <span className="variant-pill"><strong>{v.distance_km}</strong> km</span>}
        {vGain != null && <span className="variant-pill"><strong>{vGain}</strong> m D+</span>}
        {vLoss != null && <span className="variant-pill"><strong>{vLoss}</strong> m D−</span>}
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
    <div className="stats" style={{ margin: "0.5rem 0" }}>
      {items.map((item, i) => (
        <span key={i} className="stat"><span className="stat__value"><strong>{item.value}</strong>{item.unit ? ` ${item.unit}` : ""} {item.label}</span></span>
      ))}
    </div>
  );
}

function StageCard({ stage, pois, variants, stageGpx, showMap = false }) {
  const meta = stage.metadata ?? {};
  return (
    <div className="card" style={{ margin: "14px 0" }}>
      <div className="home-stage-card__content" style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
        <span className="stage-number-circle" style={{ minWidth: 42, width: 42, height: 42, fontSize: "1.1rem" }}>
          {stage.stage_number}
        </span>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0 }}>
            {stage.stage_label || (stage.day ? `${stage.day}` : "")}
            {stage.title && <span className="text-muted" style={{ fontWeight: "normal" }}> — {stage.title}</span>}
          </h3>
          {(stage.departure || stage.arrival) && (
            <p className="stage-route-links" style={{ margin: "0.25rem 0", fontSize: "0.9rem" }}>
              {stage.departure && <span className="stage-city-link">Départ : {stage.departure}</span>}
              {stage.departure && stage.arrival && <> → </>}
              {stage.arrival && <span className="stage-city-link">Arrivée : {stage.arrival}</span>}
            </p>
          )}
        </div>
      </div>

      <Pills distanceKm={stage.distance_km} elevationGain={stage.elevation_gain_m} elevationLoss={stage.elevation_loss_m} duration={stage.duration} />

      {stage.stage_photo_url && (
        <figure className="stage-photo">
          <img src={stage.stage_photo_url} alt="" className="stage-photo__image" />
        </figure>
      )}

      {meta.description && <p className="stage-description">{meta.description}</p>}
      {meta.warning && <p style={{ color: "#e65100", margin: "0.5rem 0" }}>⚠ {meta.warning}</p>}

      {/* Accommodation */}
      {stage.accommodation_name && (
        <div className="accommodation-resource">
          {stage.accommodation_photo && <img src={stage.accommodation_photo} alt={stage.accommodation_name} className="accommodation-resource__image" />}
          <p><strong>{stage.accommodation_name}</strong></p>
          {stage.accommodation_url && (
            <a href={stage.accommodation_url} target="_blank" rel="noopener noreferrer" className="terrain-button terrain-button--secondary" style={{ textDecoration: "none" }}>
              🔗 Site web de l&apos;hébergement
            </a>
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
          <summary>Notes ({stage.notes.length})</summary>
          <ul id="notes" style={{ marginTop: "0.5rem" }}>
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
          <summary>Points d&apos;intérêt ({pois.length})</summary>
          <ul className="poi-list poi-list--enriched" style={{ marginTop: "0.5rem" }}>
            {pois.map(poi => (
              <li key={poi.id} className="poi-card">
                {poi.photo_url && <img src={poi.photo_url} alt="" className="poi-card__image" />}
                <div>
                  <strong className="poi-card__name">{poi.poi_type && <span style={{ color: "#2e7d32" }}>[{poi.poi_type}] </span>}{poi.name}</strong>
                  {poi.region && <p className="poi-card__region">{poi.region}</p>}
                  {poi.description && <p className="poi-card__description">{poi.description}</p>}
                  {poi.link_url && <a href={poi.link_url} target="_blank" rel="noopener" className="terrain-button terrain-button--discreet poi-card__map-link" style={{ display: "inline-flex" }}>Ouvrir le lien →</a>}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Variants */}
      {variants.length > 0 && (
        <div style={{ marginTop: "0.5rem" }}>
          <p className="text-muted" style={{ fontWeight: "bold", fontSize: "0.9rem", marginBottom: "0.3rem" }}>Variantes ({variants.length})</p>
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
    </div>
  );
}

function GlobalSummary({ distance, elevationGain, elevationLoss, stageCount }) {
  const hasTotal = stageCount > 0 && (distance > 0 || elevationGain > 0 || elevationLoss > 0);
  if (!hasTotal) return null;

  return (
    <div className="card">
      <h2>Résumé du parcours</h2>
      <div className="stats" style={{ marginBottom: "0.5rem" }}>
        <span className="stat"><span className="stat__value"><strong>{distance ?? "—"}</strong> km Distance totale</span></span>
        <span className="stat"><span className="stat__value"><strong>{elevationGain ?? "—"}</strong> m Dénivelé +</span></span>
        <span className="stat"><span className="stat__value"><strong>{elevationLoss ?? "—"}</strong> m Dénivelé −</span></span>
        <span className="stat"><span className="stat__value"><strong>{stageCount}</strong> Étapes</span></span>
      </div>
    </div>
  );
}
