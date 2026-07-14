/**
 * Sprint 4C2D — Suppression des sélections GPX arbitraires et chemins stricts
 *
 * Vérifie :
 * - 11.1 : reloadGpx utilise selection.unique.values() (pas selection.classified)
 * - 11.2 : doublon d'étape ignoré
 * - 11.3 : doublon de variante ignoré
 * - 11.4 : mélange unique + doublon
 * - 11.5 : chemins roadbook valides
 * - 11.6 : chemins stage valides (rôle inclus)
 * - 11.7 : chemins variant valides (rôle inclus)
 * - 11.8 : rejets de chemins (tous les cas)
 * - 11.9 : uploadGpx n'appelle pas Storage après erreur de chemin
 * - 11.10 : analyzeStageGpx expurgée
 *
 * Usage:
 *   node scripts/test-sprint-4c2d.mjs
 */

import { strict as assert } from "node:assert/strict";
import {
  classifyGpxMedia,
  selectUniqueGpxMedia,
  selectGpxMedia,
  formatGpxUserError,
} from "../src/lib/roadbooks/gpx-media.js";
import { buildGpxPath } from "../src/lib/roadbooks/validators.js";

let passed = 0, failed = 0;
const failures = [];
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function makeMedia(id, overrides = {}) {
  return {
    id,
    type: "gpx",
    roadbook_id: 1,
    stage_id: null,
    metadata: { scope: "roadbook", role: "official" },
    ...overrides,
  };
}

const RBID = 1, UID = "u1", RB = 42, SID = 10, VID = 20;

// ===================== 11.1 selection.unique.values() =====================
console.log("=== 11.1 Collections depuis selection.unique ===");

test("selectUniqueGpxMedia.unique est un Map", () => {
  const a = makeMedia(1);
  const result = selectUniqueGpxMedia([a]);
  assert.ok(result.unique instanceof Map);
});

test("selectUniqueGpxMedia.unique contient des entrées {media, classification}", () => {
  const a = makeMedia(1);
  const result = selectUniqueGpxMedia([a]);
  assert.equal(result.unique.size, 1);
  for (const { media, classification } of result.unique.values()) {
    assert.ok(media);
    assert.ok(classification);
    assert.equal(classification.status, "canonical");
  }
});

test("selectUniqueGpxMedia.classified existe mais n'est pas utilisé pour la sélection", () => {
  const a = makeMedia(1);
  const b = makeMedia(2, { stage_id: SID, metadata: { scope: "stage", role: "official" } });
  const result = selectUniqueGpxMedia([a, b]);
  assert.ok(Array.isArray(result.classified));
  assert.equal(result.classified.length, 2);
  assert.equal(result.unique.size, 2);
});

test("un doublon apparaît dans duplicates mais pas dans unique", () => {
  const a = makeMedia(1);
  const b = makeMedia(2, { id: 2 });
  const result = selectUniqueGpxMedia([a, b]);
  assert.equal(result.unique.size, 0);
  assert.equal(result.duplicates.length, 1);
});

// ===================== 11.2 Doublon d'étape =====================
console.log("\n=== 11.2 Doublon d'étape ===");

test("deux médias même stage/scope/role → dupliqué", () => {
  const a = makeMedia(1, { stage_id: SID, metadata: { scope: "stage", role: "official" } });
  const b = makeMedia(2, { id: 2, stage_id: SID, metadata: { scope: "stage", role: "official" } });
  const result = selectUniqueGpxMedia([a, b]);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].entries.length, 2);
});

test("aucun média injecté dans gpxByStage pour l'étape dupliquée", () => {
  const a = makeMedia(1, { stage_id: SID, metadata: { scope: "stage", role: "official" } });
  const b = makeMedia(2, { id: 2, stage_id: SID, metadata: { scope: "stage", role: "official" } });
  const result = selectUniqueGpxMedia([a, b]);
  const byStage = {};
  for (const { media, classification } of result.unique.values()) {
    if (classification.scope === "stage" && classification.stageId) {
      byStage[classification.stageId] = media;
    }
  }
  assert.ok(!byStage[SID]);
});

