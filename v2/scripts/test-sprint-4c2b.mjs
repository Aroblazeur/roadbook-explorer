/**
 * Sprint 4C2B — Canonicalisation des écritures GPX du Studio V2
 *
 * Vérifie :
 * - buildCanonicalGpxMediaInput() construit et valide correctement
 * - les rejets pour scopes/roles/ids invalides
 * - le nettoyage des métadonnées historiques
 * - la non-régression de classifyGpxMedia existante
 * - la protection du média ambigu (id=41)
 *
 * Usage:
 *   node scripts/test-sprint-4c2b.mjs
 */

import { strict as assert } from "node:assert/strict";
import {
  buildCanonicalGpxMediaInput,
  buildGpxBusinessIdentity,
  classifyGpxMedia,
  isExplorerUsableGpx,
} from "../src/lib/roadbooks/gpx-media.js";

let passed = 0, failed = 0;
const failures = [];
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

// ===================== 6.1 Construction roadbook =====================
console.log("=== 6.1 Construction canonique roadbook ===");

test("GPX officiel roadbook", () => {
  const result = buildCanonicalGpxMediaInput({ roadbookId: 1, scope: "roadbook", role: "official" });
  assert.ok(result.ok);
  assert.deepEqual(result.record, {
    type: "gpx",
    roadbook_id: 1,
    stage_id: null,
    metadata: { scope: "roadbook", role: "official" },
  });
});

test("GPX custom roadbook (identité différente)", () => {
  const result = buildCanonicalGpxMediaInput({ roadbookId: 1, scope: "roadbook", role: "custom" });
  assert.ok(result.ok);
  assert.equal(result.record.metadata.role, "custom");
});

// ===================== 6.2 Construction étape =====================
console.log("\n=== 6.2 Construction canonique étape ===");

test("GPX officiel étape valide", () => {
  const result = buildCanonicalGpxMediaInput({ roadbookId: 1, stageId: 2, scope: "stage", role: "official" });
  assert.ok(result.ok);
  assert.equal(result.record.stage_id, 2);
  assert.equal(result.record.metadata.scope, "stage");
  assert.equal(result.record.metadata.role, "official");
  assert.equal(result.record.metadata.variant_id, undefined);
});

test("refuse stageId absent pour scope stage", () => {
  const result = buildCanonicalGpxMediaInput({ roadbookId: 1, scope: "stage", role: "official" });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes("stageId requis")));
});

// ===================== 6.3 Construction variante =====================
console.log("\n=== 6.3 Construction canonique variante ===");

test("GPX variante valide", () => {
  const result = buildCanonicalGpxMediaInput({ roadbookId: 1, stageId: 2, variantId: 3, scope: "variant", role: "official" });
  assert.ok(result.ok);
  assert.equal(result.record.stage_id, 2);
  assert.equal(result.record.metadata.scope, "variant");
  assert.equal(result.record.metadata.role, "official");
  assert.equal(result.record.metadata.variant_id, 3);
});

test("refuse stageId absent pour scope variant", () => {
  const result = buildCanonicalGpxMediaInput({ roadbookId: 1, variantId: 3, scope: "variant", role: "official" });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes("stageId requis")));
});

test("refuse variantId absent pour scope variant", () => {
  const result = buildCanonicalGpxMediaInput({ roadbookId: 1, stageId: 2, scope: "variant", role: "official" });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes("variantId requis")));
});

test("refuse variantId = 0", () => {
  const result = buildCanonicalGpxMediaInput({ roadbookId: 1, stageId: 2, variantId: 0, scope: "variant", role: "official" });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes("variantId requis")));
});

test("refuse variantId négatif", () => {
  const result = buildCanonicalGpxMediaInput({ roadbookId: 1, stageId: 2, variantId: -5, scope: "variant", role: "official" });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes("variantId requis")));
});

// ===================== 6.4 Rejets =====================
console.log("\n=== 6.4 Rejets ===");

test("refuse scope inconnu", () => {
  const result = buildCanonicalGpxMediaInput({ roadbookId: 1, scope: "journey", role: "official" });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes("scope inconnu")));
});

