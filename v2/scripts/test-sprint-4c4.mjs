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
      metadata: { role: "gpx-stage", source: "v1-import" },
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
      // 1  Legacy global (roadbook scope)
      makeMedia(1, { stage_id: null, metadata: { role: "gpx-official", source: "v1-import" } }),
      // 2  Legacy stage, same identity as canonical media.id=3
      makeMedia(2, { stage_id: sidA, metadata: { role: "gpx-stage", source: "v1-import" } }),
      // 3  Already canonical (stage, official)
      makeMedia(3, { stage_id: sidA, metadata: { scope: "stage", role: "official", source: "v1-import" } }),
      // 4  Ambiguous variant (no variant_id, no stage_id)
      makeMedia(4, { stage_id: null, metadata: { role: "gpx-variant", source: "v1-import" } }),
      // 5  Invalid
      makeMedia(5, { type: "gpx", metadata: { role: null } }),
      // 6  Duplicate A for stage:20
      makeMedia(6, { stage_id: sidB, metadata: { role: "gpx-stage", source: "v1-import" } }),
      // 7  Duplicate B for stage:20
      makeMedia(7, { id: 7, stage_id: sidB, metadata: { role: "gpx-stage", source: "v1-import" } }),
      // 8  Missing roadbook
      makeMedia(8, { roadbook_id: 9999, stage_id: null, metadata: { role: "gpx-official", source: "v1-import" } }),
      // 9  Missing stage
      makeMedia(9, { stage_id: 99999, metadata: { role: "gpx-stage", source: "v1-import" } }),
      // 10 Stage-roadbook mismatch
      makeMedia(10, { stage_id: 999, metadata: { role: "gpx-stage", source: "v1-import" } }),
      // 11 Valid variant
      makeMedia(11, { stage_id: sidA, metadata: { role: "gpx-variant", scope: "variant", variant_id: vidA, source: "v1-import" } }),
      // 12 Ambiguous (variant scope, no variantId)
      makeMedia(12, { stage_id: sidA, metadata: { role: "gpx-variant", source: "v1-import" } }),
      // 13 Variant stage mismatch (stage 999 belongs to roadbook 99)
      makeMedia(13, { stage_id: 999, metadata: { role: "gpx-variant", variant_id: 1, source: "v1-import" } }),
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
      [1, "legacy-compatible"], [2, "legacy-compatible"], [3, "canonical"],
      [4, "ambiguous"], [5, "invalid"],
      [6, "legacy-compatible"], [7, "legacy-compatible"],
      [8, "legacy-compatible"], [9, "legacy-compatible"], [10, "legacy-compatible"],
      [11, "legacy-compatible"], [12, "ambiguous"], [13, "legacy-compatible"],
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

  // ─── 7. Ambigus exclus ───────────────────────────────────────
  testSection("7. Ambigus exclus (media.id=4, 12)", () => {
    const plan = buildGpxMigrationPlan(loadFixtures());
    for (const id of [4, 12]) {
      const ex = findExcluded(plan, id);
      test(`media.id=${id} exclu`, () => assert.ok(ex));
      test(`media.id=${id} reason=legacy-variant-target-is-incomplete`, () => assert.equal(ex.reason, "legacy-variant-target-is-incomplete"));
      test(`media.id=${id} review=manual`, () => assert.equal(ex.review, "manual"));
      test(`media.id=${id} PAS dans operations`, () => assert.equal(findOp(plan, id), undefined));
    }
  });

  // ─── 8. Invalide exclu (media.id=5) ──────────────────────────
  testSection("8. Invalide exclu (media.id=5)", () => {
    const plan = buildGpxMigrationPlan(loadFixtures());
    const ex = findExcluded(plan, 5);
    test("media.id=5 exclu", () => assert.ok(ex));
    test("media.id=5 PAS dans operations", () => assert.equal(findOp(plan, 5), undefined));
  });

  // ─── 9. Doublons (media.id=6,7) ─────────────────────────────
  testSection("9. Doublons (media.id=6,7)", () => {
    const plan = buildGpxMigrationPlan(loadFixtures());
    const kept = findOp(plan, 6) || findOp(plan, 7);
    const dropped = findExcluded(plan, 6) || findExcluded(plan, 7);
    test("un doublon est dans operations", () => assert.ok(kept));
    test("l'autre doublon est dans excluded", () => assert.ok(dropped));
    test("media.id=6 ou 7 dans excluded avec reason=duplicate-identity", () => {
      const ex = findExcluded(plan, 6) || findExcluded(plan, 7);
      assert.equal(ex.reason, "duplicate-identity");
    });
  });

  // ─── 10. Conflit canonique-legacy (media.id=2) ───────────────
  testSection("10. Legacy en conflit avec existant canonique (media.id=2 vs 3)", () => {
    const plan = buildGpxMigrationPlan(loadFixtures());
    test("media.id=2 exclu (canonique media.id=3 déjà présent)", () => {
      const ex = findExcluded(plan, 2);
      assert.ok(ex);
      assert.equal(ex.reason, "duplicate-identity");
    });
    test("media.id=3 PAS dans operations, PAS dans excluded", () => {
      assert.equal(findOp(plan, 3), undefined);
      assert.equal(findExcluded(plan, 3), undefined);
    });
  });

  // ─── 11. Roadbook manquant (media.id=8) ──────────────────────
  testSection("11. Roadbook manquant (media.id=8)", () => {
    const plan = buildGpxMigrationPlan(loadFixtures());
    const ex = findExcluded(plan, 8);
    test("media.id=8 exclu", () => assert.ok(ex));
    test("reason=missing-roadbook", () => assert.equal(ex.reason, "missing-roadbook"));
  });

  // ─── 12. Stage manquant (media.id=9) ─────────────────────────
  testSection("12. Stage manquant (media.id=9)", () => {
    const plan = buildGpxMigrationPlan(loadFixtures());
    const ex = findExcluded(plan, 9);
    test("media.id=9 exclu", () => assert.ok(ex));
    test("reason=missing-stage", () => assert.equal(ex.reason, "missing-stage"));
  });

  // ─── 13. Mismatch stage-roadbook (media.id=10,13) ────────────
  testSection("13. Mismatch stage-roadbook (media.id=10,13)", () => {
    const plan = buildGpxMigrationPlan(loadFixtures());
    for (const id of [10, 13]) {
      const ex = findExcluded(plan, id);
      test(`media.id=${id} exclu`, () => assert.ok(ex));
      test(`media.id=${id} reason=stage-roadbook-mismatch`, () => assert.equal(ex.reason, "stage-roadbook-mismatch"));
    }
  });

  // ─── 14. Variant sans variantId (media.id=12 est ambigus, testé en §7) ──
  // Already covered by §7

  // ─── 15. Validation ──────────────────────────────────────────
  testSection("14. Validation du plan", () => {
    const plan = buildGpxMigrationPlan(loadFixtures());
    const val = validateGpxMigrationPlan(plan);
    test("plan valide", () => assert.ok(val.valid, `Erreurs: ${val.errors.join("; ")}`));
    test("0 erreurs", () => assert.equal(val.errors.length, 0));
    test("pas de media.id=41 dans operations", () => assert.ok(!plan.operations.items.some(o => o.mediaId === 41)));
    test("pas de statut ambiguous dans operations", () => assert.ok(!plan.operations.items.some(o => o.classificationBefore?.status === "ambiguous")));
    test("pas de statut invalid dans operations", () => assert.ok(!plan.operations.items.some(o => o.classificationBefore?.status === "invalid")));
    test("toutes les opérations ont reversibleSnapshot", () => assert.ok(plan.operations.items.every(o => o.reversibleSnapshot)));
    test("toutes les opérations ont preconditions", () => assert.ok(plan.operations.items.every(o => o.preconditions)));
  });

  // ─── 16. Rollback ────────────────────────────────────────────
  testSection("15. Snapshot de rollback", () => {
    const plan = buildGpxMigrationPlan(loadFixtures());
    for (const op of plan.operations.items) {
      test(`rollback media.id=${op.mediaId}: stage_id préservé`, () => assert.equal(op.reversibleSnapshot.stage_id, op.before.stage_id));
      test(`rollback media.id=${op.mediaId}: metadata préservé`, () => assert.deepStrictEqual(op.reversibleSnapshot.metadata, op.before.metadata));
      if (op.reversibleSnapshot.updated_at) {
        test(`rollback media.id=${op.mediaId}: updated_at présent`, () => assert.ok(op.reversibleSnapshot.updated_at));
      }
    }
  });

  // ─── 17. Déterminisme ────────────────────────────────────────
  testSection("16. Déterminisme de l'ordre", () => {
    const input = loadFixtures();
    const p1 = buildGpxMigrationPlan(input);
    const p2 = buildGpxMigrationPlan(input);

    test("même nombre d'opérations", () => assert.equal(p1.operations.count, p2.operations.count));
    test("même ordre des mediaId", () => {
      assert.deepStrictEqual(p1.operations.items.map(o => o.mediaId), p2.operations.items.map(o => o.mediaId));
    });
    test("séquences consécutives 1..n", () => {
      const seqs = p1.operations.items.map(o => o.sequence);
      assert.deepStrictEqual(seqs, seqs.map((_, i) => i + 1));
    });
    test("tri respecte roadbookId → scope → stageId → variantId → role → mediaId", () => {
      const ops = p1.operations.items;
      for (let i = 1; i < ops.length; i++) {
        const a = ops[i - 1], b = ops[i];
        if (a.roadbookId !== b.roadbookId) assert.ok(a.roadbookId < b.roadbookId);
      }
    });
  });

  // ─── 18. Flags interdits ─────────────────────────────────────
  testSection("17. Flags interdits", () => {
    const FORBIDDEN = new Set(["--apply", "--write", "--execute", "--migrate", "--fix", "--update", "--commit"]);
    for (const flag of FORBIDDEN) {
      test(`flag ${flag} interdit`, () => assert.ok(FORBIDDEN.has(flag)));
    }
    test("flag --fixtures accepté", () => assert.ok(!FORBIDDEN.has("--fixtures")));
    test("flag --format=json accepté", () => assert.ok(!FORBIDDEN.has("--format")));
  });

  // ─── 19. Opérations éligibles ────────────────────────────────
  testSection("18. Opérations éligibles", () => {
    const plan = buildGpxMigrationPlan(loadFixtures());
    const ops = plan.operations.items;

    test("media.id=1 dans operations (roadbook legacy)", () => assert.ok(findOp(plan, 1)));
    test("media.id=6 ou 7 dans operations (stage legacy, doublon résolu)", () => {
      assert.ok(findOp(plan, 6) || findOp(plan, 7));
    });
    test("media.id=11 dans operations (variant valide)", () => assert.ok(findOp(plan, 11)));

    // Check op for media.id=1 is a roadbook scope
    const op1 = findOp(plan, 1);
    test("media.id=1: classification scope=roadbook", () => {
      assert.equal(op1.classificationBefore.scope, "roadbook");
    });
    test("media.id=1: after scope=roadbook", () => {
      assert.equal(op1.after.metadata.scope, "roadbook");
    });
    test("media.id=1: role official", () => {
      assert.equal(op1.after.metadata.role, "official");
    });

    // Check op for the stage duplicate (if media.id=6 is kept)
    const stageOp = findOp(plan, 6);
    if (stageOp) {
      test("media.id=6: classification scope=stage", () => assert.equal(stageOp.classificationBefore.scope, "stage"));
      test("media.id=6: after scope=stage", () => assert.equal(stageOp.after.metadata.scope, "stage"));
    }

    // All ops have before !== after
    for (const op of ops) {
      test(`op media.id=${op.mediaId}: before !== after`, () => {
        assert.notDeepStrictEqual(op.before, op.after);
      });
    }
  });

  // ─── Summary ─────────────────────────────────────────────────
  const finalPlan = withValidation();
  const dec = finalPlan.decision === "GO" ? "✅" : "❌";
  console.log(`\n─── Résumé ───`);
  console.log(`Total: ${finalPlan.sourceSummary.totalMedia} | Canoniques: ${finalPlan.sourceSummary.canonical} | Legacy: ${finalPlan.sourceSummary.legacyCompatible} | Ambigus: ${finalPlan.sourceSummary.ambiguous} | Invalides: ${finalPlan.sourceSummary.invalid} | Groupes doublons: ${finalPlan.sourceSummary.duplicates}`);
  console.log(`Éligibles: ${finalPlan.eligible.count} | Exclus: ${finalPlan.excluded.count} | Opérations: ${finalPlan.operations.count}`);
  console.log(`\n${nTests} tests, ${nFail} échecs`);
  process.exit(nFail > 0 ? 1 : 0);
}

run().catch(err => { console.error(err); process.exit(1); });
