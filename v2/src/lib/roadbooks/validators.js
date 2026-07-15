import { normalizeAccommodation } from "./accommodations.js";

export function validateGpx(file) {
  const name = file.name.toLowerCase();
  const accept = name.endsWith(".gpx") || ["application/gpx+xml", "application/xml", "text/xml"].includes(file.type);
  if (!accept) return "Seuls les fichiers .gpx sont acceptés.";
  if (file.size > 10 * 1024 * 1024) return "Le fichier dépasse 10 Mo.";
  return null;
}

export function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

const GPX_SCOPES_VALID = new Set(["roadbook", "stage", "variant"]);
const GPX_ROLES_VALID = new Set(["official", "custom"]);

function isPosInt(value) {
  return Number.isInteger(value) && value > 0;
}

export function buildGpxPath(userId, roadbookId, scope, role, stageId, variantId) {
  if (!userId || String(userId).trim() === "") throw new Error("gpx-path-user-id-required");
  if (!isPosInt(roadbookId)) throw new Error("gpx-path-roadbook-id-invalid");
  if (!GPX_SCOPES_VALID.has(scope)) throw new Error("gpx-path-scope-invalid");
  if (!GPX_ROLES_VALID.has(role)) throw new Error("gpx-path-role-invalid");
  if (scope === "roadbook") {
    if (stageId != null) throw new Error("gpx-path-stage-id-not-allowed");
    if (variantId != null) throw new Error("gpx-path-variant-id-not-allowed");
    return `${userId}/${roadbookId}/roadbook/${role}/${crypto.randomUUID()}`;
  }
  if (scope === "stage") {
    if (!isPosInt(stageId)) throw new Error("gpx-path-stage-id-required");
    if (variantId != null) throw new Error("gpx-path-variant-id-not-allowed");
    return `${userId}/${roadbookId}/stages/${stageId}/${role}/${crypto.randomUUID()}`;
  }
  if (scope === "variant") {
    if (!isPosInt(stageId)) throw new Error("gpx-path-stage-id-required");
    if (!isPosInt(variantId)) throw new Error("gpx-path-variant-id-required");
    return `${userId}/${roadbookId}/stages/${stageId}/variants/${variantId}/${role}/${crypto.randomUUID()}`;
  }
  throw new Error("gpx-path-scope-invalid");
}

export function resizeImage(file, maxWidth = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let { width, height } = img;
      if (width > maxWidth) {
        height = Math.round(height * maxWidth / width);
        width = maxWidth;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        if (!blob) { reject(new Error("Échec de la compression")); return; }
        resolve({ blob, width, height, size: blob.size });
      }, "image/jpeg", 0.85);
    };
    img.onerror = reject;
    img.src = url;
  });
}

export function defaultStageFormState() {
  return {
    dayNumber: "", title: "", start: "", end: "",
    dist: "", gain: "", loss: "", description: "", notes: "",
    mapEmbed: "", photoUrl: "", day: "", duration: "",
  };
}

export function stageToFormValues(stage) {
  const meta = stage.metadata ?? {};
  return {
    dayNumber: String(stage.stage_number),
    title: stage.title ?? "",
    start: stage.departure ?? "",
    end: stage.arrival ?? "",
    dist: stage.distance_km != null ? String(stage.distance_km) : "",
    gain: stage.elevation_gain_m != null ? String(stage.elevation_gain_m) : "",
    loss: stage.elevation_loss_m != null ? String(stage.elevation_loss_m) : "",
    description: meta.description ?? "",
    notes: stage.notes?.length ? stage.notes.map(n => n.text ?? n).join("\n") : "",
    mapEmbed: stage.map_embed_url ?? "",
    photoUrl: stage.stage_photo_url ?? "",
    day: stage.day ?? "",
    duration: stage.duration ?? "",
  };
}

export function buildStageRecord(id, form, editingStage) {
  const dayNumber = Number(form.dayNumber);
  const notes = form.notes.split("\n").map(l => l.trim()).filter(Boolean).map(text => ({ text }));
  const metadata = {};
  if (form.description) metadata.description = form.description;
  const record = {
    roadbook_id: Number(id),
    stage_number: dayNumber,
    sort_order: normalizeNumber(editingStage?.sort_order),
    title: form.title || null,
    departure: form.start || null,
    arrival: form.end || null,
    distance_km: normalizeNumber(form.dist),
    elevation_gain_m: normalizeNumber(form.gain),
    elevation_loss_m: normalizeNumber(form.loss),
    map_embed_url: form.mapEmbed || null,
    stage_photo_url: form.photoUrl || null,
    day: form.day || null,
    duration: form.duration || null,
    notes: notes.length ? notes : [],
    metadata,
  };
  return record;
}

export function buildPoiRecord(poiForm) {
  const mapQuery = [poiForm.name, poiForm.region].map(value => value?.trim()).filter(Boolean).join(", ");
  const metadata = { ...(poiForm.metadata ?? {}) };
  const photoMediaId = Number(poiForm.photoMediaId);
  if (Number.isInteger(photoMediaId) && photoMediaId > 0) metadata.poiPhotoMediaId = photoMediaId;
  if (poiForm.preview) metadata.linkPreview = poiForm.preview;
  else delete metadata.linkPreview;
  return {
    stage_id: poiForm.stage_id,
    variant_id: poiForm.variant_id ?? null,
    name: poiForm.name.trim(),
    description: poiForm.description || null,
    region: poiForm.region?.trim() || null,
    lat: null,
    lng: null,
    photo_url: poiForm.photoUrl?.trim() || null,
    link_url: poiForm.link?.trim() || (mapQuery
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
      : null),
    metadata,
  };
}

