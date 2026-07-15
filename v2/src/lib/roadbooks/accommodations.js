function accommodationValue(value, trim = true) {
  if (typeof value === "string") {
    return { name: trim ? value.trim() : value, url: "", photo: "", photoMediaId: null, type: "", price: "", note: "", description: "", preview: null };
  }
  const source = value && typeof value === "object" ? value : {};
  const text = (field) => {
    const result = String(source[field] ?? "");
    return trim ? result.trim() : result;
  };
  return {
    name: text("name"),
    url: text("url"),
    photo: text("photo"),
    photoMediaId: Number.isInteger(Number(source.photoMediaId ?? source.photo_media_id)) && Number(source.photoMediaId ?? source.photo_media_id) > 0
      ? Number(source.photoMediaId ?? source.photo_media_id)
      : null,
    type: text("type"),
    price: text("price"),
    note: text("note"),
    description: text("description"),
    preview: normalizeLinkPreview(source.preview),
  };
}

export function normalizeLinkPreview(value) {
  const source = value && typeof value === "object" ? value : {};
  const preview = {
    title: String(source.title ?? "").trim(),
    description: String(source.description ?? "").trim(),
    siteName: String(source.siteName ?? source.site_name ?? "").trim(),
    url: String(source.url ?? "").trim(),
  };
  return preview.title || preview.description || preview.siteName || preview.url ? preview : null;
}

export function normalizeAccommodation(value) {
  return accommodationValue(value, true);
}

export function hasAccommodation(value) {
  const accommodation = normalizeAccommodation(value);
  return Boolean(accommodation.name || accommodation.url || accommodation.photo || accommodation.photoMediaId || accommodation.type || accommodation.price || accommodation.note || accommodation.description || accommodation.preview);
}

export function primaryAccommodationFromStage(stage) {
  return accommodationValue({
    name: stage?.accommodation_name,
    url: stage?.accommodation_url,
    photo: stage?.accommodation_photo,
    photoMediaId: stage?.metadata?.accommodationPhotoMediaId,
    type: stage?.accommodation_type,
    price: stage?.metadata?.accommodationPrice,
    note: stage?.metadata?.accommodationNote,
    description: stage?.metadata?.accommodationDescription,
    preview: stage?.metadata?.accommodationPreview,
  }, false);
}

export function alternativesFromStage(stage) {
  return Array.isArray(stage?.alternatives)
    ? stage.alternatives.map(value => accommodationValue(value, false))
    : [];
}

function metadataWithAccommodation(metadata, accommodation) {
  const nextMetadata = { ...(metadata ?? {}) };
  const cleanNote = String(accommodation.note ?? "").trim();
  const cleanPrice = String(accommodation.price ?? "").trim();
  const photoMediaId = Number(accommodation.photoMediaId);
  const cleanDescription = String(accommodation.description ?? "").trim();
  if (cleanNote) nextMetadata.accommodationNote = cleanNote;
  else delete nextMetadata.accommodationNote;
  if (cleanPrice) nextMetadata.accommodationPrice = cleanPrice;
  else delete nextMetadata.accommodationPrice;
  if (Number.isInteger(photoMediaId) && photoMediaId > 0) nextMetadata.accommodationPhotoMediaId = photoMediaId;
  else delete nextMetadata.accommodationPhotoMediaId;
  if (cleanDescription) nextMetadata.accommodationDescription = cleanDescription;
  else delete nextMetadata.accommodationDescription;
  if (accommodation.preview) nextMetadata.accommodationPreview = normalizeLinkPreview(accommodation.preview);
  else delete nextMetadata.accommodationPreview;
  return nextMetadata;
}

export function buildPrimaryAccommodationUpdate(stage, value) {
  const accommodation = normalizeAccommodation(value);
  return {
    accommodation_name: accommodation.name || null,
    accommodation_url: accommodation.url || null,
    accommodation_photo: accommodation.photo || null,
    accommodation_type: accommodation.type || null,
    metadata: metadataWithAccommodation(stage?.metadata, accommodation),
  };
}

export function buildAlternativeAccommodationUpdate(stage, value, editingIndex = null) {
  const alternatives = alternativesFromStage(stage);
  const accommodation = normalizeAccommodation(value);
  if (editingIndex == null) alternatives.push(accommodation);
  else {
    if (!alternatives[editingIndex]) throw new Error("Hébergement alternatif introuvable.");
    alternatives[editingIndex] = accommodation;
  }
  return { alternatives };
}

export function buildRemoveAlternativeUpdate(stage, index) {
  const alternatives = alternativesFromStage(stage);
  if (!alternatives[index]) throw new Error("Hébergement alternatif introuvable.");
  alternatives.splice(index, 1);
  return { alternatives };
}

export function buildPromoteAlternativeUpdate(stage, index) {
  const alternatives = alternativesFromStage(stage);
  const promoted = alternatives[index];
  if (!promoted) throw new Error("Hébergement alternatif introuvable.");

  const previousPrimary = primaryAccommodationFromStage(stage);
  if (hasAccommodation(previousPrimary)) alternatives.splice(index, 1, previousPrimary);
  else alternatives.splice(index, 1);

  return {
    ...buildPrimaryAccommodationUpdate(stage, promoted),
    alternatives,
  };
}

export function buildDemotePrimaryUpdate(stage) {
  const primary = primaryAccommodationFromStage(stage);
  if (!hasAccommodation(primary)) throw new Error("Aucun hébergement principal à convertir.");
  return {
    ...buildPrimaryAccommodationUpdate(stage, {}),
    alternatives: [...alternativesFromStage(stage), primary],
  };
}

export function buildClearPrimaryAccommodationUpdate(stage) {
  return buildPrimaryAccommodationUpdate(stage, {});
}
