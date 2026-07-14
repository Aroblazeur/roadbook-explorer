#!/usr/bin/env node
/**
 * Sprint 4C5 — Application contrôlée de la migration GPX
 *
 * Usage:
 *   node scripts/apply-gpx-migration.mjs                                         # dry-run (par défaut)
 *   node scripts/apply-gpx-migration.mjs --apply --confirm=APPLY-19-CANONICAL-GPX # application réelle
 *   node scripts/apply-gpx-migration.mjs --rollback --confirm=ROLLBACK-19-CANONICAL-GPX --rollback-file=./reports/gpx-migration-rollback.json
 *
 * Sécurité :
 *   - Pas d'écriture sans --apply + confirmation exacte
 *   - --force, --skip-validation, --ignore-preconditions, --include-ambiguous, --all refusés
 *   - fail-fast + rollback automatique en cas d'échec
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  buildGpxMigrationPlan,
  validateGpxMigrationPlan,
  formatGpxMigrationPlanJson,
  formatGpxMigrationPlanMarkdown,
  loadGpxMigrationPlanningData,
  loadFixtures,
  loadSupabase,
} from "./plan-gpx-migration.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Constants ───────────────────────────────────────────────────────────
const CONFIRM_APPLY = "APPLY-19-CANONICAL-GPX";
const CONFIRM_ROLLBACK = "ROLLBACK-19-CANONICAL-GPX";
const EXPECTED_PLAN = { totalMedia: 20, operations: 19, excludedCount: 1, ambiguousId: 41 };
const FORBIDDEN_FLAGS = [
  "--force", "--skip-validation", "--ignore-preconditions",
  "--include-ambiguous", "--all",
];

// ─── CLI ─────────────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { mode: "dry-run", confirm: null, planPath: null, rollbackFile: null };

  for (const arg of args) {
    if (arg === "--help") { printHelp(); process.exit(0); }
    if (arg === "--apply") { opts.mode = "apply"; continue; }
    if (arg === "--rollback") { opts.mode = "rollback"; continue; }
    if (arg.startsWith("--confirm=")) { opts.confirm = arg.slice(10); continue; }
    if (arg.startsWith("--plan=")) { opts.planPath = resolve(process.cwd(), arg.slice(7)); continue; }
    if (arg.startsWith("--rollback-file=")) { opts.rollbackFile = arg.slice(16); continue; }
    if (FORBIDDEN_FLAGS.includes(arg)) {
      console.error(`Option interdite : ${arg}`);
      process.exit(2);
    }
    if (arg.startsWith("--")) {
      console.error(`Option inconnue : ${arg}`);
      process.exit(2);
    }
  }

  if (opts.mode === "apply" && !opts.confirm) {
    console.error("Mode --apply nécessite --confirm=CHAINE");
    process.exit(2);
  }
  if (opts.mode === "rollback" && !opts.confirm) {
    console.error("Mode --rollback nécessite --confirm=CHAINE");
    process.exit(2);
  }
  if (opts.mode === "rollback" && !opts.rollbackFile) {
    console.error("Mode --rollback nécessite --rollback-file=CHEMIN");
    process.exit(2);
  }

  return opts;
}

function printHelp() {
  console.log(`
Usage:
  node scripts/apply-gpx-migration.mjs                           dry-run (par défaut)
  node scripts/apply-gpx-migration.mjs --apply --confirm=CHAINE   application réelle
  node scripts/apply-gpx-migration.mjs --rollback --confirm=CHAINE --rollback-file=CHEMIN  rollback

Options:
  --apply              Activer le mode écriture (nécessite --confirm)
  --confirm=CHAINE     Chaîne de confirmation exacte
  --plan=CHEMIN        Chemin vers le plan 4C4 (pour comparaison)
  --rollback           Mode rollback (nécessite --confirm + --rollback-file)
  --rollback-file=CHEMIN  Chemin vers le fichier de rollback
  --help               Affiche cette aide

Forbidden flags (will be rejected): ${FORBIDDEN_FLAGS.join(", ")}
`);
}

// ─── Hash helpers ────────────────────────────────────────────────────────
function sha256(filePath) {
  if (!existsSync(filePath)) return null;
  const data = readFileSync(filePath);
  return createHash("sha256").update(data).digest("hex");
}

function hashObject(obj) {
  return createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

// ─── 9. Compare plan with 4C4 ───────────────────────────────────────────
function comparePlans(regenerated, referencePath) {
  if (!referencePath || !existsSync(referencePath)) {
    return { match: false, error: "Aucun plan 4C4 de référence trouvé" };
  }
  const reference = JSON.parse(readFileSync(referencePath, "utf-8"));
  const refOps = reference.operations?.items ?? [];
  const newOps = regenerated.operations?.items ?? [];

  if (refOps.length !== newOps.length) {
    return { match: false, error: `Nombre d'opérations différent: ${refOps.length} (ref) vs ${newOps.length} (regénéré)` };
  }

  const ignoredKeys = new Set(["generatedAt", "sequence", "timestamp", "stageNumber", "roadbook"]);
  for (let i = 0; i < refOps.length; i++) {
    const ref = refOps[i];
    const cur = newOps[i];

    if (ref.mediaId !== cur.mediaId) {
      return { match: false, error: `mediaId diffèrent à l'index ${i}: ${ref.mediaId} vs ${cur.mediaId}` };
    }
    if (ref.businessIdentity !== cur.businessIdentity) {
      return { match: false, error: `identity diff pour mediaId=${ref.mediaId}: ${ref.businessIdentity} vs ${cur.businessIdentity}` };
    }
    if (ref.roadbookId !== cur.roadbookId) {
      return { match: false, error: `roadbookId diff pour mediaId=${ref.mediaId}` };
    }
    if (JSON.stringify(ref.before?.metadata) !== JSON.stringify(cur.before?.metadata)) {
      return { match: false, error: `before.metadata diff pour mediaId=${ref.mediaId}` };
    }
    if (JSON.stringify(ref.after) !== JSON.stringify(cur.after)) {
      return { match: false, error: `after diff pour mediaId=${ref.mediaId}` };
    }
    if (JSON.stringify(ref.preconditions) !== JSON.stringify(cur.preconditions)) {
      // Allow updated_at differences
      const refPre = { ...ref.preconditions };
      const curPre = { ...cur.preconditions };
      delete refPre.expectedUpdatedAt;
      delete curPre.expectedUpdatedAt;
      if (JSON.stringify(refPre) !== JSON.stringify(curPre)) {
        return { match: false, error: `preconditions diff pour mediaId=${ref.mediaId}` };
      }
    }
  }

  return { match: true, reference };
}

// ─── 6. Check plan numbers ──────────────────────────────────────────────
function checkPlanNumbers(plan) {
  const ss = plan.sourceSummary;
  if (ss.totalMedia !== EXPECTED_PLAN.totalMedia) {
    return { ok: false, error: `totalMedia attendu ${EXPECTED_PLAN.totalMedia}, obtenu ${ss.totalMedia}` };
  }
  if (plan.operations.count !== EXPECTED_PLAN.operations) {
    return { ok: false, error: `opérations attendues ${EXPECTED_PLAN.operations}, obtenues ${plan.operations.count}` };
  }
  if (plan.excluded.count !== EXPECTED_PLAN.excludedCount) {
    return { ok: false, error: `exclus attendus ${EXPECTED_PLAN.excludedCount}, obtenus ${plan.excluded.count}` };
  }

  const ambiguousExcluded = plan.excluded.items.find(e => e.mediaId === EXPECTED_PLAN.ambiguousId);
  if (!ambiguousExcluded) {
    return { ok: false, error: `media.id=${EXPECTED_PLAN.ambiguousId} non trouvé dans les exclus` };
  }
  if (ambiguousExcluded.reason !== "legacy-variant-target-is-incomplete") {
    return { ok: false, error: `media.id=${EXPECTED_PLAN.ambiguousId} raison incorrecte: ${ambiguousExcluded.reason}` };
  }

  const ambiguousInOps = plan.operations.items.find(o => o.mediaId === EXPECTED_PLAN.ambiguousId);
  if (ambiguousInOps) {
    return { ok: false, error: `media.id=${EXPECTED_PLAN.ambiguousId} présent dans les opérations` };
  }

  const dupMediaIds = plan.operations.items.map(o => o.mediaId)
    .filter((id, i, arr) => arr.indexOf(id) !== i);
  if (dupMediaIds.length > 0) {
    return { ok: false, error: `Doublon mediaId dans opérations: ${[...new Set(dupMediaIds)].join(", ")}` };
  }

  return { ok: true };
}

// ─── 10. Generate rollback snapshot ─────────────────────────────────────
async function generateRollback(supabase, operations) {
  const mediaIds = operations.map(o => o.mediaId);
  const { data, error } = await supabase
    .from("media")
    .select("id, roadbook_id, stage_id, metadata, created_at")
    .in("id", mediaIds)
    .order("id");

  if (error) throw new Error(`Erreur rollback select: ${error.message}`);
  if (!data || data.length !== operations.length) {
    throw new Error(`Rollback: ${operations.length} attendus, ${data?.length ?? 0} lus`);
  }

  const snapshots = operations.map((op, i) => {
    const row = data.find(r => r.id === op.mediaId);
    if (!row) throw new Error(`Rollback: media.id=${op.mediaId} introuvable dans Supabase`);
    return {
      sequence: op.sequence,
      mediaId: row.id,
      roadbook_id: row.roadbook_id,
      stage_id: row.stage_id,
      metadata: row.metadata,
      created_at: row.created_at,
      businessIdentity: op.businessIdentity,
    };
  });

  // Validate
  if (snapshots.length !== EXPECTED_PLAN.operations) {
    throw new Error(`Rollback: ${EXPECTED_PLAN.operations} snapshots attendus, ${snapshots.length} générés`);
  }
  const ids = snapshots.map(s => s.mediaId);
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupIds.length > 0) {
    throw new Error(`Rollback doublon mediaId: ${[...new Set(dupIds)].join(", ")}`);
  }
  if (snapshots.some(s => s.mediaId === EXPECTED_PLAN.ambiguousId)) {
    throw new Error(`Rollback contient media.id=${EXPECTED_PLAN.ambiguousId}`);
  }

  return { snapshots, capturedAt: new Date().toISOString() };
}

// ─── 11. Apply single operation ─────────────────────────────────────────
async function applyOperation(supabase, op) {
  const { mediaId, preconditions, after, businessIdentity, before } = op;

  // 11.1 Re-read
  const { data: row, error: readError } = await supabase
    .from("media")
    .select("id, roadbook_id, stage_id, type, path, metadata, created_at")
    .eq("id", mediaId)
    .single();

  if (readError) throw new Error(`media.id=${mediaId} relecture échouée: ${readError.message}`);
  if (!row) throw new Error(`media.id=${mediaId} introuvable`);

  // Verify preconditions
  if (row.roadbook_id !== preconditions.expectedRoadbookId) {
    throw new Error(`media.id=${mediaId}: roadbook_id ${row.roadbook_id} != attendu ${preconditions.expectedRoadbookId}`);
  }
  if (String(row.stage_id) !== String(preconditions.expectedStageId ?? null)) {
    throw new Error(`media.id=${mediaId}: stage_id ${row.stage_id} != attendu ${preconditions.expectedStageId}`);
  }
  const currentRole = row.metadata?.role ?? null;
  if (currentRole !== preconditions.expectedCurrentRole) {
    throw new Error(`media.id=${mediaId}: role ${currentRole} != attendu ${preconditions.expectedCurrentRole}`);
  }

  // 11.2 Conditional update
  let query = supabase
    .from("media")
    .update({
      stage_id: after.stage_id ?? null,
      metadata: after.metadata,
    })
    .eq("id", mediaId)
    .eq("roadbook_id", preconditions.expectedRoadbookId);

  if (preconditions.expectedStageId === null || preconditions.expectedStageId === undefined) {
    query = query.is("stage_id", null);
  } else {
    query = query.eq("stage_id", preconditions.expectedStageId);
  }

  const { data: updated, error: updateError, count } = await query.select("id, roadbook_id, stage_id, type, path, metadata, created_at");

  if (updateError) throw new Error(`media.id=${mediaId} UPDATE échoué: ${updateError.message}`);

  if (!updated || updated.length === 0) {
    throw new Error(`media.id=${mediaId}: 0 ligne modifiée (préconditions non satisfaites)`);
  }
  if (updated.length > 1) {
    throw new Error(`media.id=${mediaId}: ${updated.length} lignes modifiées (attendu: 1)`);
  }

  const updatedRow = Array.isArray(updated) ? updated[0] : updated;

  // 11.4 Verify after write
  if (updatedRow.roadbook_id !== preconditions.expectedRoadbookId) {
    throw new Error(`media.id=${mediaId}: vérif post-écriture roadbook_id changé`);
  }
  if (String(updatedRow.stage_id) !== String(after.stage_id ?? null)) {
    throw new Error(`media.id=${mediaId}: vérif post-écriture stage_id ${updatedRow.stage_id} != attendu ${after.stage_id}`);
  }
  if (updatedRow.metadata?.scope !== after.metadata.scope) {
    throw new Error(`media.id=${mediaId}: vérif post-écriture scope ${updatedRow.metadata?.scope} != attendu ${after.metadata.scope}`);
  }
  if (updatedRow.metadata?.role !== after.metadata.role) {
    throw new Error(`media.id=${mediaId}: vérif post-écriture role ${updatedRow.metadata?.role} != attendu ${after.metadata.role}`);
  }
  if (updatedRow.type !== "gpx") {
    throw new Error(`media.id=${mediaId}: vérif post-écriture type changé vers ${updatedRow.type}`);
  }

  return updatedRow;
}

// ─── 13. Rollback single operation ──────────────────────────────────────
async function rollbackOperation(supabase, snapshot) {
  const { mediaId, stage_id, metadata } = snapshot;

  // Verify current state is canonical
  const { data: current } = await supabase
    .from("media")
    .select("id, metadata")
    .eq("id", mediaId)
    .single();

  if (!current) throw new Error(`rollback media.id=${mediaId}: ligne introuvable`);
  const currentScope = current.metadata?.scope;
  if (!currentScope || !["roadbook", "stage", "variant"].includes(currentScope)) {
    throw new Error(`rollback media.id=${mediaId}: état actuel non canonique (scope=${currentScope}), impossible de rollbacker`);
  }

  let query = supabase
    .from("media")
    .update({ stage_id, metadata })
    .eq("id", mediaId);

  if (stage_id === null || stage_id === undefined) {
    query = query.is("stage_id", null);
  } else {
    query = query.eq("stage_id", stage_id);
  }

  const { data: restored, error } = await query.select("id, stage_id, metadata");

  if (error) throw new Error(`rollback media.id=${mediaId} échoué: ${error.message}`);
  if (!restored || restored.length === 0) {
    throw new Error(`rollback media.id=${mediaId}: 0 ligne modifiée`);
  }
  if (restored.length > 1) {
    throw new Error(`rollback media.id=${mediaId}: ${restored.length} lignes modifiées`);
  }

  // Verify rollback
  const restoredRow = Array.isArray(restored) ? restored[0] : restored;
  if (String(restoredRow.stage_id) !== String(stage_id ?? null)) {
    throw new Error(`rollback media.id=${mediaId}: stage_id restauré incorrect`);
  }

  return restoredRow;
}

// ─── 17. Final audit ─────────────────────────────────────────────────────
async function finalAudit(supabase) {
  const { data: allGpx, error } = await supabase
    .from("media")
    .select("id, roadbook_id, stage_id, type, metadata, path")
    .eq("type", "gpx")
    .order("id");

  if (error) throw new Error(`Audit final: ${error.message}`);

  const { classifyGpxMedia, selectUniqueGpxMedia } = await import("../src/lib/roadbooks/gpx-media.js");

  let canonical = 0, legacy = 0, ambiguous = 0, invalid = 0;
  for (const m of allGpx) {
    const c = classifyGpxMedia(m);
    if (c.status === "canonical") canonical++;
    else if (c.status === "legacy-compatible") legacy++;
    else if (c.status === "ambiguous") ambiguous++;
    else invalid++;
  }

  const selection = selectUniqueGpxMedia(allGpx);

  // Check media.id=41 specifically
  const media41 = allGpx.find(m => m.id === 41);
  const class41 = media41 ? classifyGpxMedia(media41) : null;

  return {
    totalMedia: allGpx.length,
    canonical,
    legacyCompatible: legacy,
    ambiguous,
    invalid,
    duplicates: selection.duplicates.length,
    storageObjects: allGpx.length,
    media41: class41 ? {
      id: 41,
      status: class41.status,
      reason: class41.reason,
      unchanged: class41.status === "ambiguous" && class41.reason === "legacy-variant-target-is-incomplete",
    } : null,
    allMediaIds: allGpx.map(m => m.id),
  };
}

// ─── Dry-run mode ────────────────────────────────────────────────────────
async function dryRun(supabase, planPath) {
  console.log("=== DRY-RUN MODE ===");
  console.log("Aucune écriture ne sera effectuée.\n");

  const input = await loadGpxMigrationPlanningData(supabase);
  const plan = buildGpxMigrationPlan(input);
  plan.validation = validateGpxMigrationPlan(plan);

  console.log(formatGpxMigrationPlanMarkdown(plan));

  if (planPath) {
    const comparison = comparePlans(plan, planPath);
    console.log(`\nComparaison avec plan 4C4: ${comparison.match ? "✅ Identique" : `❌ ${comparison.error}`}`);
  }

  console.log(`\nPour appliquer:  node scripts/apply-gpx-migration.mjs --apply --confirm=${CONFIRM_APPLY} --plan=${planPath || "./reports/gpx-migration-plan.json"}`);
  console.log(`Rollback:        node scripts/apply-gpx-migration.mjs --rollback --confirm=${CONFIRM_ROLLBACK} --rollback-file=./reports/gpx-migration-rollback.json`);
}

// ─── Apply mode ─────────────────────────────────────────────────────────
async function applyMigration(supabase, planPath) {
  console.log("=== MODE APPLICATION ===");
  console.log(`Confirmation: ${process.argv.find(a => a.startsWith("--confirm=")).slice(10)}\n`);

  // 1. Regenerate plan
  console.log("1. Régénération du plan...");
  const input = await loadGpxMigrationPlanningData(supabase);
  const plan = buildGpxMigrationPlan(input);
  plan.validation = validateGpxMigrationPlan(plan);

  const planHash = hashObject(plan);

  // 2. Compare with 4C4
  console.log("2. Comparaison avec plan 4C4...");
  const comparison = comparePlans(plan, planPath);
  if (!comparison.match) {
    console.error(`NO GO — ${comparison.error}`);
    process.exit(1);
  }
  console.log("   ✅ Plan identique au plan 4C4");

  // 3. Validate plan numbers
  console.log("3. Validation des métriques du plan...");
  const numbersOk = checkPlanNumbers(plan);
  if (!numbersOk.ok) {
    console.error(`NO GO — ${numbersOk.error}`);
    process.exit(1);
  }
  console.log("   ✅ Métriques conformes (20 médias, 19 opérations, 1 exclu)");

  // 4. Generate rollback
  console.log("4. Génération de la sauvegarde de rollback...");
  const rollback = await generateRollback(supabase, plan.operations.items);
  const rollbackPath = resolve(__dirname, "..", "reports", "gpx-migration-rollback.json");
  mkdirSync(dirname(rollbackPath), { recursive: true });
  writeFileSync(rollbackPath, JSON.stringify(rollback, null, 2), "utf-8");
  console.log(`   ✅ Rollback écrit dans ${rollbackPath}`);

  const rollbackHash = sha256(rollbackPath);

  // 5. Display final summary before writing
  console.log("\n5. Résumé final avant écriture :");
  console.log(`   Opérations : ${plan.operations.count}`);
  console.log(`   Plan hash  : ${planHash}`);
  console.log(`   Rollback   : ${rollback.snapshots.length} snapshots (hash: ${rollbackHash})`);
  console.log(`   media.id=41: exclu ✅`);
  console.log("");

  // 6. Apply sequentially
  console.log("6. Application des opérations...\n");
  const applied = [];
  const failed = [];
  const rolledBack = [];

  for (const op of plan.operations.items) {
    try {
      const result = await applyOperation(supabase, op);
      applied.push({ sequence: op.sequence, mediaId: op.mediaId, status: "applied" });
      console.log(`   ✅ [${op.sequence}/${plan.operations.count}] media.id=${op.mediaId} appliqué`);
    } catch (err) {
      console.error(`   ❌ [${op.sequence}] media.id=${op.mediaId} ÉCHEC: ${err.message}`);
      failed.push({ sequence: op.sequence, mediaId: op.mediaId, error: err.message });

      // Rollback already-applied operations in reverse order
      console.log("\n   → Rollback des opérations déjà appliquées...");
      for (const done of applied.reverse()) {
        const snap = rollback.snapshots.find(s => s.mediaId === done.mediaId);
        if (!snap) {
          console.error(`   ⚠️  Aucun snapshot pour media.id=${done.mediaId}`);
          rolledBack.push({ mediaId: done.mediaId, status: "failed" });
          continue;
        }
        try {
          await rollbackOperation(supabase, snap);
          rolledBack.push({ mediaId: done.mediaId, status: "rolled-back" });
          console.log(`   ✅ Rollback media.id=${done.mediaId} réussi`);
        } catch (rbErr) {
          console.error(`   ❌ Rollback media.id=${done.mediaId} ÉCHEC: ${rbErr.message}`);
          rolledBack.push({ mediaId: done.mediaId, status: "rollback-failed" });
        }
      }
      break;
    }
  }

  // 7. Final audit
  console.log("\n7. Audit final...");
  const audit = await finalAudit(supabase);
  console.log(`   Total: ${audit.totalMedia} | Canoniques: ${audit.canonical} | Legacy: ${audit.legacyCompatible} | Ambigus: ${audit.ambiguous} | Invalides: ${audit.invalid} | Doublons: ${audit.duplicates}`);
  if (audit.media41) {
    console.log(`   media.id=41: ${audit.media41.status} (${audit.media41.reason}) — ${audit.media41.unchanged ? "inchangé ✅" : "⚠️ CHANGÉ !"}`);
  }

  // 8. Generate report
  const report = {
    startedAt: rollback.capturedAt,
    completedAt: new Date().toISOString(),
    sourceCommit: "926561d0bf8074808d80fe3bc5a1e47b498745aa",
    planHash,
    rollbackHash,
    status: failed.length > 0 ? (applied.length > 0 ? "partial-failure-rolled-back" : "complete-failure") : "success",
    applied: applied.length,
    failed: failed.length,
    rolledBack: rolledBack.length,
    skipped: plan.operations.count - applied.length - failed.length,
    operations: plan.operations.items.map(op => {
      const app = applied.find(a => a.mediaId === op.mediaId);
      const rb = rolledBack.find(r => r.mediaId === op.mediaId);
      const fl = failed.find(f => f.mediaId === op.mediaId);
      return {
        sequence: op.sequence,
        mediaId: op.mediaId,
        businessIdentity: op.businessIdentity,
        status: fl ? "failed" : rb ? "rolled-back" : app ? "applied" : "skipped",
        rollbackStatus: rb?.status ?? null,
      };
    }),
    finalAudit: audit,
    reportGeneratedAt: new Date().toISOString(),
  };

  const reportPath = resolve(__dirname, "..", "reports", "gpx-migration-application-result.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\nRapport écrit dans ${reportPath}`);

  if (failed.length > 0) {
    console.log(`\n⚠️  ${applied.length} appliquée(s), ${failed.length} échouée(s), ${rolledBack.length} rollbackée(s)`);
    process.exit(1);
  }

  console.log(`\n✅ Migration terminée avec succès : ${applied.length}/${plan.operations.count} opérations`);
  return report;
}

// ─── Rollback mode ───────────────────────────────────────────────────────
async function rollbackMode(supabase, rollbackFilePath) {
  console.log("=== MODE ROLLBACK ===");

  if (!existsSync(rollbackFilePath)) {
    console.error(`Fichier de rollback introuvable: ${rollbackFilePath}`);
    process.exit(1);
  }

  const rollback = JSON.parse(readFileSync(rollbackFilePath, "utf-8"));
  const snapshots = rollback.snapshots;

  // Validate rollback file
  if (!snapshots || snapshots.length !== EXPECTED_PLAN.operations) {
    console.error(`Nombre de snapshots incorrect: ${snapshots?.length ?? 0}`);
    process.exit(1);
  }

  const ids = snapshots.map(s => s.mediaId);
  const dupIds = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupIds.length > 0) {
    console.error(`Doublon mediaId dans rollback: ${[...new Set(dupIds)].join(", ")}`);
    process.exit(1);
  }

  if (snapshots.some(s => s.mediaId === EXPECTED_PLAN.ambiguousId)) {
    console.error(`Rollback contient media.id=${EXPECTED_PLAN.ambiguousId}`);
    process.exit(1);
  }

  console.log(`Rollback validé: ${snapshots.length} snapshots, pas de doublon, pas de media.id=41\n`);

  // Apply rollback in reverse order (last applied first)
  const sorted = [...snapshots].sort((a, b) => b.sequence - a.sequence);
  for (const snap of sorted) {
    try {
      await rollbackOperation(supabase, snap);
      console.log(`   ✅ Rollback media.id=${snap.mediaId} réussi`);
    } catch (err) {
      console.error(`   ❌ Rollback media.id=${snap.mediaId} ÉCHEC: ${err.message}`);
      process.exit(1);
    }
  }

  console.log(`\n✅ Rollback terminé: ${sorted.length} opérations restaurées`);
}

// ─── Main ────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs();
  const supabase = loadSupabase();

  // Validate confirmation string
  if (opts.mode === "apply" && opts.confirm !== CONFIRM_APPLY) {
    console.error(`Confirmation incorrecte: "${opts.confirm}"`);
    console.error(`Attendue: "${CONFIRM_APPLY}"`);
    process.exit(2);
  }

  if (opts.mode === "rollback" && opts.confirm !== CONFIRM_ROLLBACK) {
    console.error(`Confirmation incorrecte: "${opts.confirm}"`);
    console.error(`Attendue: "${CONFIRM_ROLLBACK}"`);
    process.exit(2);
  }

  // Resolve plan path
  const planPath = opts.planPath
    ? resolve(__dirname, "..", opts.planPath.replace(/^\.\//, ""))
    : resolve(__dirname, "..", "reports", "gpx-migration-plan.json");

  if (opts.mode === "dry-run") {
    await dryRun(supabase, planPath);
  } else if (opts.mode === "apply") {
    await applyMigration(supabase, planPath);
  } else if (opts.mode === "rollback") {
    const rollbackPath = resolve(__dirname, "..", opts.rollbackFile.replace(/^\.\//, ""));
    await rollbackMode(supabase, rollbackPath);
  }
}

export {
  parseArgs,
  comparePlans,
  checkPlanNumbers,
  generateRollback,
  applyOperation,
  rollbackOperation,
  finalAudit,
  sha256,
  hashObject,
};

const thisFile = fileURLToPath(import.meta.url);
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(thisFile);
if (isMain) {
  main().catch(err => {
    console.error("Erreur fatale:", err.message);
    process.exit(1);
  });
}
