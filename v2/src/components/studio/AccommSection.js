"use client";

import { useState } from "react";
import {
  alternativesFromStage,
  buildClearPrimaryAccommodationUpdate,
  buildDemotePrimaryUpdate,
  buildPromoteAlternativeUpdate,
  hasAccommodation,
  primaryAccommodationFromStage,
} from "@/lib/roadbooks/accommodations";
import { resolveStageTitle, resolveVariantTitle, stageDisplayLabel } from "@/lib/roadbooks/stage-order";

const PRIMARY_FIELDS = {
  name: "accommodation_name",
  type: "accommodation_type",
  url: "accommodation_url",
  photo: "accommodation_photo",
};

function AccommodationFields({ accommodation, onChange, idPrefix, photoMedia, onUploadPhoto, uploadLoading }) {
  return (
    <div className="studio-form-grid studio-form-grid--compact">
      <label htmlFor={`${idPrefix}-name`}>Nom<input id={`${idPrefix}-name`} type="text" value={accommodation.name} onChange={event => onChange("name", event.target.value)} /></label>
      <label htmlFor={`${idPrefix}-type`}>Type<input id={`${idPrefix}-type`} type="text" value={accommodation.type} onChange={event => onChange("type", event.target.value)} /></label>
      <label className="studio-form-grid__full" htmlFor={`${idPrefix}-price`}>Prix<input id={`${idPrefix}-price`} type="text" value={accommodation.price} onChange={event => onChange("price", event.target.value)} /></label>
      <label className="studio-form-grid__full" htmlFor={`${idPrefix}-url`}>Lien<input id={`${idPrefix}-url`} type="url" value={accommodation.url} onChange={event => onChange("url", event.target.value)} /></label>
      <div className="studio-form-grid__full">
        <label htmlFor={`${idPrefix}-photo`}>Photo (URL ou fichier)</label>
        <div className="studio-resource-field">
          <input id={`${idPrefix}-photo`} type="url" value={accommodation.photo} onChange={event => onChange("photo", event.target.value)} />
          {photoMedia && <span className="studio-resource-field__file">{photoMedia.file_name}</span>}
          <label className="terrain-button--secondary studio-action-button--compact studio-file-button">
            {uploadLoading ? "Import…" : "Importer"}
            <input type="file" accept="image/*" disabled={uploadLoading} onChange={async event => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) await onUploadPhoto?.(file);
            }} />
          </label>
        </div>
      </div>
      <label className="studio-form-grid__full" htmlFor={`${idPrefix}-description`}>Description (automatique si vide)<textarea id={`${idPrefix}-description`} value={accommodation.description} onChange={event => onChange("description", event.target.value)} /></label>
      <label className="studio-form-grid__full" htmlFor={`${idPrefix}-note`}>Note<textarea id={`${idPrefix}-note`} value={accommodation.note} onChange={event => onChange("note", event.target.value)} /></label>
    </div>
  );
}

function DuplicateAccommodationControl({ accommodation, sourceKind, stageId, variantId, stages, variantsByStage, onDuplicate }) {
  const [targetKey, setTargetKey] = useState("");
  const [duplicating, setDuplicating] = useState(false);
  const stageTargets = stages
    .filter(candidate => variantId != null || String(candidate.id) !== String(stageId))
    .map(target => {
      const targetIndex = stages.findIndex(candidate => String(candidate.id) === String(target.id));
      return {
        type: "stage",
        id: target.id,
        key: `stage:${target.id}`,
        label: resolveStageTitle(target, stageDisplayLabel(stages, targetIndex)),
      };
    });
  const variantTargets = stages.flatMap((parentStage, stageIndex) => {
    const parentLabel = stageDisplayLabel(stages, stageIndex);
    return (variantsByStage?.[parentStage.id] ?? [])
      .filter(target => String(target.id) !== String(variantId))
      .map(target => ({
        type: "variant",
        id: target.id,
        stageId: parentStage.id,
        key: `variant:${target.id}`,
        label: `${resolveStageTitle(parentStage, parentLabel)} — ${resolveVariantTitle(target, parentLabel)}`,
      }));
  });
  const targets = [...stageTargets, ...variantTargets];
  if (!targets.length) return null;

  const duplicate = async () => {
    const target = targets.find(candidate => candidate.key === targetKey);
    if (!target) return;
    setDuplicating(true);
    try {
      const duplicated = await onDuplicate?.(target, accommodation, sourceKind);
      if (duplicated !== false) setTargetKey("");
    } finally {
      setDuplicating(false);
    }
  };

  return (
    <div className="studio-actions studio-accommodation-duplicate">
      <select value={targetKey} onChange={event => setTargetKey(event.target.value)} aria-label="Étape ou variante de destination">
        <option value="">Dupliquer vers une étape ou variante…</option>
        {stageTargets.length > 0 && <optgroup label="Étapes">
          {stageTargets.map(target => <option key={target.key} value={target.key}>{target.label}</option>)}
        </optgroup>}
        {variantTargets.length > 0 && <optgroup label="Variantes">
          {variantTargets.map(target => <option key={target.key} value={target.key}>{target.label}</option>)}
        </optgroup>}
      </select>
      <button type="button" className="terrain-button terrain-button--secondary" disabled={!targetKey || duplicating} onClick={duplicate}>{duplicating ? "Duplication…" : "Dupliquer"}</button>
    </div>
  );
}