test("refuse role inconnu", () => {
  const result = buildCanonicalGpxMediaInput({ roadbookId: 1, scope: "roadbook", role: "unknown" });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes("role inconnu")));
});

test("refuse role legacy gpx-official", () => {
  const result = buildCanonicalGpxMediaInput({ roadbookId: 1, scope: "roadbook", role: "gpx-official" });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes("role inconnu")));
});

test("refuse role legacy gpx-stage", () => {
  const result = buildCanonicalGpxMediaInput({ roadbookId: 1, scope: "roadbook", role: "gpx-stage" });
  assert.ok(!result.ok);
});

test("refuse role legacy gpx-variant", () => {
  const result = buildCanonicalGpxMediaInput({ roadbookId: 1, scope: "roadbook", role: "gpx-variant" });
  assert.ok(!result.ok);
});

test("refuse role legacy gpx-total", () => {
  const result = buildCanonicalGpxMediaInput({ roadbookId: 1, scope: "roadbook", role: "gpx-total" });
  assert.ok(!result.ok);
});

test("refuse roadbookId absent", () => {
  const result = buildCanonicalGpxMediaInput({ scope: "roadbook", role: "official" });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes("roadbookId")));
});

test("refuse roadbookId négatif", () => {
  const result = buildCanonicalGpxMediaInput({ roadbookId: -1, scope: "roadbook", role: "official" });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes("roadbookId")));
});

test("refuse stageId présent pour scope roadbook", () => {
  const result = buildCanonicalGpxMediaInput({ roadbookId: 1, stageId: 2, scope: "roadbook", role: "official" });
  assert.ok(!result.ok);
  assert.ok(result.errors.some(e => e.includes("stageId interdit")));
});

// ===================== 6.5 Nettoyage métadonnées historiques =====================
console.log("\n=== 6.5 Nettoyage des métadonnées historiques ===");

test("nettoie gpx_role legacy et variant_id hors scope", () => {
  const result = buildCanonicalGpxMediaInput({
    roadbookId: 1, stageId: 2, scope: "stage", role: "official",
    existingMetadata: {
      gpx_role: "official",
      role: "gpx-stage",
      scope: "roadbook",
      variant_id: 99,
      caption: "GPX principal",
    },
  });
  assert.ok(result.ok);
  const m = result.record.metadata;
  assert.equal(m.scope, "stage");
  assert.equal(m.role, "official");
  assert.equal(m.variant_id, undefined);
  assert.equal(m.gpx_role, undefined);
  assert.equal(m.caption, "GPX principal");
});

test("préserve uniquement les champs autorisés depuis existingMetadata", () => {
  const result = buildCanonicalGpxMediaInput({
    roadbookId: 1, scope: "roadbook", role: "official",
    existingMetadata: {
      original_name: "test.gpx",
      original_size: 1234,
      caption: "Mon GPX",
      description: "Un beau tracé",
      gpx_role: "official",
      role: "gpx-total",
      source: "v1-import",
      imported_at: "2024-01-01",
      original_ref: "ref42",
    },
  });
  assert.ok(result.ok);
  const m = result.record.metadata;
  assert.equal(m.scope, "roadbook");
  assert.equal(m.role, "official");
  assert.equal(m.original_name, "test.gpx");
  assert.equal(m.original_size, 1234);
  assert.equal(m.caption, "Mon GPX");
  assert.equal(m.description, "Un beau tracé");
  assert.equal(m.gpx_role, undefined);
  assert.equal(m.source, undefined);
  assert.equal(m.imported_at, undefined);
  assert.equal(m.original_ref, undefined);
});

test("préserve variant_id pour scope variant", () => {
  const result = buildCanonicalGpxMediaInput({
    roadbookId: 1, stageId: 2, variantId: 3, scope: "variant", role: "official",
  });
  assert.ok(result.ok);
  assert.equal(result.record.metadata.variant_id, 3);
});

// ===================== 6.6 Non-régression classification =====================
console.log("\n=== 6.6 Non-régression de la classification ===");

function media(overrides = {}) {
  return { id: 1, type: "gpx", roadbook_id: 4, stage_id: null, bucket: "roadbook-gpx", path: "roadbooks/test/gpx/test.gpx", metadata: {}, ...overrides };
}

