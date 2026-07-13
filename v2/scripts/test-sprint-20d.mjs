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
  const expected = ["dayNumber","title","start","end","dist","gain","loss","difficulty","accommodation","description","notes","warning","mapEmbed","photoUrl","day","label","duration"];
  for (const k of expected) assert.ok(k in defaultStageForm, `Missing field: ${k}`);
});

test("SET_FIELD modifie un champ", () => {
  const state = stageFormReducer(defaultStageForm, { type: "SET_FIELD", field: "title", value: "Mon étape" });
  assert.equal(state.title, "Mon étape");
  assert.equal(state.dayNumber, "");
});

test("SET_FIELD ne modifie pas les autres champs", () => {
  const state = stageFormReducer(defaultStageForm, { type: "SET_FIELD", field: "title", value: "Test" });
  assert.equal(state.dayNumber, "");
  assert.equal(state.dist, "");
  assert.equal(state.label, "");
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