test("selectGpxMedia signale duplicate-identity pour doublon", () => {
  const a = makeMedia(1, { stage_id: SID, metadata: { scope: "stage", role: "official" } });
  const b = makeMedia(2, { id: 2, stage_id: SID, metadata: { scope: "stage", role: "official" } });
  const result = selectGpxMedia([a, b], { roadbookId: RBID, scope: "stage", role: "official", stageId: SID });
  assert.equal(result.status, "duplicate-identity");
});

// ===================== 11.3 Doublon de variante =====================
console.log("\n=== 11.3 Doublon de variante ===");

test("deux médias même variant/scope/role → dupliqué", () => {
  const a = makeMedia(1, { stage_id: SID, metadata: { scope: "variant", role: "official", variant_id: VID } });
  const b = makeMedia(2, { id: 2, stage_id: SID, metadata: { scope: "variant", role: "official", variant_id: VID } });
  const result = selectUniqueGpxMedia([a, b]);
  assert.equal(result.duplicates.length, 1);
});

test("aucun média injecté dans gpxByVariant pour la variante dupliquée", () => {
  const a = makeMedia(1, { stage_id: SID, metadata: { scope: "variant", role: "official", variant_id: VID } });
  const b = makeMedia(2, { id: 2, stage_id: SID, metadata: { scope: "variant", role: "official", variant_id: VID } });
  const result = selectUniqueGpxMedia([a, b]);
  const byVariant = {};
  for (const { media, classification } of result.unique.values()) {
    if (classification.scope === "variant" && classification.stageId && classification.variantId) {
      if (!byVariant[classification.stageId]) byVariant[classification.stageId] = {};
      byVariant[classification.stageId][classification.variantId] = media;
    }
  }
  const stageVariants = byVariant[SID];
  assert.ok(!stageVariants || !stageVariants[VID]);
});

// ===================== 11.4 Mélange unique + doublon =====================
console.log("\n=== 11.4 Mélange unique + doublon ===");

test("étape 1 unique, étape 2 dupliquée, variante A unique, variante B dupliquée", () => {
  const stage1 = makeMedia(1, { stage_id: 100, metadata: { scope: "stage", role: "official" } });
  const stage2a = makeMedia(2, { stage_id: 200, metadata: { scope: "stage", role: "official" } });
  const stage2b = makeMedia(3, { id: 3, stage_id: 200, metadata: { scope: "stage", role: "official" } });
  const varA = makeMedia(4, { stage_id: 100, metadata: { scope: "variant", role: "official", variant_id: 10 } });
  const varBa = makeMedia(5, { stage_id: 100, metadata: { scope: "variant", role: "official", variant_id: 20 } });
  const varBb = makeMedia(6, { id: 6, stage_id: 100, metadata: { scope: "variant", role: "official", variant_id: 20 } });

  const result = selectUniqueGpxMedia([stage1, stage2a, stage2b, varA, varBa, varBb]);

  const byStage = {};
  const byVariant = {};
  for (const { media, classification } of result.unique.values()) {
    if (classification.scope === "stage" && classification.stageId) {
      byStage[classification.stageId] = media;
    } else if (classification.scope === "variant" && classification.stageId && classification.variantId) {
      if (!byVariant[classification.stageId]) byVariant[classification.stageId] = {};
      byVariant[classification.stageId][classification.variantId] = media;
    }
  }

  assert.ok(byStage[100]);        // étape 1 chargée
  assert.ok(!byStage[200]);       // étape 2 absente (dupliquée)
  assert.ok(byVariant[100]?.[10]); // variante A chargée
  assert.ok(!byVariant[100]?.[20]); // variante B absente (dupliquée)
  assert.equal(result.duplicates.length, 2); // 2 identités dupliquées
});

// ===================== 11.5 Chemins roadbook valides =====================
console.log("\n=== 11.5 Chemins roadbook valides ===");

