/**
 * Sprint 20B — Tests des fonctions pures extraites du Studio
 *
 * Vérifie les transformations, validations et calculs sans
 * dépendance à la base, au navigateur ni à React.
 *
 * Usage:
 *   node scripts/test-sprint-20b.mjs
 */

import { strict as assert } from "node:assert";

// Note: crypto.randomUUID est natif dans Node 24+, pas besoin de mock

import {
  validateGpx, normalizeNumber, buildGpxPath, resizeImage,
  defaultStageFormState, stageToFormValues, buildStageRecord,
  buildPoiRecord, buildVariantRecord, buildNotePayload, removeNote,
  groupByStageId, validateStageForm,
} from "../src/lib/roadbooks/validators.js";

import {
  buildOfficialMeta, buildStagesTotalMeta, buildTraceUpdateFields,
  calculateTotals, formatTotalsSummary, buildTotalsUpdateFields,
  buildGpxStageUpdate, buildEnrichPoiUpdate, buildEnrichAccommodationUpdate,
  buildExistingFieldsList, buildGpxConfirmMessage, buildGpxMetricsSuccessMessage,
  buildDuplicateSlug, buildDuplicateRoadbookInsert, buildDuplicateStageInsert,
  buildDuplicatePoiInsert, buildDuplicateVariantInsert,
} from "../src/lib/roadbooks/mutations.js";

import {
  buildAlternativeAccommodationUpdate,
  buildDemotePrimaryUpdate,
  buildPrimaryAccommodationUpdate,
  buildPromoteAlternativeUpdate,
} from "../src/lib/roadbooks/accommodations.js";

let passed = 0, failed = 0;

function test(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error(`  ✗ ${name}: ${e.message}`); failed++; }
}

console.log("=== 1. Validateurs ===");

test("validateGpx accepte .gpx", () => {
  const file = { name: "trace.gpx", type: "application/gpx+xml", size: 1000 };
  assert.equal(validateGpx(file), null);
});

test("validateGpx rejette .txt", () => {
  const file = { name: "trace.txt", type: "text/plain", size: 1000 };
  assert.ok(validateGpx(file));
});

test("validateGpx rejette > 10 Mo", () => {
  const file = { name: "trace.gpx", type: "application/gpx+xml", size: 11 * 1024 * 1024 };
  assert.ok(validateGpx(file));
});

test("normalizeNumber null", () => {
  assert.equal(normalizeNumber(null), null);
  assert.equal(normalizeNumber(undefined), null);
  assert.equal(normalizeNumber(""), null);
});

test("normalizeNumber valide", () => {
  assert.equal(normalizeNumber("42"), 42);
  assert.equal(normalizeNumber("3.14"), 3.14);
});

test("normalizeNumber invalide", () => {
  assert.equal(normalizeNumber("abc"), null);
});

test("buildGpxPath roadbook official", () => {
  const path = buildGpxPath("u1", 42, "roadbook", "official", null, null);
  assert.ok(path.startsWith("u1/42/roadbook/official/"), `path=${path}`);
});

test("buildGpxPath stage official", () => {
  const path = buildGpxPath("u1", 42, "stage", "official", 1, null);
  assert.ok(path.startsWith("u1/42/stages/1/official/"), `path=${path}`);
});

test("buildGpxPath stage custom", () => {
  const path = buildGpxPath("u1", 42, "stage", "custom", 1, null);
  assert.ok(path.startsWith("u1/42/stages/1/custom/"), `path=${path}`);
});

test("defaultStageFormState retourne un état vide", () => {
  const state = defaultStageFormState();
  assert.equal(state.title, "");
  assert.equal(state.dayNumber, "");
  assert.equal(state.dist, "");
});

test("stageToFormValues mappe les champs", () => {
  const stage = {
    stage_number: 3, title: "Test", departure: "Paris", arrival: "Lyon",
    distance_km: 150, elevation_gain_m: 1200, notes: [{ text: "note1" }],
    metadata: { difficulty: "modéré", description: "Belle étape" },
  };
  const form = stageToFormValues(stage);
  assert.equal(form.dayNumber, "3");
  assert.equal(form.title, "Test");
  assert.equal(form.start, "Paris");
  assert.equal(form.dist, "150");
  assert.equal(form.difficulty, "modéré");
  assert.equal(form.notes, "note1");
});