export default function AccommSection({ stageId, variantId = null, stage, onChange, stages = [], variantsByStage = {}, onDuplicate, images = [], onUploadPhoto, uploadLoading = false }) {
  const primary = primaryAccommodationFromStage(stage);
  const alternatives = alternativesFromStage(stage);
  const targetPrefix = variantId == null ? `stage-${stageId}` : `variant-${variantId}`;

  const changePrimary = (field, value) => {
    if (field === "note" || field === "price" || field === "description") {
      const metadataKey = field === "note" ? "accommodationNote" : field === "price" ? "accommodationPrice" : "accommodationDescription";
      onChange({ metadata: { ...(stage.metadata ?? {}), [metadataKey]: value } });
      return;
    }
    if (field === "photo") {
      const metadata = { ...(stage.metadata ?? {}) };
      delete metadata.accommodationPhotoMediaId;
      onChange({ accommodation_photo: value, metadata });
      return;
    }
    if (field === "url") {
      const metadata = { ...(stage.metadata ?? {}) };
      delete metadata.accommodationPreview;
      onChange({ accommodation_url: value, metadata });
      return;
    }
    onChange({ [PRIMARY_FIELDS[field]]: value });
  };

  const changeAlternative = (index, field, value) => {
    const nextAlternatives = alternatives.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value, ...(field === "photo" ? { photoMediaId: null } : {}), ...(field === "url" ? { preview: null } : {}) } : item
    ));
    onChange({ alternatives: nextAlternatives });
  };

  const addAlternative = () => {
    onChange({ alternatives: [...alternatives, { name: "", type: "", url: "", photo: "", photoMediaId: null, price: "", note: "", description: "", preview: null }] });
  };

  const removeAlternative = (index) => {
    if (!window.confirm("Supprimer cet hébergement alternatif ?")) return;
    onChange({ alternatives: alternatives.filter((_, itemIndex) => itemIndex !== index) });
  };

  const uploadPrimaryPhoto = async (file) => {
    const media = await onUploadPhoto?.(file, { stageId, variantId });
    if (!media?.id) return;
    onChange({
      accommodation_photo: "",
      metadata: { ...(stage.metadata ?? {}), accommodationPhotoMediaId: media.id },
    });
  };

  const uploadAlternativePhoto = async (file, index) => {
    const media = await onUploadPhoto?.(file, { stageId, variantId });
    if (!media?.id) return;
    onChange({
      alternatives: alternatives.map((item, itemIndex) => itemIndex === index
        ? { ...item, photo: "", photoMediaId: media.id }
        : item),
    });
  };

  const mediaById = mediaId => images.find(image => Number(image.id) === Number(mediaId)) ?? null;

  return (
    <>
      <div className="studio-zone studio-zone--accommodation">
        <h4 className="studio-zone__title">Hébergement principal</h4>
        <AccommodationFields accommodation={primary} onChange={changePrimary} idPrefix={`${targetPrefix}-accommodation-primary`} photoMedia={mediaById(primary.photoMediaId)} onUploadPhoto={uploadPrimaryPhoto} uploadLoading={uploadLoading} />
        {hasAccommodation(primary) && (
          <>
            <div className="studio-actions" style={{ marginTop: "0.5rem" }}>
              <button type="button" className="terrain-button terrain-button--secondary" onClick={() => onChange(buildDemotePrimaryUpdate(stage))}>Passer en alternatif</button>
              <button type="button" className="terrain-button terrain-button--danger" onClick={() => {
                if (window.confirm("Supprimer l'hébergement principal ?")) onChange(buildClearPrimaryAccommodationUpdate(stage));
              }}>Supprimer</button>
            </div>
            <DuplicateAccommodationControl accommodation={primary} sourceKind="primary" stageId={stageId} variantId={variantId} stages={stages} variantsByStage={variantsByStage} onDuplicate={onDuplicate} />
          </>
        )}
      </div>

      <div className="studio-zone studio-zone--alternatives">
        <div className="studio-stage-extra__header">
          <h4 className="studio-zone__title">Hébergements alternatifs</h4>
          <button type="button" className="terrain-button terrain-button--secondary" onClick={addAlternative}>Ajouter un hébergement alternatif</button>
        </div>
        {alternatives.length ? alternatives.map((alternative, index) => (
          <article className="studio-subitem-card" key={`${targetPrefix}-alternative-${index}`}>
            <AccommodationFields
              accommodation={alternative}
              onChange={(field, value) => changeAlternative(index, field, value)}
              idPrefix={`${targetPrefix}-accommodation-alternative-${index}`}
              photoMedia={mediaById(alternative.photoMediaId)}
              onUploadPhoto={file => uploadAlternativePhoto(file, index)}
              uploadLoading={uploadLoading}
            />
            <div className="studio-actions" style={{ marginTop: "0.5rem" }}>
              <button type="button" className="terrain-button terrain-button--secondary" onClick={() => onChange(buildPromoteAlternativeUpdate(stage, index))}>Rendre principal</button>
              <button type="button" className="terrain-button terrain-button--danger" onClick={() => removeAlternative(index)}>Supprimer</button>
            </div>
            {hasAccommodation(alternative) && <DuplicateAccommodationControl accommodation={alternative} sourceKind="alternative" stageId={stageId} variantId={variantId} stages={stages} variantsByStage={variantsByStage} onDuplicate={onDuplicate} />}
          </article>
        )) : <p className="studio-detail--empty">Aucun hébergement alternatif.</p>}
      </div>
    </>
  );
}
