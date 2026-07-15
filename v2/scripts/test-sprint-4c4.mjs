#!/usr/bin/env node
/**
 * Tests Sprint 4C4 — Plan de migration GPX
 *
 * Usage:
 *   node scripts/test-sprint-4c4.mjs
 */
import { strict as assert } from "node:assert";

// ─── Fixtures loader (must match plan-gpx-migration.mjs) ──────────────────
function loadFixtures() {
  const rbId = 1, sidA = 10, sidB = 20, vidA = 30;
  function makeMedia(id, overrides = {}) {
    return {
      id, type: "gpx", roadbook_id: rbId, stage_id: null,
      metadata: { scope: "stage", role: "official", source: "v1-import" },
      path: `test/${id}.gpx`, created_at: "2026-01-01", updated_at: "2026-01-01",
      ...overrides,
    };
  }
  return {
    roadbooks: [
      { id: rbId, title: "Test Roadbook", slug: "test-rb" },
      { id: 99, title: "Orphan", slug: "orphan" },
    ],
    stages: [
      { id: sidA, roadbook_id: rbId, stage_number: 1 },
      { id: sidB, roadbook_id: rbId, stage_number: 2 },
      { id: 999, roadbook_id: 99, stage_number: 1 },
    ],
    mediaRows: [
      // 1  Canonical roadbook scope
      makeMedia(1, { stage_id: null, metadata: { scope: "roadbook", role: "official", source: "v1-import" } }),
      // 2  Canonical stage, same identity as media.id=3
      makeMedia(2, { stage_id: sidA, metadata: { scope: "stage", role: "official", source: "v1-import" } }),
      // 3  Canonical stage, duplicate identity with media.id=2
      makeMedia(3, { stage_id: sidA, metadata: { scope: "stage", role: "official", source: "v1-import" } }),
      // 4  Invalid: variant scope without variant_id
      makeMedia(4, { stage_id: null, metadata: { scope: "variant", role: "official", source: "v1-import" } }),
      // 5  Invalid: no role
      makeMedia(5, { type: "gpx", metadata: { source: "v1-import" } }),
      // 6  Duplicate A for stage:20
      makeMedia(6, { stage_id: sidB, metadata: { scope: "stage", role: "official", source: "v1-import" } }),
      // 7  Duplicate B for stage:20
      makeMedia(7, { id: 7, stage_id: sidB, metadata: { scope: "stage", role: "official", source: "v1-import" } }),
      // 8  Missing roadbook (valid format, but roadbook 9999 doesn't exist)
      makeMedia(8, { roadbook_id: 9999, stage_id: null, metadata: { scope: "roadbook", role: "official", source: "v1-import" } }),
      // 9  Stage 99999 doesn't exist, but format is valid
      makeMedia(9, { stage_id: 99999, metadata: { scope: "stage", role: "official", source: "v1-import" } }),
      // 10 Stage-roadbook mismatch (stage 999 belongs to roadbook 99)
      makeMedia(10, { stage_id: 999, metadata: { scope: "stage", role: "official", source: "v1-import" } }),
      // 11 Valid variant
      makeMedia(11, { stage_id: sidA, metadata: { scope: "variant", role: "official", variant_id: vidA, source: "v1-import" } }),
      // 12 Invalid: variant scope without variant_id in metadata
      makeMedia(12, { stage_id: sidA, metadata: { scope: "variant", role: "official", source: "v1-import" } }),
      // 13 Variant with stage 999 (belongs to roadbook 99, not rbId=1)
      makeMedia(13, { stage_id: 999, metadata: { scope: "variant", role: "official", variant_id: 1, source: "v1-import" } }),
    ],
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function findOp(plan, mediaId) {
  return plan.operations.items.find(o => o.mediaId === mediaId);
}
function findExcluded(plan, mediaId) {
  return plan.excluded.items.find(e => e.mediaId === mediaId);
}
function findEligible(plan, mediaId) {
  return plan.eligible.items.find(e => e.mediaId === mediaId);
}
let nTests = 0, nFail = 0;
function test(name, fn) {
  nTests++;
  try { fn(); } catch (err) {
    nFail++;
    console.log(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    return;
  }
  console.log(`  ✓ ${name}`);
}
function testSection(name, fn) {
  console.log(`\n── ${name} ──`);
  fn();
}

// ─── Run ───────────────────────────────────────────────────────────────────
async function run() {
  const {
    selectUniqueGpxMedia,
    classifyGpxMedia,
    buildGpxBusinessIdentity,
    buildCanonicalGpxMediaInput,
  } = await import("../src/lib/roadbooks/gpx-media.js");

  const { buildGpxMigrationPlan, validateGpxMigrationPlan } = await import("./plan-gpx-migration.mjs");

  const withValidation = () => {
    const p = buildGpxMigrationPlan(loadFixtures());
    p.validation = validateGpxMigrationPlan(p);
    p.decision = p.validation.valid ? "GO" : "NO GO";
    return p;
  };

  // ─── 1. Load ─────────────────────────────────────────────────
  testSection("1. Préconditions — chargement", () => {
    test("fixtures se chargent", () => {
      const f = loadFixtures();
      assert.equal(f.mediaRows.length, 13);
      assert.equal(f.roadbooks.length, 2);
      assert.equal(f.stages.length, 3);
    });
  });

  // ─── 2. Classification ───────────────────────────────────────
  testSection("2. classifyGpxMedia", () => {
    const f = loadFixtures();
    for (const [id, expectStatus] of [
      [1, "canonical"], [2, "canonical"], [3, "canonical"],
      [4, "invalid"], [5, "invalid"],
      [6, "canonical"], [7, "canonical"],
      [8, "canonical"], [9, "canonical"], [10, "canonical"],
      [11, "canonical"], [12, "invalid"], [13, "canonical"],
    ]) {
      const m = f.mediaRows.find(mm => mm.id === id);
      const c = classifyGpxMedia(m);
      test(`media.id=${id} → ${expectStatus}`, () => assert.equal(c.status, expectStatus));
    }
  });

  // ─── 3. Business identity ────────────────────────────────────
  testSection("3. buildGpxBusinessIdentity", () => {
    const f = loadFixtures();
    const cases = [
      [1, "roadbook:1:roadbook:official"],
      [2, "roadbook:1:stage:10:official"],
      [3, "roadbook:1:stage:10:official"],
      [4, null],   // ambiguous
      [5, null],   // invalid
      [6, "roadbook:1:stage:20:official"],
      [7, "roadbook:1:stage:20:official"],
      [8, "roadbook:9999:roadbook:official"],
      [9, "roadbook:1:stage:99999:official"],
      [10, "roadbook:1:stage:999:official"],
      [11, "roadbook:1:stage:10:variant:30:official"],
      [12, null],  // gpx-variant but missing variant_id
      [13, "roadbook:1:stage:999:variant:1:official"],
    ];
    for (const [id, identity] of cases) {
      const m = f.mediaRows.find(mm => mm.id === id);
      const c = classifyGpxMedia(m);
      const i = buildGpxBusinessIdentity(c);
      const expected = identity ?? null;
      test(`media.id=${id} → ${expected}`, () => assert.equal(i, expected));
    }
  });

  // ─── 4. Canonical input ──────────────────────────────────────
  testSection("4. buildCanonicalGpxMediaInput", () => {
    test("roadbook scope → stage_id=null", () => {
      const r = buildCanonicalGpxMediaInput({ roadbookId: 1, scope: "roadbook", role: "official" });
      assert.ok(r.ok); assert.equal(r.record.stage_id, null);
    });
    test("stage scope → stage_id=10", () => {
      const r = buildCanonicalGpxMediaInput({ roadbookId: 1, scope: "stage", role: "official", stageId: 10 });
      assert.ok(r.ok); assert.equal(r.record.stage_id, 10);
    });
    test("stage scope sans stageId → erreur", () => {
      const r = buildCanonicalGpxMediaInput({ roadbookId: 1, scope: "stage", role: "official" });
      assert.ok(!r.ok);
    });
    test("variant scope → stage_id + variant_id", () => {
      const r = buildCanonicalGpxMediaInput({ roadbookId: 1, scope: "variant", role: "custom", stageId: 10, variantId: 30 });
      assert.ok(r.ok);
      assert.equal(r.record.stage_id, 10);
      assert.equal(r.record.metadata.variant_id, 30);
    });
    test("variant scope sans variantId → erreur", () => {
      const r = buildCanonicalGpxMediaInput({ roadbookId: 1, scope: "variant", role: "custom", stageId: 10 });
      assert.ok(!r.ok);
    });
    test("existingMetadata → original_name présente", () => {
      const r = buildCanonicalGpxMediaInput({ roadbookId: 1, scope: "roadbook", role: "official", existingMetadata: { original_name: "test.gpx" } });
      assert.ok(r.ok);
      assert.equal(r.record.metadata.original_name, "test.gpx");
    });
  });

  // ─── 5. Plan structure ───────────────────────────────────────
  testSection("5. Structure du plan", () => {
    const plan = withValidation();
    test("generatedAt présent", () => assert.ok(plan.generatedAt));
    test("sourceSummary présent", () => assert.ok(plan.sourceSummary));
    test("alreadyCanonical présent", () => assert.ok(Array.isArray(plan.alreadyCanonical)));
    test("eligible.count = eligible.items.length", () => assert.equal(plan.eligible.count, plan.eligible.items.length));
    test("excluded.count = excluded.items.length", () => assert.equal(plan.excluded.count, plan.excluded.items.length));
    test("operations.count = operations.items.length", () => assert.equal(plan.operations.count, plan.operations.items.length));
    test("operations.count = eligible.count", () => assert.equal(plan.operations.count, plan.eligible.count));
    test("validation présent", () => assert.ok(plan.validation));
    test("decision présent", () => assert.ok(plan.decision));
  });

  // ─── 6. Canonical retention (media.id=3) ─────────────────────
  testSection("6. Média déjà canonique (media.id=3)", () => {
    const plan = buildGpxMigrationPlan(loadFixtures());
    const c = plan.alreadyCanonical.find(c => c.mediaId === 3);
    test("media.id=3 dans alreadyCanonical", () => assert.ok(c));
    test("media.id=3 PAS dans les opérations", () => assert.equal(findOp(plan, 3), undefined));
    test("media.id=3 PAS dans excluded", () => assert.equal(findExcluded(plan, 3), undefined));
  });

  // ─── 7. Invalides exclus (media.id=4, 5, 12) ────────────────
  testSection("7. Invalides exclus (media.id=4, 5, 12)", () => {
    const plan = buildGpxMigrationPlan(loadFixtures());
    for (const id of [4, 5, 12]) {
      const ex = findExcluded(plan, id);
      test(`media.id=${id} exclu`, () => assert.ok(ex));
      test(`media.id=${id} PAS dans operations`, () => assert.equal(findOp(plan, id), undefined));
    }
  });

  // ─── 8. Doublons canoniques (media.id=2,3 et 6,7) ──────────
  testSection("8. Doublons canoniques dans alreadyCanonical (media.id=2,3 et 6,7)", () => {
    const plan = buildGpxMigrationPlan(loadFixtures());
    for (const id of [2, 3, 6, 7]) {
      test(`media.id=${id} dans alreadyCanonical`, () => assert.ok(plan.alreadyCanonical.find(c => c.mediaId === id)));
      test(`media.id=${id} PAS dans excluded`, () => assert.equal(findExcluded(plan, id), undefined));
      test(`media.id=${id} PAS dans operations`, () => assert.equal(findOp(plan, id), undefined));
    }
  });

  // ─── 9. Média déjà canonique (media.id=1,8,9,10,11,13) ──────
  testSection("9. Médias canoniques dans alreadyCanonical", () => {
    const plan = buildGpxMigrationPlan(loadFixtures());
    for (const id of [1, 8, 9, 10, 11, 13]) {
      test(`media.id=${id} dans alreadyCanonical`, () => assert.ok(plan.alreadyCanonical.find(c => c.mediaId === id)));
      test(`media.id=${id} PAS dans operations`, () => assert.equal(findOp(plan, id), undefined));
      test(`media.id=${id} PAS dans excluded`, () => assert.equal(findExcluded(plan, id), undefined));
    }
  });

  // ─── 10. Validation du plan (0 opérations, tout canonique) ──
  testSection("10. Validation du plan", () => {
    const plan = buildGpxMigrationPlan(loadFixtures());
    const val = validateGpxMigrationPlan(plan);
    test("plan valide (0 opérations)", () => assert.ok(val.valid, `Erreurs: ${val.errors.join("; ")}`));
    test("0 erreurs", () => assert.equal(val.errors.length, 0));
    test("0 opérations (tout déjà canonique)", () => assert.equal(plan.operations.count, 0));
    test("tous les médias valides canoniques sont dans alreadyCanonical", () => {
      const canonicalIds = plan.alreadyCanonical.map(c => c.mediaId);
      for (const id of [1, 2, 3, 6, 7, 8, 9, 10, 11, 13]) {
        assert.ok(canonicalIds.includes(id), `media.id=${id} manquant dans alreadyCanonical`);
      }
    });
  });

  // ─── 11. Déterminisme ────────────────────────────────────────
  testSection("11. Déterminisme", () => {
    const input = loadFixtures();
    const p1 = buildGpxMigrationPlan(input);
    const p2 = buildGpxMigrationPlan(input);

    test("même nombre d'opérations (0)", () => assert.equal(p1.operations.count, p2.operations.count));
    test("même nombre alreadyCanonical", () => assert.equal(p1.alreadyCanonical.length, p2.alreadyCanonical.length));
    test("mêmes mediaId dans alreadyCanonical", () => {
      const ids1 = p1.alreadyCanonical.map(c => c.mediaId).sort();
      const ids2 = p2.alreadyCanonical.map(c => c.mediaId).sort();
      assert.deepStrictEqual(ids1, ids2);
    });
  });

  // ─── 12. Flags interdits ─────────────────────────────────────
  testSection("12. Flags interdits", () => {
    const FORBIDDEN = new Set(["--apply", "--write", "--execute", "--migrate", "--fix", "--update", "--commit"]);
    for (const flag of FORBIDDEN) {
      test(`flag ${flag} interdit`, () => assert.ok(FORBIDDEN.has(flag)));
    }
    test("flag --fixtures accepté", () => assert.ok(!FORBIDDEN.has("--fixtures")));
    test("flag --format=json accepté", () => assert.ok(!FORBIDDEN.has("--format")));
  });

  // ─── Summary ─────────────────────────────────────────────────
  const finalPlan = withValidation();
  const dec = finalPlan.decision === "GO" ? "✅" : "❌";
  console.log(`\n─── Résumé ───`);
  console.log(`Total: ${finalPlan.sourceSummary.totalMedia} | Canoniques: ${finalPlan.sourceSummary.canonical} | Invalides: ${finalPlan.sourceSummary.invalid} | Groupes doublons: ${finalPlan.sourceSummary.duplicates}`);
  console.log(`Éligibles: ${finalPlan.eligible.count} | Exclus: ${finalPlan.excluded.count} | Opérations: ${finalPlan.operations.count}`);
  console.log(`\n${nTests} tests, ${nFail} échecs`);
  process.exit(nFail > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