test("buildStageRecord construit le record", () => {
  const form = { dayNumber: "1", title: "Étape 1", start: "A", end: "B", dist: "100", gain: "500", loss: "300", difficulty: "facile", description: "", notes: "", warning: "", mapEmbed: "", photoUrl: "", day: "", label: "", duration: "", accommodation: "" };
  const record = buildStageRecord(42, form, null);
  assert.equal(record.roadbook_id, 42);
  assert.equal(record.stage_number, 1);
  assert.equal(record.distance_km, 100);
  assert.equal(record.title, "Étape 1");
});

test("buildStageRecord inclut metadata", () => {
  const form = { dayNumber: "1", title: "", start: "", end: "", dist: "", gain: "", loss: "", difficulty: "dur", description: "Longue étape", notes: "", warning: "Prudence", mapEmbed: "", photoUrl: "", day: "", label: "", duration: "", accommodation: "" };
  const record = buildStageRecord(42, form, null);
  assert.deepEqual(record.metadata, { difficulty: "dur", description: "Longue étape", warning: "Prudence" });
});

test("buildPoiRecord construit le record POI", () => {
  const poiForm = { stage_id: 1, name: "Point", region: "Grenoble", link: "https://example.com/point", description: "Fontaine", editing: null };
  const record = buildPoiRecord(poiForm);
  assert.equal(record.name, "Point");
  assert.ok(!("poi_type" in record));
  assert.equal(record.region, "Grenoble");
  assert.equal(record.link_url, "https://example.com/point");
  assert.equal(record.lat, null);
});

test("buildPoiRecord génère le lien Maps seulement si le lien est vide", () => {
  const record = buildPoiRecord({ stage_id: 1, name: "Col du Galibier", region: "Valloire", link: "", description: "" });
  assert.equal(record.link_url, "https://www.google.com/maps/search/?api=1&query=Col%20du%20Galibier%2C%20Valloire");
});

test("buildVariantRecord construit le record variante", () => {
  const vf = { stage_id: 1, title: "Var1", type: "Raccourci", departure: "X", arrival: "Y", description: "Plus court", distance_km: "5", elevation_gain_m: "100", elevation_loss_m: "50", map_embed_url: "", notes: "", editing: null };
  const record = buildVariantRecord(vf);
  assert.equal(record.label, "Var1");
  assert.equal(record.distance_km, 5);
});

test("buildNotePayload ajoute une note", () => {
  const stage = { notes: [{ text: "Note 1" }] };
  const noteForm = { stage_id: 1, text: "Note 2", editing: null };
  const result = buildNotePayload(stage, noteForm);
  assert.equal(result.length, 2);
  assert.equal(result[1].text, "Note 2");
});

test("buildNotePayload modifie une note existante", () => {
  const stage = { notes: [{ text: "Ancien" }, { text: "Autre" }] };
  const noteForm = { stage_id: 1, text: "Modifié", editing: 0 };
  const result = buildNotePayload(stage, noteForm);
  assert.equal(result[0].text, "Modifié");
  assert.equal(result.length, 2);
});

test("removeNote supprime une note", () => {
  const stage = { notes: [{ text: "A" }, { text: "B" }, { text: "C" }] };
  const result = removeNote(stage, 1);
  assert.equal(result.length, 2);
  assert.equal(result[0].text, "A");
  assert.equal(result[1].text, "C");
});

test("buildPrimaryAccommodationUpdate conserve la note dans les métadonnées", () => {
  const update = buildPrimaryAccommodationUpdate(
    { metadata: { difficulty: "facile" } },
    { name: "Camping", url: "https://example.com", type: "camping", note: "Arriver avant 19 h" },
  );
  assert.equal(update.accommodation_name, "Camping");
  assert.equal(update.accommodation_type, "camping");
  assert.equal(update.metadata.accommodationNote, "Arriver avant 19 h");
  assert.equal(update.metadata.difficulty, "facile");
});

test("buildAlternativeAccommodationUpdate ajoute puis modifie une alternative", () => {
  const added = buildAlternativeAccommodationUpdate(
    { alternatives: [] },
    { name: "Gîte", note: "Cuisine disponible" },
  );
  assert.equal(added.alternatives.length, 1);
  assert.equal(added.alternatives[0].note, "Cuisine disponible");
  const edited = buildAlternativeAccommodationUpdate(
    { alternatives: added.alternatives },
    { name: "Gîte rénové", note: "Ouvert" },
    0,
  );
  assert.equal(edited.alternatives[0].name, "Gîte rénové");
});

test("promouvoir une alternative échange le principal sans en créer deux", () => {
  const stage = {
    accommodation_name: "Principal",
    accommodation_url: "https://principal.example",
    metadata: { accommodationNote: "Note principale" },
    alternatives: [{ name: "Alternative", url: "https://alternative.example", note: "Note alternative" }],
  };
  const update = buildPromoteAlternativeUpdate(stage, 0);
  assert.equal(update.accommodation_name, "Alternative");
  assert.equal(update.metadata.accommodationNote, "Note alternative");
  assert.equal(update.alternatives.length, 1);
  assert.equal(update.alternatives[0].name, "Principal");
  assert.equal(update.alternatives[0].note, "Note principale");
});

