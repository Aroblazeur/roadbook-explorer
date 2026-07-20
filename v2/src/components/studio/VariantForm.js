"use client";

import { useState } from "react";
import AccommSection from "./AccommSection";
import GpxBlock from "./GpxBlock";
import NoteForm from "./NoteForm";
import PoiForm from "./PoiForm";
import { buildVariantTitle, resolveVariantTitle } from "@/lib/roadbooks/stage-order";
import useRevealForm from "@/hooks/studio/useRevealForm";
import RouteMapFields, { normalizeRouteMaps } from "./RouteMapFields";
import StudioCollapsibleZone from "./StudioCollapsibleZone";

export default function VariantForm({
  stageId,
  stageDisplayLabel,
  stageVariants,
  stageCrud,
  gpx,
  poisByVariant,
  onVariantChange,
  onUploadVariantPhoto,
  images,
  stages,
  variantsByStage,
  onDuplicateAccommodation,
  onUploadAccommodationPhoto,
  onUploadPoiPhoto,
  uploadLoading,
  dragHandlers,
  onToggleDraft,
  onConvertToStage,
  onMoveToStage,
}) {
  const [expandedVariants, setExpandedVariants] = useState(() => new Set());
  const {
    variantForm, setVariantForm, clearVariantForm, handleVariantSubmit, handleDeleteVariant,
    poiForm, setPoiForm, clearPoiForm, handlePoiSubmit, handleDeletePoi,
    noteForm, setNoteForm, clearNoteForm, handleNoteSubmit, handleDeleteNote,
  } = stageCrud;
  const {
    gpxByVariant, gpxRoutesByVariant, gpxUploading, metricsLoading, locationsLoading, googleMetricsLoading,
    handleGpxReplace, handleGpxDelete, handleGpxUpload,
    handleGpxRecalculate, handleGpxExtractLocations, handleGoogleMapsRecalculate,
  } = gpx;
  const isCreatingHere = variantForm.stage_id === stageId;
  const createFormRef = useRevealForm(isCreatingHere ? `${stageId}:${variantForm.editing ?? "new"}` : null);

  const toggleVariant = (variantId) => {
    setExpandedVariants(previous => {
      const next = new Set(previous);
      if (next.has(variantId)) next.delete(variantId);
      else next.add(variantId);
      return next;
    });
  };

  return (
    <>
      {stageVariants.map(variant => {
        const meta = variant.metadata ?? {};
        const isDraft = meta.status === "draft" || meta.isDraft === true;
        const expanded = expandedVariants.has(variant.id);
        const change = updates => onVariantChange(variant.id, updates);
        const changeMeta = updates => change({ metadata: { ...meta, ...updates } });
        const routeMaps = normalizeRouteMaps(meta.route_maps, variant.map_embed_url);
        const changeRouteMaps = maps => change({ map_embed_url: maps[0]?.url || null, metadata: { ...meta, route_maps: maps } });
        const variantGpx = gpxByVariant?.[stageId]?.[variant.id] ?? null;
        const variantGpxRoutes = gpxRoutesByVariant?.[variant.id] ?? (variantGpx ? [variantGpx] : []);
        const isExtractingLocations = locationsLoading === `variant:${variant.id}`;
        const isCalculatingGoogleMetrics = googleMetricsLoading === `variant:${variant.id}`;
        const displayedTitle = resolveVariantTitle(variant, stageDisplayLabel);
        const variantPois = poisByVariant[variant.id] ?? [];
        const infoSummary = [variant.day, [variant.departure, variant.arrival].filter(Boolean).join(" → "), variant.distance_km != null ? `${variant.distance_km} km` : "", variant.elevation_gain_m != null ? `${variant.elevation_gain_m} m D+` : "", meta.type].filter(Boolean).join(" · ");
        const poiSummary = variantPois.length ? `POI : ${variantPois.slice(0, 2).map(poi => poi.name).filter(Boolean).join(", ") || variantPois.length}${variantPois.length > 2 ? ` +${variantPois.length - 2}` : ""}` : "";
        const traceSummary = [routeMaps.length ? `${routeMaps.length} carte${routeMaps.length > 1 ? "s" : ""}` : "", variantGpxRoutes.length ? `${variantGpxRoutes.length} GPX` : "", poiSummary].filter(Boolean).join(" · ");
        const variantIndex = stageVariants.findIndex(item => item.id === variant.id);
        const isDragging = dragHandlers?.draggingVariantId === variant.id;
        const isDragOver = dragHandlers?.dragOverVariantId === variant.id && !isDragging;
        const changeTitle = value => {
          const custom = value.trim() !== "";
          change({
            label: custom ? value : buildVariantTitle(variant, stageDisplayLabel),
            metadata: { ...meta, titleMode: custom ? "custom" : "auto" },
          });
        };

        return (
          <article
            key={variant.id}
            className={`studio-variant-card ${isDragOver ? "studio-stage-card--drag-over" : ""}`}
            data-expanded={expanded ? "true" : "false"}
            style={{ opacity: isDragging ? 0.5 : 1 }}
            onDragOver={event => dragHandlers?.handleDragOver(event, variant.id)}
            onDrop={event => dragHandlers?.handleDrop(event, stageId, variant.id)}
          >
            <div
              className="studio-variant-card__header"
              onClick={() => toggleVariant(variant.id)}
            >
              <div className="studio-stage-card__eyebrow">
                <span className="studio-badge">Sous-étape</span>
                {isDraft && <span className="studio-badge">Brouillon</span>}
                {variant.distance_km != null && <span className="studio-badge">{variant.distance_km} km</span>}
              </div>
              <div className="studio-variant-card__header-info">
                <h3 className="studio-variant-card__title">{displayedTitle}</h3>
                <p className="studio-stage-card__summary">
                  {[variant.departure, variant.arrival].filter(Boolean).join(" → ") || meta.type || "Variante"}
                </p>
              </div>
              <div className="studio-stage-card__actions">
                <span role="button" tabIndex={0} draggable={true} className="terrain-button--secondary studio-action-button--compact studio-stage-card__drag-handle" onClick={event => event.stopPropagation()} onDragStart={event => dragHandlers?.handleDragStart(event, stageId, variant.id)} onDragEnd={dragHandlers?.handleDragEnd}>☰ Glisser</span>
                <button type="button" className="terrain-button--secondary studio-action-button--compact" disabled={variantIndex <= 0} onClick={event => { event.stopPropagation(); dragHandlers?.moveByOffset(stageId, variant.id, -1); }}>↑</button>
                <button type="button" className="terrain-button--secondary studio-action-button--compact" disabled={variantIndex >= stageVariants.length - 1} onClick={event => { event.stopPropagation(); dragHandlers?.moveByOffset(stageId, variant.id, 1); }}>↓</button>
                <select className="studio-action-select" defaultValue="" aria-label="Déplacer la variante vers une autre étape" onClick={event => event.stopPropagation()} onChange={event => { onMoveToStage?.(variant, event.target.value); event.target.value = ""; }}>
                  <option value="">Déplacer vers…</option>
                  {stages.filter(stage => String(stage.id) !== String(stageId)).map((stage, index) => <option key={stage.id} value={stage.id}>Étape {stage.stage_number ?? index + 1}</option>)}
                </select>
                <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={event => { event.stopPropagation(); onToggleDraft?.(variant); }}>{isDraft ? "Publier" : "Brouillon"}</button>
                <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={event => { event.stopPropagation(); onConvertToStage?.(variant); }}>Convertir en étape</button>
                <button type="button" className="terrain-button--danger studio-action-button--compact" onClick={event => { event.stopPropagation(); handleDeleteVariant(variant.id); }}>Supprimer</button>
              </div>
            </div>

            {expanded && (
              <div className="studio-variant-card__body">
                <StudioCollapsibleZone tone="info" title="Infos sous-étape" summary={infoSummary}>
                  <div className="studio-form-grid studio-form-grid--compact">
                    <label>Numéro<input type="text" value={`↳ ${variant.sort_order ?? 1}`} readOnly className="studio-input--readonly" /></label>
                    <label>Jour<input type="text" value={variant.day ?? ""} onChange={event => change({ day: event.target.value })} /></label>
                    <label className="studio-form-grid__full">Titre (avec la mention Variante)<input type="text" value={variant.label ?? ""} placeholder={buildVariantTitle(variant, stageDisplayLabel)} onChange={event => changeTitle(event.target.value)} /></label>
                    {meta.titleMode === "custom" && <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={() => changeTitle("")}>Rétablir le titre généré</button>}
                    <div className="studio-city-fields studio-form-grid__full">
                      <label>Départ<input type="text" value={variant.departure ?? ""} onChange={event => change({ departure: event.target.value })} /></label>
                      <label>Arrivée<input type="text" value={variant.arrival ?? ""} onChange={event => change({ arrival: event.target.value })} /></label>
                      {variantGpx && <button type="button" className="terrain-button--secondary studio-action-button--compact studio-location-extract" title="Extraire le départ et l’arrivée depuis les extrémités du GPX" aria-label="Extraire les villes depuis le GPX" onClick={() => handleGpxExtractLocations(variantGpx, variant, "variant")} disabled={locationsLoading != null}>{isExtractingLocations ? "…" : "⌖ GPX"}</button>}
                    </div>
                    <label>Distance (km)<input type="number" step="0.1" value={variant.distance_km ?? ""} onChange={event => change({ distance_km: event.target.value })} /></label>
                    <label>D+ (m)<input type="number" value={variant.elevation_gain_m ?? ""} onChange={event => change({ elevation_gain_m: event.target.value })} /></label>
                    <label>D− (m)<input type="number" value={variant.elevation_loss_m ?? ""} onChange={event => change({ elevation_loss_m: event.target.value })} /></label>
                    <div className="studio-form-grid__full">
                      <label htmlFor={`variant-photo-${variant.id}`}>Photo de la sous-étape (URL ou fichier)</label>
                      <div className="studio-resource-field">
                        <input id={`variant-photo-${variant.id}`} type="url" value={variant.stage_photo_url ?? ""} onChange={event => change({ stage_photo_url: event.target.value })} />
                        <label className="terrain-button--secondary studio-action-button--compact studio-file-button">
                          {uploadLoading ? "Import…" : "Importer"}
                          <input type="file" accept="image/*" disabled={uploadLoading} onChange={event => onUploadVariantPhoto(event, stageId, variant.id)} />
                        </label>
                      </div>
                    </div>
                    <label className="studio-form-grid__full">Description<textarea value={variant.description ?? ""} onChange={event => change({ description: event.target.value })} /></label>
                    <label>Durée (automatique si vide)<input type="text" value={variant.duration ?? ""} onChange={event => change({ duration: event.target.value })} /></label>
                    <label>Type de variante<input type="text" value={meta.type ?? ""} onChange={event => changeMeta({ type: event.target.value })} /></label>
                  </div>
                </StudioCollapsibleZone>

                <StudioCollapsibleZone tone="trace" title="Tracé · Carte · Points d'intérêt" summary={traceSummary}>
                  <div className="studio-stage-extra">
                    <div className="studio-stage-extra__header"><h5>GPX et carte</h5></div>
                    <RouteMapFields maps={routeMaps} onChange={changeRouteMaps} idPrefix={`variant-map-${variant.id}`} onRecalculate={() => handleGoogleMapsRecalculate({ ...variant, map_embed_url: routeMaps[0]?.url }, "variant")} recalculating={googleMetricsLoading != null || isCalculatingGoogleMetrics} />
                  </div>
                  <div className="studio-stage-extra">
                    <h5>GPX de sous-étape</h5>
                    <GpxBlock
                      label="GPX"
                      mediaRows={variantGpxRoutes}
                      scope="variant"
                      role="official"
                      stageId={stageId}
                      variantId={variant.id}
                      target={variant}
                      gpxUploading={gpxUploading}
                      metricsLoading={metricsLoading}
                      handleGpxReplace={handleGpxReplace}
                      handleGpxDelete={handleGpxDelete}
                      handleGpxUpload={handleGpxUpload}
                      handleGpxRecalculate={handleGpxRecalculate}
                    />
                  </div>
                  <PoiForm
                    stageId={stageId}
                    variantId={variant.id}
                    stagePois={variantPois}
                    poiForm={poiForm}
                    setPoiForm={setPoiForm}
                    clearPoiForm={clearPoiForm}
                    handlePoiSubmit={handlePoiSubmit}
                    handleDeletePoi={handleDeletePoi}
                    images={images}
                    onUploadPhoto={onUploadPoiPhoto}
                    uploadLoading={uploadLoading}
                  />
                </StudioCollapsibleZone>

                <AccommSection
                  stageId={stageId}
                  variantId={variant.id}
                  stage={variant}
                  onChange={change}
                  stages={stages}
                  variantsByStage={variantsByStage}
                  onDuplicate={onDuplicateAccommodation}
                  images={images}
                  onUploadPhoto={onUploadAccommodationPhoto}
                  uploadLoading={uploadLoading}
                />

                <NoteForm
                  stageId={stageId}
                  variantId={variant.id}
                  stage={variant}
                  noteForm={noteForm}
                  setNoteForm={setNoteForm}
                  clearNoteForm={clearNoteForm}
                  handleNoteSubmit={handleNoteSubmit}
                  handleDeleteNote={handleDeleteNote}
                />
              </div>
            )}
          </article>
        );
      })}

      {isCreatingHere && (
        <form ref={createFormRef} onSubmit={handleVariantSubmit} className="studio-create-form studio-create-form--substep">
          <h4>Nouvelle variante</h4>
          <div className="studio-form-grid studio-form-grid--compact">
            <label>N° variante<input type="number" min="1" value={variantForm.sort_order} onChange={event => setVariantForm(current => ({ ...current, sort_order: event.target.value }))} required /></label>
            <label>Titre personnalisé (facultatif)<input data-form-initial-focus type="text" value={variantForm.title} placeholder={buildVariantTitle({ ...variantForm, sort_order: variantForm.sort_order }, stageDisplayLabel)} onChange={event => setVariantForm(current => ({ ...current, title: event.target.value }))} /></label>
            <label>Départ<input type="text" value={variantForm.departure} onChange={event => setVariantForm(current => ({ ...current, departure: event.target.value }))} /></label>
            <label>Arrivée<input type="text" value={variantForm.arrival} onChange={event => setVariantForm(current => ({ ...current, arrival: event.target.value }))} /></label>
            <label>Distance (km)<input type="number" step="0.01" value={variantForm.distance_km} onChange={event => setVariantForm(current => ({ ...current, distance_km: event.target.value }))} /></label>
            <label>D+ (m)<input type="number" value={variantForm.elevation_gain_m} onChange={event => setVariantForm(current => ({ ...current, elevation_gain_m: event.target.value }))} /></label>
            <label>D- (m)<input type="number" value={variantForm.elevation_loss_m} onChange={event => setVariantForm(current => ({ ...current, elevation_loss_m: event.target.value }))} /></label>
            <label>Description<textarea value={variantForm.description} onChange={event => setVariantForm(current => ({ ...current, description: event.target.value }))} /></label>
            <label>Notes (une par ligne)<textarea value={variantForm.notes} onChange={event => setVariantForm(current => ({ ...current, notes: event.target.value }))} /></label>
            <label>Jour<textarea value={variantForm.day} onChange={event => setVariantForm(current => ({ ...current, day: event.target.value }))} /></label>
            <label>Durée (automatique si vide)<input type="text" value={variantForm.duration} onChange={event => setVariantForm(current => ({ ...current, duration: event.target.value }))} /></label>
            <div>
              <label htmlFor={`variant-create-photo-${stageId}`}>Photo (URL ou fichier)</label>
              <div className="studio-resource-field">
                <input id={`variant-create-photo-${stageId}`} type="url" value={variantForm.stage_photo_url} onChange={event => setVariantForm(current => ({ ...current, stage_photo_url: event.target.value }))} />
              </div>
              <small className="text-muted">L'import de fichier sera disponible après la création de la variante.</small>
            </div>
            <label>Type de variante<input type="text" value={variantForm.type} onChange={event => setVariantForm(current => ({ ...current, type: event.target.value }))} /></label>
            <label className="studio-form-grid__full">Carte (lien Google Maps ou intégration)<input type="url" value={variantForm.map_embed_url} onChange={event => setVariantForm(current => ({ ...current, map_embed_url: event.target.value }))} /></label>
          </div>
          <div className="studio-create-form__actions">
            <button type="submit" className="terrain-button">Créer la variante</button>
            <button type="button" className="terrain-button terrain-button--secondary" onClick={clearVariantForm}>Annuler</button>
          </div>
        </form>
      )}
    </>
  );
}
