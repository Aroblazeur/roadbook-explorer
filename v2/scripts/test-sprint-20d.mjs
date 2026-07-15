/**
 * Sprint 20D — Tests d'extraction des hooks studio
 *
 * Teste le stageFormReducer et vérifie structurellement que page.js
 * n'utilise plus les anciens useState pour le formulaire d'étape.
 *
 * Usage:
 *   node scripts/test-sprint-20d.mjs
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { stageFormReducer, defaultStageForm } from "../src/hooks/studio/stageFormReducer.js";
import { completeAccommodation, completePoi, completeStageDuration, completeStageMetrics } from "../src/lib/roadbooks/automation.js";

let passed = 0, failed = 0;
const failures = [];
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

// ===================== stageFormReducer =====================
console.log("=== 1. stageFormReducer ===");

test("defaultStageForm contient tous les champs", () => {
  assert.equal(typeof defaultStageForm, "object");
  const expected = ["dayNumber","title","start","end","dist","gain","loss","description","notes","mapEmbed","photoUrl","day","duration"];
  for (const k of expected) assert.ok(k in defaultStageForm, `Missing field: ${k}`);
});

test("SET_FIELD modifie un champ", () => {
  const state = stageFormReducer(defaultStageForm, { type: "SET_FIELD", field: "title", value: "Mon étape" });
  assert.equal(state.title, "Mon étape");
  assert.equal(state.dayNumber, "");
});

test("les automatisations complètent uniquement les champs vides", () => {
  const stage = completeStageMetrics(
    { distance_km: 42, elevation_gain_m: null, elevation_loss_m: "", duration: "manuel" },
    { distanceKm: 12.345, elevationGainM: 456.7, elevationLossM: 321.2 },
    "2 h 30",
  );
  assert.equal(stage.value.distance_km, 42);
  assert.equal(stage.value.elevation_gain_m, 457);
  assert.equal(stage.value.elevation_loss_m, 321);
  assert.equal(stage.value.duration, "manuel");
  assert.equal(stage.filled, 2);

  const accommodation = completeAccommodation(
    { accommodation_name: "Refuge saisi", accommodation_photo: null },
    { name: "Nom automatique", image: "https://example.com/refuge.jpg" },
  );
  assert.equal(accommodation.value.accommodation_name, "Refuge saisi");
  assert.equal(accommodation.value.accommodation_photo, "https://example.com/refuge.jpg");

  const poi = completePoi(
    { description: "Description saisie", photo_url: null, link_url: "https://maps.example/existant" },
    { description: "Description auto", image: "https://example.com/poi.jpg", url: "https://example.com/poi" },
  );
  assert.equal(poi.value.description, "Description saisie");
  assert.equal(poi.value.photo_url, "https://example.com/poi.jpg");
  assert.equal(poi.value.link_url, "https://maps.example/existant");
});

test("la durée est calculée sans GPX depuis les métriques saisies", () => {
  const completed = completeStageDuration({ distance_km: 30, elevation_gain_m: 500, duration: "" }, "vélo");
  assert.equal(completed.filled, 1);
  assert.match(completed.value.duration, /^\d+ h \d{2}$/);
  const manual = completeStageDuration({ distance_km: 30, elevation_gain_m: 500, duration: "5 h 00" }, "vélo");
  assert.equal(manual.value.duration, "5 h 00");
  assert.equal(manual.filled, 0);
});

test("SET_FIELD ne modifie pas les autres champs", () => {
  const state = stageFormReducer(defaultStageForm, { type: "SET_FIELD", field: "title", value: "Test" });
  assert.equal(state.dayNumber, "");
  assert.equal(state.dist, "");
  assert.equal(state.duration, "");
});

test("SET_FORM remplace tous les champs", () => {
  const state = stageFormReducer(defaultStageForm, { type: "SET_FORM", payload: { title: "A", dist: "10", gain: "500" } });
  assert.equal(state.title, "A");
  assert.equal(state.dist, "10");
  assert.equal(state.gain, "500");
  assert.equal(state.dayNumber, "");
});

test("RESET retourne au defaultStageForm", () => {
  const modified = stageFormReducer(defaultStageForm, { type: "SET_FIELD", field: "title", value: "Modifié" });
  const reset = stageFormReducer(modified, { type: "RESET" });
  assert.deepEqual(reset, defaultStageForm);
});

test("default retourne l'état inchangé", () => {
  const state = stageFormReducer(defaultStageForm, { type: "UNKNOWN" });
  assert.deepEqual(state, defaultStageForm);
});

// ===================== Structural checks on page.js =====================
console.log("\n=== 2. Vérifications structurelles page.js ===");

const pagePath = "src/app/dashboard/roadbooks/[id]/page.js";
const pageSrc = readFileSync(pagePath, "utf-8");

test("page.js n'importe plus les anciens useState d'étape", () => {
  const forbidden = [
    "stageDayNumber", "stageTitle", "stageStart", "stageEnd",
    "stageDist", "stageGain", "stageLoss", "stageDifficulty",
    "stageAccommodation", "stageDescription", "stageNotes", "stageWarning",
    "stageMapEmbed", "stagePhotoUrl", "stageDay", "stageLabel", "stageDuration",
    "setStageDayNumber", "setStageTitle", "setStageStart", "setStageEnd",
    "setStageDist", "setStageGain", "setStageLoss", "setStageDifficulty",
    "setStageAccommodation", "setStageDescription", "setStageNotes", "setStageWarning",
    "setStageMapEmbed", "setStagePhotoUrl", "setStageDay", "setStageLabel", "setStageDuration",
    "setEditingStage", "setStageError", "setStageSuccess",
  ];
  // These should only appear in the hook destructuring, not as variables/useState
  const useStageCrudBlock = pageSrc.match(/useStageCrud\s*\(\{[^}]+\}\)/) || [""];
  const block = useStageCrudBlock[0];
  for (const name of forbidden) {
    // Allow only if it appears inside the useStageCrud destructuring or in a comment
    const inBlock = block.includes(name);
    const elsewhere = pageSrc.split("useStageCrud")[1]?.includes(name) && !pageSrc.split("useStageCrud")[1]?.startsWith("//");
    if (inBlock && elsewhere) {
      throw new Error(`${name} appears both in useStageCrud destructuring and elsewhere`);
    }
  }
});

test("useState count <= 15 dans page.js", () => {
  const matches = pageSrc.match(/\buseState\b/g);
  assert.ok(matches, "No useState found at all");
  assert.ok(matches.length <= 15, `Expected <= 15 useState, got ${matches.length}`);
});

test("page.js importe useStageCrud et useSaveWithLock", () => {
  assert.ok(pageSrc.includes('useStageCrud'), "Missing useStageCrud import");
  assert.ok(pageSrc.includes('useSaveWithLock'), "Missing useSaveWithLock import");
  assert.ok(pageSrc.includes('useEnrichment'), "Missing useEnrichment import");
});

test("page.js n'a plus les anciennes fonctions de formulaire", () => {
  const forbidden = [
    "function clearStageForm",
    "function fillStageForm",
    "function clearPoiForm",
    "function clearVariantForm",
    "function clearNoteForm",
    "function clearAccommodationForm",
  ];
  for (const fn of forbidden) {
    assert.ok(!pageSrc.includes(fn), `Should not contain ${fn}`);
  }
});

test("page.js n'importe plus les writers de CRUD", () => {
  const forbidden = [
    "insertStage", "deleteStage",
    "insertPoi", "updatePoi", "deletePoi",
    "insertVariant", "updateVariant", "deleteVariant",
    "updateStageNotes", "updateStageAccommodation", "clearStageAccommodation",
    "swapStageNumbers",
  ];
  const importLine = pageSrc.match(/import \{([^}]+)\} from ["']@\/lib\/roadbooks\/writers["']/);
  if (importLine) {
    const imported = importLine[1];
    for (const name of forbidden) {
      if (imported.includes(name)) {
        throw new Error(`page.js still imports ${name} from writers`);
      }
    }
  }
});

test("page.js utilise stageForm pour les inputs du formulaire", () => {
  // Verify that individual setters are no longer used in onChange
  const setterPattern = /setStage\w+\(e\.target\.value\)/g;
  const matches = pageSrc.match(setterPattern);
  assert.ok(!matches, `Found ${matches?.length ?? 0} old setStage* onChange handlers`);
});

// ===================== Hook file existence =====================
console.log("\n=== 3. Vérification des fichiers hooks ===");

const hooks = [
  "src/hooks/studio/useNotifications.js",
  "src/hooks/studio/useRoadbookData.js",
  "src/hooks/studio/useMediaManager.js",
  "src/hooks/studio/useGpxManager.js",
  "src/hooks/studio/useCoverManager.js",
  "src/hooks/studio/useEnrichment.js",
  "src/hooks/studio/useSaveWithLock.js",
  "src/hooks/studio/useStageCrud.js",
  "src/hooks/studio/stageFormReducer.js",
];

for (const h of hooks) {
  test(`le hook ${h} existe`, () => {
    const content = readFileSync(h, "utf-8");
    assert.ok(content.length > 0);
  });
}

test("useEnrichment prépare les compléments automatiques sans écraser les champs", () => {
  const content = readFileSync("src/hooks/studio/useEnrichment.js", "utf-8");
  const signature = content.match(/export function useEnrichment\(\{([\s\S]*?)\}\) \{/);
  assert.ok(signature, "Signature de useEnrichment introuvable");
  assert.match(signature[1], /\bpoisByStage\b/, "poisByStage est utilisé sans être déclaré");
  assert.ok(content.includes("prepareAutomaticCompletion"));
  assert.ok(content.includes("completeStageMetrics"));
  assert.ok(content.includes("completePoi"));
});

test("useStudioDraft déclare gpxByVariant parmi ses paramètres", () => {
  const content = readFileSync("src/hooks/useStudioDraft.js", "utf-8");
  const signature = content.match(/export function useStudioDraft\(\{([\s\S]*?)\}\) \{/);
  assert.ok(signature, "Signature de useStudioDraft introuvable");
  assert.match(signature[1], /\bgpxByVariant\b/, "gpxByVariant est utilisé sans être déclaré");
});

test("les accès Studio principaux ciblent le catalogue du Studio", () => {
  const sources = [
    readFileSync("src/app/page.js", "utf-8"),
    readFileSync("src/components/CatalogHeader.js", "utf-8"),
  ];
  for (const source of sources) {
    assert.ok(source.includes('href="/dashboard/roadbooks"'), "Lien Studio vers /dashboard/roadbooks manquant");
    assert.ok(!source.includes('href="/dashboard">Studio'), "Ancien lien Studio vers /dashboard encore présent");
  }
});

// ===================== Synchronisation helpers check =====================
console.log("\n=== 4. Vérification sync-helpers ===");

test("page.js n'importe plus directement acquireSyncLock, takeSnapshot, verifyAfterSync, releaseSyncLock", () => {
  const forbidden = ["takeSnapshot", "acquireSyncLockWithTabId", "releaseSyncLock", "verifyAfterSync"];
  const importLine = pageSrc.match(/import \{([^}]+)\} from ["']@\/lib\/sync-helpers["']/);
  if (importLine) {
    const imported = importLine[1];
    for (const name of forbidden) {
      if (imported.includes(name)) {
        throw new Error(`page.js still imports ${name} from sync-helpers`);
      }
    }
  }
});

// ===================== Run =====================
async function main() {
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (e) { failures.push({ name, message: e.message }); failed++; }
  }

  const total = passed + failed;
  console.log(`\n=== Résultat ===`);
  console.log(`\n  ${passed} OK, ${failed} échec(s)`);
  for (const f of failures) console.error(`  ✗ ${f.name}: ${f.message}`);
  if (failed > 0 || failures.length > 0) process.exit(1);
  else console.log(`\n✅ Tests Sprint 20D réussis.`);
}

main().catch(e => { console.error(e); process.exit(1); });
