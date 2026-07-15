const STOP_WORDS = new Set([
  "a", "au", "aux", "d", "de", "des", "du", "en", "et", "l", "la", "le", "les",
  "of", "sur", "the", "un", "une",
]);

export function normalizeEvidence(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

function significantTerms(value) {
  return normalizeEvidence(value)
    .split(" ")
    .filter(term => term.length >= 3 && !STOP_WORDS.has(term));
}

function identityScore(name, evidence, locations = []) {
  const normalizedName = normalizeEvidence(name);
  const normalizedEvidence = normalizeEvidence(evidence);
  if (!normalizedName || !normalizedEvidence) return 0;
  if (normalizedEvidence.includes(normalizedName)) return 3;
  const locationTerms = new Set(locations.flatMap(significantTerms));
  const allTerms = significantTerms(name);
  const termsWithoutLocation = allTerms.filter(term => !locationTerms.has(term));
  const terms = termsWithoutLocation.length ? termsWithoutLocation : allTerms;
  if (!terms.length) return 0;
  const matches = terms.filter(term => normalizedEvidence.includes(term)).length;
  if (terms.length === 1 && matches === 1 && terms[0].length >= 5) return 2;
  if (matches === terms.length && terms.length >= 2) return 2;
  return matches / terms.length >= 0.75 && matches >= 2 ? 1 : 0;
}

function resourceLocations(item) {
  return [item?.region, ...(Array.isArray(item?.locations) ? item.locations : [])]
    .map(normalizeEvidence)
    .filter(location => location.length >= 3);
}

export function evaluateResourceCandidate(item, candidate) {
  const evidence = [candidate?.title, candidate?.description, candidate?.evidence, candidate?.preview?.title, candidate?.preview?.description]
    .filter(Boolean)
    .join(" ");
  const locations = resourceLocations(item);
  const identity = identityScore(item?.name, evidence, locations);
  const normalizedEvidence = normalizeEvidence(evidence);
  const location = locations.some(value => normalizedEvidence.includes(value)) ? 1 : 0;
  const accepted = identity >= 2 && (!locations.length || location > 0);
  return {
    accepted,
    identity,
    location,
    reason: accepted ? "identity-and-location-match" : identity < 2 ? "identity-uncertain" : "location-uncertain",
  };
}

export function chooseRelevantDescription(blocks, item) {
  const candidates = (blocks ?? [])
    .map((text, index) => ({ text: String(text ?? "").trim(), index }))
    .filter(entry => entry.text.length >= 70 && entry.text.length <= 1_200)
    .map(entry => ({ ...entry, score: identityScore(item?.name, entry.text, resourceLocations(item)) }))
    .filter(entry => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
  return candidates[0]?.text?.slice(0, 800) ?? "";
}
