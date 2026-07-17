import { buildAlternativeAccommodationUpdate } from "./accommodations.js";
import { buildPoiRecord } from "./validators.js";

export function buildQuickNoteUpdate(entity, text) {
  const cleanText = String(text ?? "").trim();
  if (!cleanText) throw new Error("Le texte de la note est obligatoire.");
  const notes = Array.isArray(entity?.notes) ? [...entity.notes] : [];
  notes.push({ text: cleanText });
  return { notes };
}

export function buildQuickAccommodationUpdate(entity, value) {
  const name = String(value?.name ?? "").trim();
  if (!name) throw new Error("Le nom de l'hébergement est obligatoire.");
  return buildAlternativeAccommodationUpdate(entity, { ...value, name });
}

export function buildQuickPoiRecord(stageId, variantId, value) {
  return buildPoiRecord({
    stage_id: Number(stageId),
    variant_id: variantId == null ? null : Number(variantId),
    name: String(value?.name ?? ""),
    region: String(value?.region ?? ""),
    link: String(value?.link ?? ""),
    description: String(value?.description ?? ""),
    photoUrl: "",
    photoMediaId: null,
    preview: null,
    metadata: {},
  });
}