function canonical(scope, role, overrides = {}) {
  return media({ metadata: { scope, role }, ...overrides });
}

test("classifie roadbook/official canonique", () => {
  const r = classifyGpxMedia(canonical("roadbook", "official"));
  assert.equal(r.status, "canonical");
});

test("classifie roadbook/custom canonique", () => {
  const r = classifyGpxMedia(canonical("roadbook", "custom"));
  assert.equal(r.status, "canonical");
});

test("classifie stage/official canonique", () => {
  const r = classifyGpxMedia(canonical("stage", "official", { stage_id: 12 }));
  assert.equal(r.status, "canonical");
  assert.equal(r.stageId, 12);
});

test("classifie variant/official canonique", () => {
  const r = classifyGpxMedia(canonical("variant", "official", { stage_id: 12, metadata: { scope: "variant", role: "official", variant_id: 34 } }));
  assert.equal(r.status, "canonical");
  assert.equal(r.variantId, 34);
});

test("reconnaît gpx-official legacy", () => {
  const r = classifyGpxMedia(media({ metadata: { role: "gpx-official" } }));
  assert.deepEqual([r.status, r.scope, r.role, r.source], ["legacy-compatible", "roadbook", "official", "legacy-role"]);
});

test("reconnaît gpx-total legacy", () => {
  const r = classifyGpxMedia(media({ metadata: { role: "gpx-total" } }));
  assert.deepEqual([r.status, r.scope, r.role], ["legacy-compatible", "roadbook", "custom"]);
});

test("reconnaît gpx-stage legacy avec stage_id", () => {
  const r = classifyGpxMedia(media({ stage_id: 9, metadata: { role: "gpx-stage" } }));
  assert.deepEqual([r.status, r.scope, r.role, r.stageId], ["legacy-compatible", "stage", "official", 9]);
});

test("refuse gpx-stage legacy sans stage_id", () => {
  const r = classifyGpxMedia(media({ metadata: { role: "gpx-stage" } }));
  assert.equal(r.status, "invalid");
  assert.equal(r.reason, "stage-id-is-required");
});

test("reste compatible avec scope + gpx_role du Studio V2 existant", () => {
  const r = classifyGpxMedia(media({ stage_id: 7, metadata: { scope: "stage", gpx_role: "official" } }));
  assert.equal(r.status, "legacy-compatible");
  assert.equal(r.source, "legacy-gpx-role");
});

test("refuse un scope canonique inconnu", () => {
  const r = classifyGpxMedia(canonical("journey", "official"));
  assert.equal(r.status, "invalid");
  assert.equal(r.reason, "unknown-scope");
});

test("détecte une contradiction canonique et legacy", () => {
  const r = classifyGpxMedia(media({ stage_id: 3, metadata: { scope: "stage", role: "gpx-official" } }));
  assert.equal(r.status, "invalid");
  assert.equal(r.reason, "canonical-legacy-scope-contradiction");
});

test("détecte une contradiction role et gpx_role", () => {
  const r = classifyGpxMedia(media({ metadata: { scope: "roadbook", role: "official", gpx_role: "custom" } }));
  assert.equal(r.status, "invalid");
  assert.equal(r.reason, "canonical-role-contradiction");
});

test("refuse variant_id hors scope variant", () => {
  const r = classifyGpxMedia(canonical("stage", "official", { stage_id: 2, metadata: { scope: "stage", role: "official", variant_id: 5 } }));
  assert.equal(r.status, "invalid");
  assert.equal(r.reason, "variant-id-not-allowed-for-scope");
});

test("construit les trois identités métier", () => {
  const rb = classifyGpxMedia(canonical("roadbook", "official"));
  const st = classifyGpxMedia(canonical("stage", "official", { stage_id: 12 }));
  const va = classifyGpxMedia(canonical("variant", "official", { stage_id: 12, metadata: { scope: "variant", role: "official", variant_id: 34 } }));
  assert.equal(buildGpxBusinessIdentity(rb), "roadbook:4:roadbook:official");
  assert.equal(buildGpxBusinessIdentity(st), "roadbook:4:stage:12:official");
  assert.equal(buildGpxBusinessIdentity(va), "roadbook:4:stage:12:variant:34:official");
});

