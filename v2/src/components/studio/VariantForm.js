"use client";

import { useState } from "react";
import AccommSection from "./AccommSection";
import GpxBlock from "./GpxBlock";
import NoteForm from "./NoteForm";
import PoiForm from "./PoiForm";

export default function VariantForm({
  stageId,
  stageVariants,
  stageCrud,
  gpx,
  poisByVariant,
  onVariantChange,
  onUploadVariantPhoto,
  uploadLoading,
}) {
  const [expandedVariants, setExpandedVariants] = useState(() => new Set());
  const {
    variantForm, setVariantForm, clearVariantForm, handleVariantSubmit, handleDeleteVariant,
    poiForm, setPoiForm, clearPoiForm, handlePoiSubmit, handleDeletePoi,
    noteForm, setNoteForm, clearNoteForm, handleNoteSubmit, handleDeleteNote,
    accommodationForm, setAccommodationForm, clearAccommodationForm,
    handleAccommodationSubmit, handleClearAccommodation,
    handleDeleteAlternative, handlePromoteAlternative, handleDemotePrimary,
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

        return (
          <article key={variant.id} className="studio-variant-card" data-expanded={expanded ? "true" : "false"}>
            <div className="studio-variant-card__header" onClick={() => toggleVariant(variant.id)}>
              <div className="studio-stage-card__eyebrow">
                <span className="studio-badge">Sous-étape</span>
                {variant.distance_km != null && <span className="studio-badge">{variant.distance_km} km</span>}
              </div>
              <div className="studio-variant-card__header-info">
                <h3 className="studio-variant-card__title">{variant.label || "Variante"}</h3>
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
                    <label className="studio-form-grid__full">Titre<input type="text" value={variant.label ?? ""} onChange={event => change({ label: event.target.value })} /></label>
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
                    <label>Type d&apos;hébergement<input type="text" value={variant.accommodation_type ?? ""} onChange={event => change({ accommodation_type: event.target.value })} /></label>
                    <label>Hébergement<input type="text" value={variant.accommodation_name ?? ""} onChange={event => change({ accommodation_name: event.target.value })} /></label>
                    <label className="studio-form-grid__full">Description<textarea value={variant.description ?? ""} onChange={event => change({ description: event.target.value })} /></label>
                    <label>Libellé<input type="text" value={variant.stage_label ?? ""} onChange={event => change({ stage_label: event.target.value })} /></label>
                    <label>Durée<input type="text" value={variant.duration ?? ""} onChange={event => change({ duration: event.target.value })} /></label>
                    <label>Type de variante<input type="text" value={meta.type ?? ""} onChange={event => changeMeta({ type: event.target.value })} /></label>
                    <label>Difficulté<input type="text" value={meta.difficulty ?? ""} onChange={event => changeMeta({ difficulty: event.target.value })} /></label>
                    <label className="studio-form-grid__full">Avertissement<textarea value={meta.warning ?? ""} onChange={event => changeMeta({ warning: event.target.value })} /></label>
                  </div>
                </div>

                <div className="studio-zone studio-zone--trace">
                  <h4 className="studio-zone__title">Tracé · Carte · Points d&apos;intérêt</h4>
                  <div className="studio-stage-extra">
                    <div className="studio-stage-extra__header"><h5>GPX et carte</h5></div>
                    <div className="studio-form-grid studio-form-grid--compact">
                      <label className="studio-form-grid__full">Carte intégrée<input type="url" value={variant.map_embed_url ?? ""} onChange={event => change({ map_embed_url: event.target.value })} /></label>
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
                  />
                </div>

                <AccommSection
                  stageId={stageId}
                  variantId={variant.id}
                  stage={variant}
                  accommodationForm={accommodationForm}
                  setAccommodationForm={setAccommodationForm}
                  clearAccommodationForm={clearAccommodationForm}
                  handleAccommodationSubmit={handleAccommodationSubmit}
                  handleClearAccommodation={handleClearAccommodation}
                  handleDeleteAlternative={handleDeleteAlternative}
                  handlePromoteAlternative={handlePromoteAlternative}
                  handleDemotePrimary={handleDemotePrimary}
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
            <label>Titre<input type="text" value={variantForm.title} onChange={event => setVariantForm({ ...variantForm, title: event.target.value })} required /></label>
            <label>Type<input type="text" value={variantForm.type} onChange={event => setVariantForm({ ...variantForm, type: event.target.value })} /></label>
            <label>Départ<input type="text" value={variantForm.departure} onChange={event => setVariantForm({ ...variantForm, departure: event.target.value })} /></label>
            <label>Arrivée<input type="text" value={variantForm.arrival} onChange={event => setVariantForm({ ...variantForm, arrival: event.target.value })} /></label>
          </div>
          <div className="studio-create-form__actions">
            <button type="submit" className="terrain-button">Ajouter</button>
            <button type="button" className="terrain-button terrain-button--secondary" onClick={clearVariantForm}>Annuler</button>
          </div>
        </form>
      )}
    </>
  );
}