test("rétrograder le principal le déplace dans les alternatives", () => {
  const update = buildDemotePrimaryUpdate({
    accommodation_name: "Principal",
    metadata: { accommodationNote: "Informations" },
    alternatives: [{ name: "Autre" }],
  });
  assert.equal(update.accommodation_name, null);
  assert.ok(!("accommodationNote" in update.metadata));
  assert.equal(update.alternatives.length, 2);
  assert.equal(update.alternatives[1].name, "Principal");
  assert.equal(update.alternatives[1].note, "Informations");
});

test("groupByStageId groupe les lignes par stage_id", () => {
  const rows = [{ stage_id: 1, name: "A" }, { stage_id: 2, name: "B" }, { stage_id: 1, name: "C" }];
  const map = groupByStageId(rows);
  assert.equal(map[1].length, 2);
  assert.equal(map[2].length, 1);
});

test("validateStageForm rejette sans dayNumber", () => {
  const form = { dayNumber: "" };
  const errors = validateStageForm(form);
  assert.ok(errors.length > 0);
});

test("validateStageForm accepte avec dayNumber", () => {
  const form = { dayNumber: "3" };
  const errors = validateStageForm(form);
  assert.equal(errors.length, 0);
});

console.log("=== 2. Mutations ===");

test("buildOfficialMeta avec valeurs", () => {
  const meta = buildOfficialMeta({ officialDist: "1500", officialGain: "12000", officialLoss: "8000", officialGpx: "url", officialMap: "map" });
  assert.equal(meta.distance, 1500);
  assert.equal(meta.elevationGain, 12000);
  assert.equal(meta.gpx, "url");
});

test("buildOfficialMeta avec chaînes vides", () => {
  const meta = buildOfficialMeta({ officialDist: "", officialGain: "", officialLoss: "", officialGpx: "", officialMap: "" });
  assert.equal(meta.distance, null);
  assert.equal(meta.gpx, null);
});

test("buildStagesTotalMeta avec valeurs", () => {
  const meta = buildStagesTotalMeta({ traceDist: "200", traceGain: "3000", traceLoss: "2500", traceGpx: "gpx", traceMap: "map" });
  assert.equal(meta.distance, 200);
  assert.equal(meta.elevationGain, 3000);
});

test("buildTraceUpdateFields", () => {
  const fields = buildTraceUpdateFields({ traceDist: "100.5", traceGain: "800", traceLoss: "600" });
  assert.equal(fields.distance_km, 100.5);
  assert.equal(fields.elevation_gain_m, 800);
  assert.equal(fields.elevation_loss_m, 600);
});

test("calculateTotals additionne les étapes", () => {
  const stages = [
    { distance_km: 100, elevation_gain_m: 1000, elevation_loss_m: 500 },
    { distance_km: 50, elevation_gain_m: 600, elevation_loss_m: 300 },
  ];
  const t = calculateTotals(stages);
  assert.equal(t.totalDist, 150);
  assert.equal(t.totalGain, 1600);
  assert.equal(t.totalLoss, 800);
});

test("calculateTotals ignore les nulls", () => {
  const stages = [
    { distance_km: 100, elevation_gain_m: null, elevation_loss_m: null },
    { distance_km: null, elevation_gain_m: 500, elevation_loss_m: 200 },
  ];
  const t = calculateTotals(stages);
  assert.equal(t.totalDist, 100);
  assert.equal(t.totalGain, 500);
  assert.equal(t.hasLoss, true);
  assert.equal(t.totalLoss, 200);
});

test("calculateTotals retourne null si aucune donnée", () => {
  const stages = [{ distance_km: null, elevation_gain_m: null, elevation_loss_m: null }];
  const t = calculateTotals(stages);
  assert.equal(t.totalDist, null);
  assert.equal(t.hasDist, false);
});

test("formatTotalsSummary", () => {
  const totaux = { hasDist: true, hasGain: true, hasLoss: true, totalDist: 150, totalGain: 1000, totalLoss: 500 };
  const summary = formatTotalsSummary([{}, {}], totaux);
  assert.ok(summary.join(" ").includes("150.0"));
});

