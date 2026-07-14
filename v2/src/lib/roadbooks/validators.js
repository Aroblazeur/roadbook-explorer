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
    dist: "", gain: "", loss: "", difficulty: "",
    accommodation: "", description: "", notes: "", warning: "",
    mapEmbed: "", photoUrl: "", day: "", label: "", duration: "",
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
    difficulty: meta.difficulty ?? "",
    accommodation: stage.accommodation_name ?? "",
    description: meta.description ?? "",
    notes: stage.notes?.length ? stage.notes.map(n => n.text ?? n).join("\n") : "",
    warning: meta.warning ?? "",
    mapEmbed: stage.map_embed_url ?? "",
    photoUrl: stage.stage_photo_url ?? "",
    day: stage.day ?? "",
    label: stage.stage_label ?? "",
    duration: stage.duration ?? "",
  };
}

export function buildStageRecord(id, form, editingStage) {
  const dayNumber = Number(form.dayNumber);
  const notes = form.notes.split("\n").map(l => l.trim()).filter(Boolean).map(text => ({ text }));
  const metadata = {};
  if (form.difficulty) metadata.difficulty = form.difficulty;
  if (form.description) metadata.description = form.description;
  if (form.warning) metadata.warning = form.warning;
  const record = {
    roadbook_id: Number(id),
    stage_number: dayNumber,
    title: form.title || null,
    departure: form.start || null,
    arrival: form.end || null,
    distance_km: normalizeNumber(form.dist),
    elevation_gain_m: normalizeNumber(form.gain),
    elevation_loss_m: normalizeNumber(form.loss),
    accommodation_name: form.accommodation || null,
    map_embed_url: form.mapEmbed || null,
    stage_photo_url: form.photoUrl || null,
    day: form.day || null,
    stage_label: form.label || null,
    duration: form.duration || null,
    notes: notes.length ? notes : [],
    metadata,
  };
  return record;
}

export function buildPoiRecord(poiForm) {
  const mapQuery = [poiForm.name, poiForm.region].map(value => value?.trim()).filter(Boolean).join(", ");
  return {
    stage_id: poiForm.stage_id,
    name: poiForm.name.trim(),
    description: poiForm.description || null,
    region: poiForm.region?.trim() || null,
    lat: null,
    lng: null,
    link_url: poiForm.link?.trim() || (mapQuery
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
      : null),
  };
}

export function buildEditableStageUpdate(stage) {
  return {
    stage_number: normalizeNumber(stage.stage_number),
    title: stage.title?.trim() || null,
    departure: stage.departure?.trim() || null,
    arrival: stage.arrival?.trim() || null,
    distance_km: normalizeNumber(stage.distance_km),
    elevation_gain_m: normalizeNumber(stage.elevation_gain_m),
    elevation_loss_m: normalizeNumber(stage.elevation_loss_m),
    stage_photo_url: stage.stage_photo_url?.trim() || null,
    accommodation_type: stage.accommodation_type?.trim() || null,
    accommodation_name: stage.accommodation_name?.trim() || null,
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
    label: variantForm.title,
    description: variantForm.description || null,
    distance_km: normalizeNumber(variantForm.distance_km),
    departure: variantForm.departure || null,
    arrival: variantForm.arrival || null,
    elevation_gain_m: normalizeNumber(variantForm.elevation_gain_m),
    elevation_loss_m: normalizeNumber(variantForm.elevation_loss_m),
    map_embed_url: variantForm.map_embed_url || null,
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

export function validateStageForm(form) {
  const errors = [];
  if (!form.dayNumber || !Number(form.dayNumber)) errors.push("Le numéro d'étape est obligatoire.");
  return errors;
}