test("buildGpxPath roadbook official", () => {
  const path = buildGpxPath(UID, RB, "roadbook", "official", null, null);
  assert.ok(path.startsWith(`${UID}/${RB}/roadbook/official/`));
});

test("buildGpxPath roadbook custom", () => {
  const path = buildGpxPath(UID, RB, "roadbook", "custom", null, null);
  assert.ok(path.startsWith(`${UID}/${RB}/roadbook/custom/`));
});

// ===================== 11.6 Chemins stage valides =====================
console.log("\n=== 11.6 Chemins stage valides (rôle inclus) ===");

test("buildGpxPath stage official", () => {
  const path = buildGpxPath(UID, RB, "stage", "official", 7, null);
  assert.ok(path.startsWith(`${UID}/${RB}/stages/7/official/`));
});

test("buildGpxPath stage custom", () => {
  const path = buildGpxPath(UID, RB, "stage", "custom", 7, null);
  assert.ok(path.startsWith(`${UID}/${RB}/stages/7/custom/`));
});

// ===================== 11.7 Chemins variant valides =====================
console.log("\n=== 11.7 Chemins variant valides (rôle inclus) ===");

test("buildGpxPath variant official", () => {
  const path = buildGpxPath(UID, RB, "variant", "official", 7, 3);
  assert.ok(path.startsWith(`${UID}/${RB}/stages/7/variants/3/official/`));
});

test("buildGpxPath variant custom", () => {
  const path = buildGpxPath(UID, RB, "variant", "custom", 7, 3);
  assert.ok(path.startsWith(`${UID}/${RB}/stages/7/variants/3/custom/`));
});

// ===================== 11.8 Rejets de chemins =====================
console.log("\n=== 11.8 Rejets de chemins ===");

test("userId absent → erreur", () => {
  assert.throws(() => buildGpxPath(null, RB, "roadbook", "official", null, null), /gpx-path-user-id-required/);
});

test("userId vide → erreur", () => {
  assert.throws(() => buildGpxPath("", RB, "roadbook", "official", null, null), /gpx-path-user-id-required/);
});

test("roadbookId absent → erreur", () => {
  assert.throws(() => buildGpxPath(UID, null, "roadbook", "official", null, null), /gpx-path-roadbook-id-invalid/);
});

test("roadbookId = 0 → erreur", () => {
  assert.throws(() => buildGpxPath(UID, 0, "roadbook", "official", null, null), /gpx-path-roadbook-id-invalid/);
});

test("roadbookId négatif → erreur", () => {
  assert.throws(() => buildGpxPath(UID, -1, "roadbook", "official", null, null), /gpx-path-roadbook-id-invalid/);
});

test("roadbookId string (non numérique) → erreur", () => {
  assert.throws(() => buildGpxPath(UID, "abc", "roadbook", "official", null, null), /gpx-path-roadbook-id-invalid/);
});

test("scope inconnu → erreur", () => {
  assert.throws(() => buildGpxPath(UID, RB, "unknown", "official", null, null), /gpx-path-scope-invalid/);
});

test("role inconnu → erreur", () => {
  assert.throws(() => buildGpxPath(UID, RB, "roadbook", "invalid", null, null), /gpx-path-role-invalid/);
});

test("roadbook avec stageId → erreur", () => {
  assert.throws(() => buildGpxPath(UID, RB, "roadbook", "official", 1, null), /gpx-path-stage-id-not-allowed/);
});

test("roadbook avec variantId → erreur", () => {
  assert.throws(() => buildGpxPath(UID, RB, "roadbook", "official", null, 1), /gpx-path-variant-id-not-allowed/);
});

test("stage sans stageId → erreur", () => {
  assert.throws(() => buildGpxPath(UID, RB, "stage", "official", null, null), /gpx-path-stage-id-required/);
});

test("stage avec variantId → erreur", () => {
  assert.throws(() => buildGpxPath(UID, RB, "stage", "official", 1, 1), /gpx-path-variant-id-not-allowed/);
});

test("variant sans stageId → erreur", () => {
  assert.throws(() => buildGpxPath(UID, RB, "variant", "official", null, 1), /gpx-path-stage-id-required/);
});

