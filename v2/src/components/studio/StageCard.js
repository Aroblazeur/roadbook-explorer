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
  stagePois,
  stageVariants,
  poisByVariant,
  dragHandlers,
  draggingStageId,
  dragOverStageId,
  stagePhotoMedia,
  onStageChange,
  onUploadStagePhoto,
  onVariantChange,
  onUploadVariantPhoto,
  uploadLoading,
}) {
  const {
    handleDeleteStage, deleting,
    poiForm, setPoiForm, clearPoiForm, handlePoiSubmit, handleDeletePoi,
    variantForm, setVariantForm, clearVariantForm, handleVariantSubmit, handleDeleteVariant,
    noteForm, setNoteForm, clearNoteForm, handleNoteSubmit, handleDeleteNote,
    accommodationForm, setAccommodationForm, clearAccommodationForm,
    handleAccommodationSubmit, handleClearAccommodation,
    handleDeleteAlternative, handlePromoteAlternative, handleDemotePrimary,
  } = stageCrud;

  const {
    gpxByStage, gpxUploading,
    handleGpxDownload, handleGpxReplace, handleGpxDelete, handleGpxUpload,
  } = gpx;

  const meta = stage.metadata ?? {};
  const change = (updates) => onStageChange(stage.id, updates);
  const changeMeta = (updates) => change({ metadata: { ...meta, ...updates } });
  const stageGpx = gpxByStage[stage.id] ?? null;

  const isDragging = draggingStageId === stage.id;
  const isDragOver = dragOverStageId === stage.id && !isDragging;

  return (
    <>
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
          <button type="button" className="terrain-button--danger studio-action-button--compact" onClick={(e) => { e.stopPropagation(); handleDeleteStage(stage.id); }} disabled={deleting === stage.id}>Supprimer</button>
        </div>
      </div>

      {expanded && (
        <div className="studio-stage-card__body">
          {/* ZONE 1 — Infos étape */}
          <div className="studio-zone studio-zone--info">
            <h4 className="studio-zone__title">Infos étape</h4>
            <div className="studio-form-grid studio-form-grid--compact">
              <label>Numéro<input type="number" min="1" value={stage.stage_number ?? ""} onChange={e => change({ stage_number: e.target.value })} /></label>
              <label>Jour<input type="text" value={stage.day ?? ""} onChange={e => change({ day: e.target.value })} /></label>
              <label className="studio-form-grid__full">Titre<input type="text" value={stage.title ?? ""} onChange={e => change({ title: e.target.value })} /></label>
              <label>Départ<input type="text" value={stage.departure ?? ""} onChange={e => change({ departure: e.target.value })} /></label>
              <label>Arrivée<input type="text" value={stage.arrival ?? ""} onChange={e => change({ arrival: e.target.value })} /></label>
              <label>Distance (km)<input type="number" step="0.1" value={stage.distance_km ?? ""} onChange={e => change({ distance_km: e.target.value })} /></label>
              <label>D+ (m)<input type="number" value={stage.elevation_gain_m ?? ""} onChange={e => change({ elevation_gain_m: e.target.value })} /></label>
              <label>D− (m)<input type="number" value={stage.elevation_loss_m ?? ""} onChange={e => change({ elevation_loss_m: e.target.value })} /></label>
              <div className="studio-form-grid__full">
                <label htmlFor={`stage-photo-${stage.id}`}>Photo de l'étape (URL ou fichier)</label>
                <div className="studio-resource-field">
                  <input id={`stage-photo-${stage.id}`} type="url" value={stage.stage_photo_url ?? ""} onChange={e => change({ stage_photo_url: e.target.value })} />
                  {stagePhotoMedia && <span className="studio-resource-field__file">{stagePhotoMedia.file_name}</span>}
                  <label className="terrain-button--secondary studio-action-button--compact studio-file-button">
                    {uploadLoading ? "Import…" : "Importer"}
                    <input type="file" accept="image/*" disabled={uploadLoading} onChange={e => onUploadStagePhoto(e, stage.id)} />
                  </label>
                </div>
              </div>
              <label>Type d'hébergement<input type="text" value={stage.accommodation_type ?? ""} onChange={e => change({ accommodation_type: e.target.value })} /></label>
              <label>Hébergement<input type="text" value={stage.accommodation_name ?? ""} onChange={e => change({ accommodation_name: e.target.value })} /></label>
              <label className="studio-form-grid__full">Description<textarea value={meta.description ?? ""} onChange={e => changeMeta({ description: e.target.value })} /></label>
              <label>Libellé<input type="text" value={stage.stage_label ?? ""} onChange={e => change({ stage_label: e.target.value })} /></label>
              <label>Durée<input type="text" value={stage.duration ?? ""} onChange={e => change({ duration: e.target.value })} /></label>
              <label>Difficulté<input type="text" value={meta.difficulty ?? ""} onChange={e => changeMeta({ difficulty: e.target.value })} /></label>
              <label className="studio-form-grid__full">Avertissement<textarea value={meta.warning ?? ""} onChange={e => changeMeta({ warning: e.target.value })} /></label>
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
                <label className="studio-form-grid__full">Carte intégrée<input type="url" value={stage.map_embed_url ?? ""} onChange={e => change({ map_embed_url: e.target.value })} /></label>
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
            </div>

            <PoiForm
              stageId={stage.id}
              stagePois={stagePois}
              poiForm={poiForm}
              setPoiForm={setPoiForm}
              clearPoiForm={clearPoiForm}
              handlePoiSubmit={handlePoiSubmit}
              handleDeletePoi={handleDeletePoi}
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
            handleDeleteAlternative={handleDeleteAlternative}
            handlePromoteAlternative={handlePromoteAlternative}
            handleDemotePrimary={handleDemotePrimary}
          />

          <NoteForm
            stageId={stage.id}
            stage={stage}
            noteForm={noteForm}
            setNoteForm={setNoteForm}
            clearNoteForm={clearNoteForm}
            handleNoteSubmit={handleNoteSubmit}
            handleDeleteNote={handleDeleteNote}
          />

        </div>
      )}
    </article>
    <VariantForm
      stageId={stage.id}
      stageVariants={stageVariants}
      stageCrud={stageCrud}
      gpx={gpx}
      poisByVariant={poisByVariant}
      onVariantChange={onVariantChange}
      onUploadVariantPhoto={onUploadVariantPhoto}
      uploadLoading={uploadLoading}
    />
    </>
  );
}
