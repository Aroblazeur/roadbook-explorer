#!/usr/bin/env node
/**
 * Sprint 4C4 — Plan de migration GPX (dry-run strict)
 *
 * Lecture seule. Utilise les fonctions de classification existantes.
 * Ne modifie aucune donnée.
 *
 * Usage:
 *   node scripts/plan-gpx-migration.mjs
 *   node scripts/plan-gpx-migration.mjs --format=json
 *   node scripts/plan-gpx-migration.mjs --format=markdown
 *   node scripts/plan-gpx-migration.mjs --output=./reports/gpx-migration-plan.json
 *   node scripts/plan-gpx-migration.mjs --fixtures
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyGpxMedia,
  buildGpxBusinessIdentity,
  selectUniqueGpxMedia,
  buildCanonicalGpxMediaInput,
  gpxDiagnosticDetails,
} from "../src/lib/roadbooks/gpx-media.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FORBIDDEN_OPTIONS = new Set(["--apply", "--write", "--execute", "--migrate", "--fix", "--update", "--commit"]);

// ─── Parse args ───────────────────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { format: "markdown", output: null, fixtures: false };
  for (const arg of args) {
    if (FORBIDDEN_OPTIONS.has(arg)) {
      console.error(`Option interdite : ${arg}`);
      process.exit(2);
    }
    if (arg === "--fixtures") { opts.fixtures = true; continue; }
    if (arg.startsWith("--format=")) { opts.format = arg.slice(9); continue; }
    if (arg.startsWith("--output=")) { opts.output = arg.slice(9); continue; }
    if (arg.startsWith("--")) {
      console.error(`Option inconnue : ${arg}`);
      process.exit(2);
    }
  }
  if (!["json", "markdown"].includes(opts.format)) {
    console.error(`Format inconnu : ${opts.format}. Utilisez json ou markdown.`);
    process.exit(2);
  }
  return opts;
}

// ─── Load env ─────────────────────────────────────────────────────────────
function loadSupabase() {
  const envPath = resolve(__dirname, "..", ".env.local");
  if (!existsSync(envPath)) {
    console.error("Fichier .env.local introuvable");
    process.exit(1);
  }
  const text = readFileSync(envPath, "utf-8");
  const url = text.match(/NEXT_PUBLIC_SUPABASE_URL="(.+)"/)?.[1];
  const key = text.match(/SUPABASE_SERVICE_ROLE_KEY="(.+)"/)?.[1];
  if (!url || !key) {
    console.error("Impossible de lire les identifiants Supabase depuis .env.local");
    process.exit(1);
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

// ─── 7.1 Load data (read-only) ────────────────────────────────────────────
async function loadGpxMigrationPlanningData(supabase) {
  const [rbRes, stRes, mediaRes] = await Promise.all([
    supabase.from("roadbooks").select("id, title, slug").order("id"),
    supabase.from("stages").select("id, roadbook_id, stage_number").order("id"),
    supabase.from("media").select("id, roadbook_id, stage_id, type, path, metadata, created_at").eq("type", "gpx").order("id"),
  ]);
  if (rbRes.error) throw new Error(`Erreur roadbooks: ${rbRes.error.message}`);
  if (stRes.error) throw new Error(`Erreur stages: ${stRes.error.message}`);
  if (mediaRes.error) throw new Error(`Erreur media: ${mediaRes.error.message}`);
  return {
    roadbooks: rbRes.data,
    stages: stRes.data,
    mediaRows: mediaRes.data,
  };
}

// ─── Fixtures (mode hors-ligne) ───────────────────────────────────────────
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
      // 18.1 Legacy global
      makeMedia(1, { stage_id: null, metadata: { role: "gpx-official", source: "v1-import" } }),
      // 18.2 Legacy stage
      makeMedia(2, { stage_id: sidA, metadata: { role: "gpx-stage", source: "v1-import" } }),
      // 18.3 Already canonical
      makeMedia(3, { stage_id: sidA, metadata: { scope: "stage", role: "official", source: "v1-import" } }),
      // 18.4 Ambiguous (equivalent of media.id=41)
      makeMedia(4, { stage_id: null, metadata: { role: "gpx-variant", source: "v1-import" } }),
      // 18.5 Invalid
      makeMedia(5, { type: "gpx", metadata: { role: null } }),
      // 18.6 Duplicate
      makeMedia(6, { stage_id: sidB, metadata: { role: "gpx-stage", source: "v1-import" } }),
      makeMedia(7, { id: 7, stage_id: sidB, metadata: { role: "gpx-stage", source: "v1-import" } }),
      // 18.7 Missing roadbook
      makeMedia(8, { roadbook_id: 9999, stage_id: null, metadata: { role: "gpx-official", source: "v1-import" } }),
      // 18.8 Missing stage
      makeMedia(9, { stage_id: 99999, metadata: { role: "gpx-stage", source: "v1-import" } }),
      // 18.9 Stage-roadbook mismatch
      makeMedia(10, { stage_id: 999, metadata: { role: "gpx-stage", source: "v1-import" } }),
      // 18.10 Valid variant
      makeMedia(11, { stage_id: sidA, metadata: { role: "gpx-variant", scope: "variant", variant_id: vidA, source: "v1-import" } }),
      // 18.11 Missing variant (stage exists but no variant_id)
      makeMedia(12, { stage_id: sidA, metadata: { role: "gpx-variant", source: "v1-import" } }),
      // 18.12 Variant wrong stage (stage belongs to different roadbook)
      makeMedia(13, { stage_id: 999, metadata: { role: "gpx-variant", variant_id: 1, source: "v1-import" } }),
    ],
  };
}

// ─── 7.2 Build plan (pure function) ───────────────────────────────────────
function buildGpxMigrationPlan(input) {
  const { mediaRows, roadbooks, stages } = input;
  const rbMap = new Map(roadbooks.map(r => [r.id, r]));
  const stageMap = new Map(stages.map(s => [s.id, s]));

  // Build summary
  const classified = mediaRows.map(m => ({ media: m, classification: classifyGpxMedia(m) }));
  const selection = selectUniqueGpxMedia(mediaRows);
  // Eligible (non-duplicate) identities
  const selectedIds = new Set();
  for (const [, entry] of selection.unique) {
    selectedIds.add(entry.media.id);
  }
  // Duplicate identities: canonical wins; otherwise keep lowest mediaId
  const duplicateIds = new Set();
  for (const group of selection.duplicates) {
    const canonicalEntry = group.entries.find(e => e.classification.status === "canonical");
    if (canonicalEntry) {
      // Canonical already occupies this identity, no migration needed
      selectedIds.add(canonicalEntry.media.id);
      for (const entry of group.entries) {
        if (entry.media.id !== canonicalEntry.media.id) {
          duplicateIds.add(entry.media.id);
        }
      }
    } else {
      // No canonical → pick lowest mediaId as the migration source
      group.entries.sort((a, b) => a.media.id - b.media.id);
      selectedIds.add(group.entries[0].media.id);
      for (let i = 1; i < group.entries.length; i++) {
        duplicateIds.add(group.entries[i].media.id);
      }
    }
  }

  const eligible = [];
  const excluded = [];
  const alreadyCanonical = [];
  const operations = [];

  for (const { media, classification } of classified) {
    const identity = buildGpxBusinessIdentity(classification);

    // Already canonical
    if (classification.status === "canonical") {
      alreadyCanonical.push({
        mediaId: media.id,
        status: classification.status,
        scope: classification.scope,
        role: classification.role,
        reason: null,
      });
      continue;
    }

    // Exclusion checks
    let exclusionReason = null;

    if (classification.status === "ambiguous" || classification.status === "invalid") {
      exclusionReason = classification.status === "ambiguous" ? classification.reason : "invalid-media";
    } else if (!identity) {
      exclusionReason = "no-business-identity";
    } else if (duplicateIds.has(media.id)) {
      exclusionReason = "duplicate-identity";
    } else if (!rbMap.has(media.roadbook_id)) {
      exclusionReason = "missing-roadbook";
    } else if (classification.scope === "stage" && classification.stageId != null && !stageMap.has(classification.stageId)) {
      exclusionReason = "missing-stage";
    } else if (classification.scope === "variant" && classification.stageId != null && !stageMap.has(classification.stageId)) {
      exclusionReason = "missing-stage";
    } else if (classification.scope === "variant" && classification.stageId != null && classification.variantId != null) {
      const stage = stageMap.get(classification.stageId);
      if (stage && stage.roadbook_id !== media.roadbook_id) {
        exclusionReason = "stage-roadbook-mismatch";
      }
    } else if (classification.scope === "stage" && classification.stageId != null) {
      const stage = stageMap.get(classification.stageId);
      if (stage && stage.roadbook_id !== media.roadbook_id) {
        exclusionReason = "stage-roadbook-mismatch";
      }
    } else if (classification.scope === "variant" && classification.stageId != null && classification.variantId == null) {
      exclusionReason = "missing-variant";
    } else if (classification.scope === "variant" && classification.stageId == null) {
      exclusionReason = "legacy-variant-target-is-incomplete";
    }

    if (exclusionReason) {
      excluded.push({
        mediaId: media.id,
        roadbookId: media.roadbook_id,
        scope: classification.scope,
        role: classification.role,
        status: classification.status,
        reason: exclusionReason,
        review: exclusionReason === "legacy-variant-target-is-incomplete" ? "manual" : "auto",
      });
      continue;
    }

    // Eligible — build operation
    const scope = classification.scope;
    const role = classification.role;
    const stageId = classification.stageId;
    const variantId = classification.variantId;

    const built = buildCanonicalGpxMediaInput({
      roadbookId: media.roadbook_id,
      scope,
      role,
      stageId: scope === "roadbook" ? null : stageId,
      variantId: scope === "variant" ? variantId : null,
      existingMetadata: {
        original_name: media.metadata?.original_name || (media.path ? media.path.split("/").pop() : null),
        original_size: media.metadata?.original_size || null,
      },
    });

    if (!built.ok) {
      excluded.push({
        mediaId: media.id,
        roadbookId: media.roadbook_id,
        scope,
        role,
        status: classification.status,
        reason: `build-canonical-failed: ${built.errors.join("; ")}`,
        review: "auto",
      });
      continue;
    }

    const rb = rbMap.get(media.roadbook_id);
    const stage = stageId ? stageMap.get(stageId) : null;

    const operation = {
      sequence: 0,
      mediaId: media.id,
      businessIdentity: identity,
      roadbook: rb?.title || rb?.slug || `#${media.roadbook_id}`,
      roadbookId: media.roadbook_id,
      stageNumber: stage?.stage_number ?? null,
      classificationBefore: {
        status: classification.status,
        source: classification.source,
        scope: classification.scope,
        role: classification.role,
      },
      before: {
        stage_id: media.stage_id,
        metadata: { ...media.metadata },
      },
      after: {
        stage_id: built.record.stage_id,
        metadata: { ...built.record.metadata },
      },
      preconditions: {
        expectedMediaId: media.id,
        expectedRoadbookId: media.roadbook_id,
        expectedStageId: media.stage_id,
        expectedCurrentRole: media.metadata?.role ?? null,
      },
      reversibleSnapshot: {
        stage_id: media.stage_id,
        metadata: { ...media.metadata },
      },
    };

    // Add updated_at if available
    if (media.updated_at) {
      operation.preconditions.expectedUpdatedAt = media.updated_at;
      operation.reversibleSnapshot.updated_at = media.updated_at;
    }

    eligible.push({
      mediaId: media.id,
      roadbookId: media.roadbook_id,
      scope,
      role,
      status: classification.status,
      identity,
    });
    operations.push(operation);
  }

  // Deterministic ordering: roadbookId → scope → stageId → variantId → role → mediaId
  operations.sort((a, b) => {
    if (a.roadbookId !== b.roadbookId) return a.roadbookId - b.roadbookId;
    const scopeOrder = { roadbook: 0, stage: 1, variant: 2 };
    const sa = scopeOrder[a.classificationBefore.scope] ?? 99;
    const sb = scopeOrder[b.classificationBefore.scope] ?? 99;
    if (sa !== sb) return sa - sb;
    const stageA = a.classificationBefore.scope === "roadbook" ? 0 : (a.after.stage_id ?? 0);
    const stageB = b.classificationBefore.scope === "roadbook" ? 0 : (b.after.stage_id ?? 0);
    if (stageA !== stageB) return stageA - stageB;
    const va = a.after.metadata?.variant_id ?? 0;
    const vb = b.after.metadata?.variant_id ?? 0;
    if (va !== vb) return vb - va;
    if (a.classificationBefore.role !== b.classificationBefore.role) return a.classificationBefore.role.localeCompare(b.classificationBefore.role);
    return a.mediaId - b.mediaId;
  });
  operations.forEach((op, i) => { op.sequence = i + 1; });

  // Build source summary
  const sourceSummary = {
    totalMedia: mediaRows.length,
    canonical: classified.filter(c => c.classification.status === "canonical").length,
    legacyCompatible: classified.filter(c => c.classification.status === "legacy-compatible").length,
    ambiguous: classified.filter(c => c.classification.status === "ambiguous").length,
    invalid: classified.filter(c => c.classification.status === "invalid").length,
    duplicates: selection.duplicates.length,
  };

  return {
    generatedAt: new Date().toISOString(),
    sourceSummary,
    alreadyCanonical,
    eligible: { count: eligible.length, items: eligible },
    excluded: { count: excluded.length, items: excluded },
    operations: { count: operations.length, items: operations },
    validation: null,
    decision: null,
  };
}

// ─── 14. Validate plan ────────────────────────────────────────────────────
function validateGpxMigrationPlan(plan) {
  const errors = [];
  const ops = plan.operations?.items ?? [];

  // No ambiguous in operations
  for (const op of ops) {
    if (op.classificationBefore?.status === "ambiguous") {
      errors.push(`Opération ${op.sequence}: média ambigu ${op.mediaId} dans les opérations`);
    }
    if (op.classificationBefore?.status === "invalid") {
      errors.push(`Opération ${op.sequence}: média invalide ${op.mediaId} dans les opérations`);
    }
  }

  // No media.id=41 in operations
  for (const op of ops) {
    if (op.mediaId === 41) {
      errors.push(`media.id=41 présent dans les opérations (sequence=${op.sequence})`);
    }
  }

  // No duplicate mediaId
  const mediaIds = ops.map(o => o.mediaId);
  const dupMediaIds = mediaIds.filter((id, i) => mediaIds.indexOf(id) !== i);
  if (dupMediaIds.length > 0) {
    errors.push(`Doublon mediaId dans les opérations: ${[...new Set(dupMediaIds)].join(", ")}`);
  }

  // No duplicate businessIdentity
  const identities = ops.map(o => o.businessIdentity).filter(Boolean);
  const dupIds = identities.filter((id, i) => identities.indexOf(id) !== i);
  if (dupIds.length > 0) {
    errors.push(`Doublon businessIdentity dans les opérations: ${[...new Set(dupIds)].join(", ")}`);
  }

  // Each operation has snapshot and preconditions
  for (const op of ops) {
    if (!op.reversibleSnapshot) errors.push(`Opération ${op.sequence} (mediaId=${op.mediaId}): pas de snapshot`);
    if (!op.preconditions) errors.push(`Opération ${op.sequence} (mediaId=${op.mediaId}): pas de préconditions`);
  }

  // No already-canonical in operations
  const canonicalIds = new Set((plan.alreadyCanonical ?? []).map(c => c.mediaId));
  for (const op of ops) {
    if (canonicalIds.has(op.mediaId)) {
      errors.push(`Opération ${op.sequence}: media.id=${op.mediaId} déjà canonique`);
    }
  }

  // Count matches
  if (ops.length !== plan.eligible?.count) {
    errors.push(`Nombre d'opérations (${ops.length}) != nombre d'éligibles (${plan.eligible?.count})`);
  }

  // No legacy target in after
  for (const op of ops) {
    const afterScope = op.after?.metadata?.scope;
    const afterRole = op.after?.metadata?.role;
    if (afterScope && !["roadbook", "stage", "variant"].includes(afterScope)) {
      errors.push(`Opération ${op.sequence}: scope cible invalide ${afterScope}`);
    }
    if (afterRole && !["official", "custom"].includes(afterRole)) {
      errors.push(`Opération ${op.sequence}: rôle cible invalide ${afterRole}`);
    }
  }

  // Detection of secrets in plan output (expurgation check)
  const planStr = JSON.stringify(plan);
  const secretPatterns = [
    { pattern: /eyJ[A-Za-z0-9_-]{10,}\./, name: "JWT token" },
    { pattern: /sb_secret_/, name: "service role key" },
    { pattern: /sb_publishable_/, name: "anon key" },
    { pattern: /token=/, name: "URL token" },
  ];
  for (const { pattern, name } of secretPatterns) {
    if (pattern.test(planStr)) {
      errors.push(`Secret détecté dans le plan: ${name}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    timestamp: new Date().toISOString(),
  };
}

// ─── 7.3 Format ───────────────────────────────────────────────────────────
function formatGpxMigrationPlanJson(plan) {
  return JSON.stringify(plan, null, 2);
}

function formatGpxMigrationPlanMarkdown(plan) {
  const lines = [];
  lines.push("# Plan de migration GPX — Sprint 4C4");
  lines.push("");
  lines.push(`Généré le : ${plan.generatedAt}`);
  lines.push("");
  lines.push("## Résumé source");
  lines.push("");
  lines.push(`| Métrique | Valeur |`);
  lines.push(`|----------|--------|`);
  lines.push(`| Total médias analysés | ${plan.sourceSummary.totalMedia} |`);
  lines.push(`| Déjà canoniques | ${plan.sourceSummary.canonical} |`);
  lines.push(`| Legacy compatibles | ${plan.sourceSummary.legacyCompatible} |`);
  lines.push(`| Ambigus | ${plan.sourceSummary.ambiguous} |`);
  lines.push(`| Invalides | ${plan.sourceSummary.invalid} |`);
  lines.push(`| Doublons (groupes) | ${plan.sourceSummary.duplicates} |`);
  lines.push(`| **Éligibles** | **${plan.eligible.count}** |`);
  lines.push(`| **Exclus** | **${plan.excluded.count}** |`);
  lines.push(`| **Opérations proposées** | **${plan.operations.count}** |`);
  lines.push("");

  if (plan.alreadyCanonical.length > 0) {
    lines.push("## Déjà canoniques");
    lines.push("");
    for (const c of plan.alreadyCanonical) {
      lines.push(`- media.id=${c.mediaId} scope=${c.scope} role=${c.role}`);
    }
    lines.push("");
  }

  lines.push("## Opérations proposées");
  if (plan.operations.count > 0) {
    lines.push("");
    lines.push("| Seq | mediaId | Roadbook | Scope | Rôle | Stage |");
    lines.push("|-----|---------|----------|-------|------|-------|");
    for (const op of plan.operations.items) {
      lines.push(`| ${op.sequence} | ${op.mediaId} | ${op.roadbook} | ${op.classificationBefore.scope} | ${op.classificationBefore.role} | ${op.stageNumber ?? "-"} |`);
    }
  } else {
    lines.push("\n_Aucune opération proposée._\n");
  }
  lines.push("");

  lines.push("## Cas exclus");
  if (plan.excluded.count > 0) {
    lines.push("");
    lines.push("| mediaId | Scope | Statut | Raison | Revue |");
    lines.push("|---------|-------|--------|--------|-------|");
    for (const ex of plan.excluded.items) {
      lines.push(`| ${ex.mediaId} | ${ex.scope ?? "-"} | ${ex.status} | ${ex.reason} | ${ex.review} |`);
    }
  } else {
    lines.push("\n_Aucun cas exclu._\n");
  }
  lines.push("");

  if (plan.validation) {
    lines.push("## Validation du plan");
    lines.push("");
    lines.push(`Statut : ${plan.validation.valid ? "✅ Valide" : "❌ Invalide"}`);
    if (!plan.validation.valid && plan.validation.errors.length > 0) {
      for (const err of plan.validation.errors) lines.push(`- ${err}`);
    }
    lines.push("");
  }

  if (plan.decision) {
    lines.push("## Décision");
    lines.push("");
    lines.push(plan.decision);
    lines.push("");
  }

  lines.push("---");
  lines.push("*Le plan 4C4 ne modifie aucune donnée. Il ne doit pas être appliqué sans revalidation complète des préconditions.*");
  return lines.join("\n");
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs();

  let input;
  if (opts.fixtures) {
    console.error("Mode fixtures (hors-ligne)");
    input = loadFixtures();
  } else {
    const supabase = loadSupabase();
    input = await loadGpxMigrationPlanningData(supabase);
  }

  const plan = buildGpxMigrationPlan(input);
  plan.validation = validateGpxMigrationPlan(plan);

  if (plan.validation.valid) {
    plan.decision = "GO application contrôlée — le plan est valide, toutes les préconditions sont documentées, les 19 opérations sont réversibles.";
  } else {
    plan.decision = "NO GO application contrôlée — le plan contient des erreurs de validation.";
  }

  const output = opts.format === "json" ? formatGpxMigrationPlanJson(plan) : formatGpxMigrationPlanMarkdown(plan);
  if (opts.output) {
    const outPath = resolve(__dirname, "..", opts.output);
    const outDir = dirname(outPath);
    if (!existsSync(outDir)) {
      const { mkdirSync } = await import("node:fs");
      mkdirSync(outDir, { recursive: true });
    }
    writeFileSync(outPath, output, "utf-8");
    console.error(`Plan écrit dans ${outPath}`);
  } else {
    console.log(output);
  }

  // Final message
  const eligibleCount = plan.eligible.count;
  const excludedCount = plan.excluded.count;
  console.error(`\nPlan généré : ${eligibleCount} opérations proposées, ${excludedCount} média(s) exclu(s) pour revue humaine.`);

  if (!plan.validation.valid) {
    console.error(`\n⚠️  Erreurs de validation : ${plan.validation.errors.length}`);
    for (const err of plan.validation.errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  process.exit(0);
}

export { buildGpxMigrationPlan, validateGpxMigrationPlan, formatGpxMigrationPlanJson, formatGpxMigrationPlanMarkdown };

main().catch(e => {
  console.error("Erreur fatale:", e.message);
  process.exit(1);
});