export function buildEditableStageUpdate(stage, index = 0) {
  return {
    stage_number: normalizeNumber(stage.stage_number),
    sort_order: normalizeNumber(stage.sort_order) ?? index + 1,
    title: stage.title?.trim() || null,
    departure: stage.departure?.trim() || null,
    arrival: stage.arrival?.trim() || null,
    distance_km: normalizeNumber(stage.distance_km),
    elevation_gain_m: normalizeNumber(stage.elevation_gain_m),
    elevation_loss_m: normalizeNumber(stage.elevation_loss_m),
    stage_photo_url: stage.stage_photo_url?.trim() || null,
    accommodation_type: stage.accommodation_type?.trim() || null,
    accommodation_name: stage.accommodation_name?.trim() || null,
    accommodation_url: stage.accommodation_url?.trim() || null,
    accommodation_photo: stage.accommodation_photo?.trim() || null,
    alternatives: Array.isArray(stage.alternatives) ? stage.alternatives.map(normalizeAccommodation) : [],
    map_embed_url: stage.map_embed_url?.trim() || null,
    day: stage.day?.trim() || null,
    stage_label: stage.stage_label?.trim() || null,
    duration: stage.duration?.trim() || null,
    metadata: { ...(stage.metadata ?? {}) },
  };
}

export function buildVariantRecord(variantForm) {
  const meta = {};
  if (variantForm.type) meta.type = variantForm.type;
  const notesArr = variantForm.notes
    ? variantForm.notes.split("\n").map(l => l.trim()).filter(Boolean).map(text => ({ text }))
    : [];
  return {
    stage_id: variantForm.stage_id,
    label: variantForm.title.trim(),
    sort_order: normalizeNumber(variantForm.sort_order) ?? 0,
    description: variantForm.description || null,
    distance_km: normalizeNumber(variantForm.distance_km),
    departure: variantForm.departure || null,
    arrival: variantForm.arrival || null,
    elevation_gain_m: normalizeNumber(variantForm.elevation_gain_m),
    elevation_loss_m: normalizeNumber(variantForm.elevation_loss_m),
    map_embed_url: variantForm.map_embed_url || null,
    stage_photo_url: variantForm.stage_photo_url || null,
    day: variantForm.day || null,
    duration: variantForm.duration || null,
    notes: notesArr.length ? notesArr : [],
    metadata: Object.keys(meta).length ? meta : {},
  };
}

export function buildNotePayload(stage, noteForm) {
  const notes = Array.isArray(stage.notes) ? [...stage.notes] : [];
  if (noteForm.editing != null && notes[noteForm.editing]) {
    notes[noteForm.editing] = { ...notes[noteForm.editing], text: noteForm.text.trim() };
  } else {
    notes.push({ text: noteForm.text.trim() });
  }
  return notes;
}

export function removeNote(stage, noteIndex) {
  const notes = Array.isArray(stage.notes) ? [...stage.notes] : [];
  notes.splice(noteIndex, 1);
  return notes;
}

export function groupByStageId(rows) {
  const map = {};
  (rows || []).forEach(r => {
    if (!map[r.stage_id]) map[r.stage_id] = [];
    map[r.stage_id].push(r);
  });
  return map;
}

export function groupByVariantId(rows) {
  const map = {};
  (rows || []).forEach(row => {
    if (row.variant_id == null) return;
    if (!map[row.variant_id]) map[row.variant_id] = [];
    map[row.variant_id].push(row);
  });
  return map;
}

export function buildEditableVariantUpdate(variant) {
  return {
    label: variant.label?.trim() || "Variante",
    departure: variant.departure?.trim() || null,
    arrival: variant.arrival?.trim() || null,
    distance_km: normalizeNumber(variant.distance_km),
    elevation_gain_m: normalizeNumber(variant.elevation_gain_m),
    elevation_loss_m: normalizeNumber(variant.elevation_loss_m),
    stage_photo_url: variant.stage_photo_url?.trim() || null,
    accommodation_type: variant.accommodation_type?.trim() || null,
    accommodation_name: variant.accommodation_name?.trim() || null,
    accommodation_url: variant.accommodation_url?.trim() || null,
    accommodation_photo: variant.accommodation_photo?.trim() || null,
    alternatives: Array.isArray(variant.alternatives) ? variant.alternatives.map(normalizeAccommodation) : [],
    map_embed_url: variant.map_embed_url?.trim() || null,
    day: variant.day?.trim() || null,
    stage_label: variant.stage_label?.trim() || null,
    duration: variant.duration?.trim() || null,
    description: variant.description?.trim() || null,
    metadata: { ...(variant.metadata ?? {}) },
  };
}

export function validateStageForm(form) {
  const errors = [];
  if (!form.dayNumber || !Number(form.dayNumber)) errors.push("Le numéro d'étape est obligatoire.");
  return errors;
}
