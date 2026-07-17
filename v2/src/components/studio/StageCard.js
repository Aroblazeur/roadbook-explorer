"use client";

import GpxBlock from "./GpxBlock";
import PoiForm from "./PoiForm";
import AccommSection from "./AccommSection";
import NoteForm from "./NoteForm";
import VariantForm from "./VariantForm";
import { buildStageTitle, resolveStageTitle } from "@/lib/roadbooks/stage-order";

export default function StageCard({
  stage,
  index,
  displayLabel,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onStageNumberChange,
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
  images,
  stages,
  variantsByStage,
  onDuplicateAccommodation,
  onStageChange,
  onUploadStagePhoto,
  onUploadAccommodationPhoto,
  onUploadPoiPhoto,
  onVariantChange,
  onUploadVariantPhoto,
  uploadLoading,
}) {
  const {
    handleDeleteStage, deleting,
    poiForm, setPoiForm, clearPoiForm, handlePoiSubmit, handleDeletePoi,
    variantForm, setVariantForm, clearVariantForm, handleVariantSubmit, handleDeleteVariant,
    noteForm, setNoteForm, clearNoteForm, handleNoteSubmit, handleDeleteNote,
  } = stageCrud;

  const {
    gpxByStage, gpxUploading,
    handleGpxDownload, handleGpxReplace, handleGpxDelete, handleGpxUpload,
  } = gpx;

  const meta = stage.metadata ?? {};
  const change = (updates) => onStageChange(stage.id, updates);
  const changeMeta = (updates) => change({ metadata: { ...meta, ...updates } });
  const stageGpx = gpxByStage[stage.id] ?? null;
  const generatedTitle = buildStageTitle(stage, displayLabel);
  const displayedTitle = resolveStageTitle(stage, displayLabel);
  const changeTitle = (value) => {
    const custom = value.trim() !== "";
    change({
      title: custom ? value : generatedTitle,
      metadata: { ...meta, titleMode: custom ? "custom" : "auto" },
    });
  };

  const isDragging = draggingStageId === stage.id;
  const isDragOver = dragOverStageId === stage.id && !isDragging;

  return (
    <>
    <article
      key={stage.id}
      className={`studio-stage-card ${isDragOver ? "studio-stage-card--drag-over" : ""}`}
      data-expanded={expanded ? "true" : "false"}
      style={{ opacity: isDragging ? 0.5 : 1 }}
      onDragOver={(e) => { dragHandlers?.handleDragOver(e, stage.id); }}
      onDrop={(e) => { dragHandlers?.handleDrop(e, stage.id); }}
    >
      {/* Stage header */}
      <div className="studio-stage-card__header" onClick={onToggleExpand}>
        <div className="studio-stage-card__eyebrow">
          <span className="studio-badge">Étape {displayLabel}</span>
          {stage.distance_km != null && <span className="studio-badge">{stage.distance_km} km</span>}
        </div>
        <div className="studio-stage-card__header-info">
          <h3 className="studio-stage-card__title">{displayedTitle}</h3>
          <p className="studio-stage-card__summary">
            {[stage.departure, stage.arrival].filter(Boolean).join(" → ") || (stage.departure || stage.arrival) || ""}
          </p>
        </div>
        <div className="studio-stage-card__actions">
          <button
            type="button"
            className="terrain-button--secondary studio-action-button--compact studio-stage-card__drag-handle"
            draggable="true"
            aria-label={`Glisser l'étape ${displayLabel}`}
            title="Maintenir puis glisser au-dessus ou en dessous d'une autre étape"
            onClick={(e) => e.stopPropagation()}
            onDragStart={(e) => dragHandlers?.handleDragStart(e, stage.id)}
            onDragEnd={dragHandlers?.handleDragEnd}
          >☰ Glisser</button>
          <button type="button" className="terrain-button--secondary studio-action-button--compact" disabled={!canMoveUp} aria-label={`Monter l'étape ${displayLabel}`} title="Monter d'une position" onClick={(event) => { event.stopPropagation(); onMoveUp?.(); }}>↑ Monter</button>
          <button type="button" className="terrain-button--secondary studio-action-button--compact" disabled={!canMoveDown} aria-label={`Descendre l'étape ${displayLabel}`} title="Descendre d'une position" onClick={(event) => { event.stopPropagation(); onMoveDown?.(); }}>↓ Descendre</button>
          <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={(e) => {
            e.stopPropagation();
            clearVariantForm();
            const nextSortOrder = Math.max(0, ...stageVariants.map(variant => Number(variant.sort_order) || 0)) + 1;
            setVariantForm(current => ({ ...current, stage_id: stage.id, parent_stage_label: displayLabel, sort_order: String(nextSortOrder) }));
          }}>Ajouter une variante</button>
          <button type="button" className="terrain-button--danger studio-action-button--compact" onClick={(e) => { e.stopPropagation(); handleDeleteStage(stage.id); }} disabled={deleting === stage.id}>Supprimer</button>
        </div>
      </div>

      {expanded && (
        <div className="studio-stage-card__body">
          {/* ZONE 1 — Infos étape */}
          <div className="studio-zone studio-zone--info">
            <h4 className="studio-zone__title">Infos étape</h4>
            <div className="studio-form-grid studio-form-grid--compact">
              <label>Numéro<input type="number" min="1" step="1" value={stage.stage_number ?? ""} onChange={e => onStageNumberChange?.(e.target.value)} onBlur={e => onStageNumberChange?.(e.target.value)} /></label>
              <label>Jour<input type="text" value={stage.day ?? ""} onChange={e => change({ day: e.target.value })} /></label>
              <label className="studio-form-grid__full">Titre (généré, mais personnalisable)<input type="text" value={displayedTitle} onChange={e => changeTitle(e.target.value)} /></label>
              {meta.titleMode === "custom" && <button type="button" className="terrain-button--secondary studio-action-button--compact" onClick={() => changeTitle("")}>Rétablir le titre généré</button>}
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
              <label className="studio-form-grid__full">Description<textarea value={meta.description ?? ""} onChange={e => changeMeta({ description: e.target.value })} /></label>
              <label>Durée (automatique si vide)<input type="text" value={stage.duration ?? ""} onChange={e => change({ duration: e.target.value })} /></label>
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
                <label className="studio-form-grid__full">Carte (lien Google Maps ou intégration)<input type="url" value={stage.map_embed_url ?? ""} onChange={e => change({ map_embed_url: e.target.value })} /></label>
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
              images={images}
              onUploadPhoto={onUploadPoiPhoto}
              uploadLoading={uploadLoading}
            />
          </div>

          <AccommSection
            stageId={stage.id}
            stage={stage}
            onChange={change}
            stages={stages}
            variantsByStage={variantsByStage}
            onDuplicate={onDuplicateAccommodation}
            images={images}
            onUploadPhoto={onUploadAccommodationPhoto}
            uploadLoading={uploadLoading}
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
      stageDisplayLabel={displayLabel}
      stageVariants={stageVariants}
      stageCrud={stageCrud}
      gpx={gpx}
      poisByVariant={poisByVariant}
      onVariantChange={onVariantChange}
      onUploadVariantPhoto={onUploadVariantPhoto}
      images={images}
      stages={stages}
      variantsByStage={variantsByStage}
      onDuplicateAccommodation={onDuplicateAccommodation}
      onUploadAccommodationPhoto={onUploadAccommodationPhoto}
      onUploadPoiPhoto={onUploadPoiPhoto}
      uploadLoading={uploadLoading}
    />
    </>
  );
}