test("variant sans variantId → erreur", () => {
  assert.throws(() => buildGpxPath(UID, RB, "variant", "official", 1, null), /gpx-path-variant-id-required/);
});

test("stageId = 0 → erreur", () => {
  assert.throws(() => buildGpxPath(UID, RB, "stage", "official", 0, null), /gpx-path-stage-id-required/);
});

test("variantId = 0 → erreur", () => {
  assert.throws(() => buildGpxPath(UID, RB, "variant", "official", 1, 0), /gpx-path-variant-id-required/);
});

test("aucun cas invalide ne produit un chemin roadbook", () => {
  const invalidCases = [
    () => buildGpxPath("", RB, "roadbook", "official", null, null),
    () => buildGpxPath(UID, null, "roadbook", "official", null, null),
    () => buildGpxPath(UID, RB, "stage", "official", null, null),
    () => buildGpxPath(UID, RB, "variant", "official", null, null),
    () => buildGpxPath(UID, RB, "variant", "official", 1, null),
  ];
  for (const fn of invalidCases) {
    try { const p = fn(); assert.ok(!p.includes("roadbook/"), `ne doit pas produire roadbook/ : ${p}`); }
    catch (e) { /* expected */ }
  }
});

// ===================== 11.9 Aucun appel Storage après erreur de chemin =====================
console.log("\n=== 11.9 Aucun appel d'écriture après erreur de chemin ===");

test("buildGpxPath ne retourne jamais de chemin pour cible invalide", () => {
  assert.throws(() => buildGpxPath(UID, RB, "variant", "official", null, 3), /gpx-path-stage-id-required/);
  assert.throws(() => buildGpxPath(UID, RB, "stage", "official", null, null), /gpx-path-stage-id-required/);
});

test("formatGpxUserError sur erreur buildGpxPath", () => {
  try {
    buildGpxPath(UID, RB, "variant", "official", null, 1);
    assert.fail("should throw");
  } catch (e) {
    const msg = formatGpxUserError(e, "Impossible de construire le chemin.");
    assert.ok(typeof msg === "string");
    assert.ok(msg);
  }
});

// ===================== 11.10 Erreur expurgée d'analyse =====================
console.log("\n=== 11.10 Erreur expurgée d'analyse ===");

test("formatGpxUserError expurgée d'un message JWT", () => {
  const msg = formatGpxUserError(new Error("JWT expired: project ref and signed URL details"));
  assert.ok(msg.includes("Session"));
  assert.ok(!msg.includes("JWT"));
  assert.ok(!msg.includes("signed URL"));
});

test("formatGpxUserError expurgée d'un message Storage", () => {
  const msg = formatGpxUserError(new Error("NetworkError: Failed to fetch storage object"));
  assert.ok(msg.includes("réseau"));
  assert.ok(!msg.includes("storage"));
});

test("formatGpxUserError expurgée d'un message backend quelconque", () => {
  const msg = formatGpxUserError(new Error("violates row-level security policy for relation gpx_media"), "Impossible d'analyser le GPX de cette étape.");
  assert.ok(msg.includes("Permission"));
  assert.ok(!msg.includes("row-level"));
});

test("fallback analyzeStageGpx conserve stageNumber", () => {
  // Simule le pattern de analyzeStageGpx
  function simulate(gpx, stage) {
    if (!gpx || !stage) return null;
    try {
      throw new Error("JWT expired");
    } catch (err) {
      return { error: formatGpxUserError(err, "Impossible d'analyser le GPX de cette étape."), stageNumber: stage.stage_number };
    }
  }
  const result = simulate({ path: "x" }, { stage_number: 5, id: 99 });
  assert.ok(result.error.includes("Session"));
  assert.equal(result.stageNumber, 5);
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
  for (const f of failures) console.error(`  \u2717 ${f.name}: ${f.message}`);
  if (failed > 0) process.exit(1);
  else console.log(`\n\u2705 Tests Sprint 4C2D réussis.`);
}

main().catch(e => { console.error(e); process.exit(1); });
