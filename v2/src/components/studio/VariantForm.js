"use client";

import { useState } from "react";
import AccommSection from "./AccommSection";
import GpxBlock from "./GpxBlock";
import NoteForm from "./NoteForm";
import PoiForm from "./PoiForm";
import { buildVariantTitle, resolveVariantTitle } from "@/lib/roadbooks/stage-order";

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
  onDuplicateAccommodation,
  onUploadAccommodationPhoto,
  onUploadPoiPhoto,
  uploadLoading,
}) {
  const [expandedVariants, setExpandedVariants] = useState(() => new Set());
  const {
    variantForm, setVariantForm, clearVariantForm, handleVariantSubmit, handleDeleteVariant,
    poiForm, setPoiForm, clearPoiForm, handlePoiSubmit, handleDeletePoi,
    noteForm, setNoteForm, clearNoteForm, handleNoteSubmit, handleDeleteNote,
  } = stageCrud;
  const {
    gpxByVariant, gpxUploading,
    handleGpxDownload, handleGpxReplace, handleGpxDelete, handleGpxUpload,
  } = gpx;

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
        const expanded = expandedVariants.has(variant.id);
        const change = updates => onVariantChange(variant.id, updates);
        const changeMeta = updates => change({ metadata: { ...meta, ...updates } });
        const variantGpx = gpxByVariant?.[stageId]?.[variant.id] ?? null;
        const displayedTitle = resolveVariantTitle(variant, stageDisplayLabel);
        const changeTitle = value => {
          const custom = value.trim() !== "";
          change({
            label: custom ? value : buildVariantTitle(variant, stageDisplayLabel),
            metadata: { ...meta, titleMode: custom ? "custom" : "auto" },
          });
        };

        return (
          <article key={variant.id} className="studio-variant-card" data-expanded={expanded ? "true" : "false"}>
            <div className="studio-variant-card__header" onClick={() => toggleVariant(variant.id)}>
              <div className="studio-stage-card__eyebrow">
                <span className="studio-badge">Sous-étape</span>
                {variant.distance_km != null && <span className="studio-badge">{variant.distance_km} km</span>}
              </div>
              <div className="studio-variant-card__header-info">
                <h3 className="studio-variant-card__title">{displayedTitle}</h3>
                <p className="studio-stage-card__summary">
                  {[variant.departure, variant.arrival].filter(Boolean).join(" → ") || meta.type || "Variante"}
                </p>
              </div>
              <div className="studio-stage-card__actions">
                <button type="button" className="terrain-button--danger studio-action-button--compact" onClick={event => { event.stopPropagation(); handleDeleteVariant(variant.id); }}>Supprimer</button>
              </div>
            </div>

            {expanded && (
              <div className="studio-variant-card__body">
                <div className="studio-zone studio-zone--info">
                  <h4 className="studio-zone__title">Infos sous-étape</h4>
                  <div className="studio-form-grid studio-form-grid--compact">
                    <label>Numéro<input type="text" value={`↳ ${variant.sort_order ?? 1}`} readOnly className="studio-input--readonly" /></label>
                    <label>Jour<input type="text" value={variant.day ?? ""} onChange={event => change({ day: event.target.value })} /></label>
                    <label className="studio-form-grid__full">Titre (avec la mention Variante)<input type="text" value={variant.label ?? ""} placeholder={buildVariantTitle(variant, stageDisplayLabel)} onChange={event => changeTitle(event.target.value)} /></label>
                    {meta.titleMode === "custom" && <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={() => changeTitle("")}>Rétablir le titre généré</button>}
                    <label>Départ<input type="text" value={variant.departure ?? ""} onChange={event => change({ departure: event.target.value })} /></label>
                    <label>Arrivée<input type="text" value={variant.arrival ?? ""} onChange={event => change({ arrival: event.target.value })} /></label>
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
                </div>

                <div className="studio-zone studio-zone--trace">
                  <h4 className="studio-zone__title">Tracé · Carte · Points d&apos;intérêt</h4>
                  <div className="studio-stage-extra">
                    <div className="studio-stage-extra__header"><h5>GPX et carte</h5></div>
                    <div className="studio-form-grid studio-form-grid--compact">
                      <label className="studio-form-grid__full">Carte (lien Google Maps ou intégration)<input type="url" value={variant.map_embed_url ?? ""} onChange={event => change({ map_embed_url: event.target.value })} /></label>
                    </div>
                  </div>
                  <div className="studio-stage-extra">
                    <h5>GPX de sous-étape</h5>
                    <GpxBlock
                      label="GPX"
                      mediaRow={variantGpx}
                      scope="variant"
                      role="official"
                      stageId={stageId}
                      variantId={variant.id}
                      gpxUploading={gpxUploading}
                      handleGpxDownload={handleGpxDownload}
                      handleGpxReplace={handleGpxReplace}
                      handleGpxDelete={handleGpxDelete}
                      handleGpxUpload={handleGpxUpload}
                    />
                  </div>
                  <PoiForm
                    stageId={stageId}
                    variantId={variant.id}
                    stagePois={poisByVariant[variant.id] ?? []}
                    poiForm={poiForm}
                    setPoiForm={setPoiForm}
                    clearPoiForm={clearPoiForm}
                    handlePoiSubmit={handlePoiSubmit}
                    handleDeletePoi={handleDeletePoi}
                    images={images}
                    onUploadPhoto={onUploadPoiPhoto}
                    uploadLoading={uploadLoading}
                  />
                </div>

                <AccommSection
                  stageId={stageId}
                  variantId={variant.id}
                  stage={variant}
                  onChange={change}
                  stages={stages}
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

      {variantForm.stage_id === stageId && (
        <form onSubmit={handleVariantSubmit} className="studio-create-form studio-create-form--substep">
          <h4>Nouvelle variante</h4>
          <div className="studio-form-grid studio-form-grid--compact">
            <label>N° variante<input type="number" min="1" value={variantForm.sort_order} onChange={event => setVariantForm(current => ({ ...current, sort_order: event.target.value }))} required /></label>
            <label>Titre personnalisé (facultatif)<input type="text" value={variantForm.title} placeholder={buildVariantTitle({ ...variantForm, sort_order: variantForm.sort_order }, stageDisplayLabel)} onChange={event => setVariantForm(current => ({ ...current, title: event.target.value }))} /></label>
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
