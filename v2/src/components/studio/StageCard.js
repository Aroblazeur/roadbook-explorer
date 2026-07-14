"use client";

import GpxBlock from "./GpxBlock";
import PoiForm from "./PoiForm";
import AccommSection from "./AccommSection";
import NoteForm from "./NoteForm";
import VariantForm from "./VariantForm";

export default function StageCard({
  stage,
  index,
  expanded,
  onToggleExpand,
  stageCrud,
  gpx,
  enrich,
  stagePois,
  stageVariants,
  dragHandlers,
  draggingStageId,
  dragOverStageId,
  stagePhotoMedia,
}) {
  const {
    handleDeleteStage, deleting,
    setShowStageForm, clearStageForm, fillStageForm,
    poiForm, setPoiForm, clearPoiForm, handlePoiSubmit, handleDeletePoi,
    variantForm, setVariantForm, clearVariantForm, handleVariantSubmit, handleDeleteVariant,
    noteForm, setNoteForm, clearNoteForm, handleNoteSubmit, handleDeleteNote,
    accommodationForm, setAccommodationForm, clearAccommodationForm,
    handleAccommodationSubmit, handleClearAccommodation,
  } = stageCrud;

  const {
    gpxByStage, gpxUploading, metricsLoading, handleComputeFromGpx,
    handleGpxDownload, handleGpxReplace, handleGpxDelete, handleGpxUpload,
  } = gpx;

  const { poiIndex, handleEnrichPoi, enrichingPoi } = enrich;

  const meta = stage.metadata ?? {};
  const stageGpx = gpxByStage[stage.id] ?? null;

  const isDragging = draggingStageId === stage.id;
  const isDragOver = dragOverStageId === stage.id && !isDragging;

  return (
    <article
      key={stage.id}
      className={`studio-stage-card ${isDragOver ? "studio-stage-card--drag-over" : ""}`}
      data-expanded={expanded ? "true" : "false"}
      draggable="true"
      style={{ opacity: isDragging ? 0.5 : 1 }}
      onDragStart={(e) => { dragHandlers?.handleDragStart(e, stage.id); }}
      onDragOver={(e) => { dragHandlers?.handleDragOver(e, stage.id); }}
      onDragEnd={dragHandlers?.handleDragEnd}
      onDrop={(e) => { dragHandlers?.handleDrop(e, stage.id); }}
    >
      {/* Stage header */}
      <div className="studio-stage-card__header" onClick={onToggleExpand}>
        <div className="studio-stage-card__eyebrow">
          <span className="studio-badge">Jour {stage.stage_number}</span>
          {stage.distance_km != null && <span className="studio-badge">{stage.distance_km} km</span>}
        </div>
        <div className="studio-stage-card__header-info">
          <h3 className="studio-stage-card__title">{stage.title || `Jour ${stage.stage_number}`}</h3>
          <p className="studio-stage-card__summary">
            {[stage.departure, stage.arrival].filter(Boolean).join(" → ") || (stage.departure || stage.arrival) || ""}
          </p>
        </div>
        <div className="studio-stage-card__actions">
          <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={(e) => { e.stopPropagation(); clearVariantForm(); setVariantForm(current => ({ ...current, stage_id: stage.id })); }}>Ajouter une variante</button>
          <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={(e) => { e.stopPropagation(); fillStageForm(stage); setShowStageForm(true); }}>Modifier l'étape</button>
          <button type="button" className="terrain-button--danger studio-action-button--compact" onClick={(e) => { e.stopPropagation(); handleDeleteStage(stage.id); }} disabled={deleting === stage.id}>Supprimer</button>
        </div>
      </div>

      {expanded && (
        <div className="studio-stage-card__body">
          {/* ZONE 1 — Infos étape */}
          <div className="studio-zone studio-zone--info">
            <h4 className="studio-zone__title">Infos étape</h4>
            <div className="studio-form-grid studio-form-grid--compact">
              <label>Départ<span className="studio-input--readonly">{stage.departure || "—"}</span></label>
              <label>Arrivée<span className="studio-input--readonly">{stage.arrival || "—"}</span></label>
              <label>Distance (km)<span className="studio-input--readonly">{stage.distance_km != null ? stage.distance_km : "—"}</span></label>
              <label>D+ (m)<span className="studio-input--readonly">{stage.elevation_gain_m != null ? stage.elevation_gain_m : "—"}</span></label>
              <label>D− (m)<span className="studio-input--readonly">{stage.elevation_loss_m != null ? stage.elevation_loss_m : "—"}</span></label>
              <label>Photo de l'étape<span className="studio-input--readonly">{stage.stage_photo_url || stagePhotoMedia ? "✓" : "—"}</span></label>
              <label>Type d'hébergement<span className="studio-input--readonly">{stage.accommodation_type || stage.accommodation_name || "—"}</span></label>
              <label className="studio-form-grid__full">Description<span className="studio-input--readonly">{meta.description || "—"}</span></label>
              <label>Libellé<span className="studio-input--readonly">{stage.stage_label || "—"}</span></label>
              <label>Durée<span className="studio-input--readonly">{stage.duration || "—"}</span></label>
              <label>Difficulté<span className="studio-input--readonly">{meta.difficulty || "—"}</span></label>
              <label className="studio-form-grid__full">Avertissement<span className="studio-input--readonly">{meta.warning || "—"}</span></label>
            </div>
          </div>

          {/* ZONE 2 — Tracé · Carte · Points d'intérêt */}
          <div className="studio-zone studio-zone--trace">
            <h4 className="studio-zone__title">Tracé · Carte · Points d'intérêt</h4>

            <div className="studio-stage-extra">
              <div className="studio-stage-extra__header">
                <h5>GPX et carte</h5>
              </div>
              <div className="studio-form-grid studio-form-grid--compact">
                <label className="studio-form-grid__full">Carte intégrée<span className="studio-input--readonly">{stage.map_embed_url || "—"}</span></label>
              </div>
            </div>

            <div className="studio-stage-extra">
              <h5>GPX d'étape</h5>
              <GpxBlock
                label="GPX" mediaRow={stageGpx}
                scope="stage" role="official" stageId={stage.id}
                gpxUploading={gpxUploading}
                handleGpxDownload={handleGpxDownload}
                handleGpxReplace={handleGpxReplace}
                handleGpxDelete={handleGpxDelete}
                handleGpxUpload={handleGpxUpload}
              />
              {stageGpx && (
                <div className="studio-gpx-actions">
                  <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={() => handleComputeFromGpx(stageGpx, stage)} disabled={metricsLoading === stage.id}>
                    {metricsLoading === stage.id ? "Calcul..." : "Lire"}
                  </button>
                </div>
              )}
            </div>

            <PoiForm
              stageId={stage.id}
              stagePois={stagePois}
              poiForm={poiForm}
              setPoiForm={setPoiForm}
              clearPoiForm={clearPoiForm}
              handlePoiSubmit={handlePoiSubmit}
              handleDeletePoi={handleDeletePoi}
              poiIndex={poiIndex}
              handleEnrichPoi={handleEnrichPoi}
              enrichingPoi={enrichingPoi}
            />
          </div>

          <AccommSection
            stageId={stage.id}
            stage={stage}
            accommodationForm={accommodationForm}
            setAccommodationForm={setAccommodationForm}
            clearAccommodationForm={clearAccommodationForm}
            handleAccommodationSubmit={handleAccommodationSubmit}
            handleClearAccommodation={handleClearAccommodation}
          />

          {/* ZONE 4 — Hébergements alternatifs */}
          <div className="studio-zone studio-zone--alternatives">
            <h4 className="studio-zone__title">Hébergements alternatifs</h4>
            <p className="studio-detail--empty">Aucun hébergement alternatif.</p>
          </div>

          <NoteForm
            stageId={stage.id}
            stage={stage}
            noteForm={noteForm}
            setNoteForm={setNoteForm}
            clearNoteForm={clearNoteForm}
            handleNoteSubmit={handleNoteSubmit}
            handleDeleteNote={handleDeleteNote}
          />

          <VariantForm
            stageId={stage.id}
            stageVariants={stageVariants}
            variantForm={variantForm}
            setVariantForm={setVariantForm}
            clearVariantForm={clearVariantForm}
            handleVariantSubmit={handleVariantSubmit}
            handleDeleteVariant={handleDeleteVariant}
          />
        </div>
      )}
    </article>
  );
}
