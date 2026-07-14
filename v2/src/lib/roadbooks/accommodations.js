export function normalizeAccommodation(value) {
  if (typeof value === "string") {
    return { name: value.trim(), url: "", photo: "", type: "", note: "" };
  }
  const source = value && typeof value === "object" ? value : {};
  return {
    name: String(source.displayName ?? source.name ?? "").trim(),
    url: String(source.website ?? source.url ?? "").trim(),
    photo: String(source.photo ?? "").trim(),
    type: String(source.type ?? "").trim(),
    note: String(source.comment ?? source.note ?? "").trim(),
  };
}

export function hasAccommodation(value) {
  const accommodation = normalizeAccommodation(value);
  return Boolean(accommodation.name || accommodation.url || accommodation.photo);
}

export function primaryAccommodationFromStage(stage) {
  return normalizeAccommodation({
    name: stage?.accommodation_name,
    url: stage?.accommodation_url,
    photo: stage?.accommodation_photo,
    type: stage?.accommodation_type,
    note: stage?.metadata?.accommodationNote ?? stage?.metadata?.accommodation?.note,
  });
}

export function alternativesFromStage(stage) {
  return Array.isArray(stage?.alternatives)
    ? stage.alternatives.map(normalizeAccommodation)
    : [];
}

function metadataWithAccommodationNote(metadata, note) {
  const nextMetadata = { ...(metadata ?? {}) };
  const cleanNote = String(note ?? "").trim();
  if (cleanNote) nextMetadata.accommodationNote = cleanNote;
  else delete nextMetadata.accommodationNote;
  return nextMetadata;
}

export function buildPrimaryAccommodationUpdate(stage, value) {
  const accommodation = normalizeAccommodation(value);
  return {
    accommodation_name: accommodation.name || null,
    accommodation_url: accommodation.url || null,
    accommodation_photo: accommodation.photo || null,
    accommodation_type: accommodation.type || null,
    metadata: metadataWithAccommodationNote(stage?.metadata, accommodation.note),
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