test("buildTotalsUpdateFields", () => {
  const fields = buildTotalsUpdateFields({ hasDist: true, totalDist: 120, hasGain: false, totalGain: null, hasLoss: true, totalLoss: 400 });
  assert.deepEqual(fields, { distance_km: 120, elevation_loss_m: 400 });
});

test("buildGpxStageUpdate", () => {
  const metrics = { distanceKm: 42.5, elevationGainM: 800, elevationLossM: 400 };
  const update = buildGpxStageUpdate(metrics, "3 h 30");
  assert.equal(update.distance_km, 42.5);
  assert.equal(update.elevation_gain_m, 800);
  assert.equal(update.duration, "3 h 30");
});

test("buildGpxStageUpdate ignore distance nulle", () => {
  const metrics = { distanceKm: 0, elevationGainM: null, elevationLossM: null };
  const update = buildGpxStageUpdate(metrics, null);
  assert.deepEqual(update, {});
});

test("buildEnrichPoiUpdate", () => {
  const found = { description: "Beau lac", coordinates: { lat: 45.5, lng: 6.5 }, image: "photo.jpg", url: "https://example.com" };
  const update = buildEnrichPoiUpdate(found);
  assert.equal(update.description, "Beau lac");
  assert.equal(update.lat, 45.5);
  assert.equal(update.photo_url, "photo.jpg");
});

test("buildEnrichPoiUpdate sans données", () => {
  const found = { description: null, coordinates: null, image: null, url: null };
  const update = buildEnrichPoiUpdate(found);
  assert.deepEqual(update, {});
});

test("buildEnrichAccommodationUpdate", () => {
  const found = { name: "Hôtel", image: "hotel.jpg" };
  const update = buildEnrichAccommodationUpdate(found);
  assert.equal(update.accommodation_name, "Hôtel");
  assert.equal(update.accommodation_photo, "hotel.jpg");
});

test("buildExistingFieldsList", () => {
  const stage = { distance_km: 100, elevation_gain_m: 500, duration: "4h" };
  const list = buildExistingFieldsList(stage);
  assert.ok(list.some(s => s.includes("100")));
  assert.ok(list.some(s => s.includes("500")));
  assert.equal(list.length, 3);
});

test("buildDuplicateSlug", () => {
  const slug = buildDuplicateSlug("mon-roadbook");
  assert.ok(slug.startsWith("mon-roadbook-copie-"));
});

test("buildDuplicateRoadbookInsert", () => {
  const rb = { title: "Original", description: "Desc", slug: "original" };
  const insert = buildDuplicateRoadbookInsert(rb, "slug-copie", "user1");
  assert.equal(insert.title, "Original (copie)");
  assert.equal(insert.owner_id, "user1");
  assert.equal(insert.is_public, false);
});

test("buildDuplicateStageInsert", () => {
  const stage = { stage_number: 1, title: "Stage", departure: "A", notes: [] };
  const insert = buildDuplicateStageInsert(stage, 99);
  assert.equal(insert.roadbook_id, 99);
  assert.equal(insert.stage_number, 1);
  assert.equal(insert.gpx_url, null);
});

test("buildDuplicatePoiInsert", () => {
  const poi = { name: "Lac", lat: 45, lng: 6, sort_order: 1 };
  const insert = buildDuplicatePoiInsert(poi, 55);
  assert.equal(insert.stage_id, 55);
  assert.equal(insert.name, "Lac");
  assert.equal(insert.photo_url, null);
});

test("buildDuplicateVariantInsert", () => {
  const v = { label: "Var1", distance_km: 5, metadata: {} };
  const insert = buildDuplicateVariantInsert(v, 55);
  assert.equal(insert.stage_id, 55);
  assert.equal(insert.label, "Var1");
  assert.equal(insert.gpx_url, null);
});

test("buildGpxConfirmMessage avec valeurs existantes", () => {
  const stage = { distance_km: 10 };
  const metrics = { distanceKm: 12.5, elevationGainM: 300, elevationLossM: 100 };
  const msg = buildGpxConfirmMessage(stage, metrics, "1 h 30");
  assert.ok(msg.includes("distance"));
  assert.ok(msg.includes("12.5"));
});

test("buildGpxConfirmMessage sans valeurs existantes", () => {
  const stage = {};
  const metrics = { distanceKm: 5, elevationGainM: null, elevationLossM: null };
  const msg = buildGpxConfirmMessage(stage, metrics, null);
  assert.ok(msg.includes("Aucune valeur existante"));
});

const total = passed + failed;
console.log(`\n=== Résultat ===`);
console.log(`\n  ${passed} OK, ${failed} echec(s)`);
if (failed > 0) process.exit(1);
else console.log(`\n✅ Tests Sprint 20B réussis.`);