// ===================== 6.7 Protection média ambigu =====================
console.log("\n=== 6.7 Protection du média ambigu ===");

test("media.id=41 reste ambiguous avec legacy-variant-target-is-incomplete", () => {
  const row = media({ id: 41, metadata: { role: "gpx-variant" } });
  const classification = classifyGpxMedia(row);
  assert.equal(classification.status, "ambiguous");
  assert.equal(classification.reason, "legacy-variant-target-is-incomplete");
  assert.equal(isExplorerUsableGpx(classification), false);
});

test("buildCanonicalGpxMediaInput refuse de produire un record pour un variant sans stageId", () => {
  const result = buildCanonicalGpxMediaInput({ roadbookId: 1, scope: "variant", role: "official" });
  assert.ok(!result.ok);
});

test("buildCanonicalGpxMediaInput refuse de produire un record pour un variant sans variantId", () => {
  const result = buildCanonicalGpxMediaInput({ roadbookId: 1, stageId: 2, scope: "variant", role: "official" });
  assert.ok(!result.ok);
});

test("classifyGpxMedia ne peut pas être converti en entrée canonique sans stageId+variantId explicites", () => {
  const row = media({ id: 41, metadata: { role: "gpx-variant" } });
  const classification = classifyGpxMedia(row);
  // Tentative de construction canonique avec les mêmes infos — doit échouer car il manque stageId et variantId
  const result = buildCanonicalGpxMediaInput({
    roadbookId: classification.roadbookId,
    scope: classification.scope,
    role: classification.role,
  });
  assert.ok(!result.ok); // stageId et variantId manquants pour scope variant
});

// ===================== Vérification payload zone =====================
console.log("\n=== Vérification des payloads produits ===");

test("payload GPX officiel roadbook sans gpx-* role", () => {
  const result = buildCanonicalGpxMediaInput({ roadbookId: 1, scope: "roadbook", role: "official" });
  assert.ok(result.ok);
  assert.equal(result.record.metadata.role, "official");
  assert.ok(!result.record.metadata.role?.startsWith("gpx-"));
  assert.equal(result.record.stage_id, null);
});

test("payload GPX custom roadbook sans gpx-* role", () => {
  const result = buildCanonicalGpxMediaInput({ roadbookId: 1, scope: "roadbook", role: "custom" });
  assert.ok(result.ok);
  assert.equal(result.record.metadata.role, "custom");
  assert.ok(!result.record.metadata.role?.startsWith("gpx-"));
});

test("payload GPX étape avec stage_id et sans variant_id", () => {
  const result = buildCanonicalGpxMediaInput({ roadbookId: 1, stageId: 5, scope: "stage", role: "official" });
  assert.ok(result.ok);
  assert.equal(result.record.stage_id, 5);
  assert.equal(result.record.metadata.variant_id, undefined);
});

test("payload GPX variante avec stage_id, variant_id, scope=variant, role=official", () => {
  const result = buildCanonicalGpxMediaInput({ roadbookId: 1, stageId: 5, variantId: 10, scope: "variant", role: "official" });
  assert.ok(result.ok);
  assert.equal(result.record.stage_id, 5);
  assert.equal(result.record.metadata.variant_id, 10);
  assert.equal(result.record.metadata.scope, "variant");
  assert.equal(result.record.metadata.role, "official");
});

test("payload remplacement préserve caption mais pas gpx_role", () => {
  const result = buildCanonicalGpxMediaInput({
    roadbookId: 1, scope: "roadbook", role: "official",
    existingMetadata: { caption: "Mon GPX", gpx_role: "official", original_name: "old.gpx", original_size: 100 },
  });
  assert.ok(result.ok);
  assert.equal(result.record.metadata.caption, "Mon GPX");
  assert.equal(result.record.metadata.gpx_role, undefined);
  assert.equal(result.record.metadata.original_name, "old.gpx");
  assert.equal(result.record.metadata.original_size, 100);
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
  else console.log(`\n\u2705 Tests Sprint 4C2B réussis.`);
}

main().catch(e => { console.error(e); process.exit(1); });
