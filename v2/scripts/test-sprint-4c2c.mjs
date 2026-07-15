/**
 * Sprint 4C2C — Harden Studio GPX media selection
 *
 * Vérifie :
 * - 10.1 : formatGpxUserError
 * - 10.2 : buildGpxPath — variantId supporté
 * - 10.3 : selectUniqueGpxMedia / selectGpxMedia — reloadGpx internes
 * - 10.4 : Global GPX strict — roadbook scope
 * - 10.5 : Stage/variant — canonical/legacy-compatible
 * - 10.6 : Deduplication — selectGpxMedia avant create
 * - 10.7 : replaceGpx / classifyGpxMedia — cohérence
 * - 10.8 : Error wrapping — formatGpxUserError dans catch
 *
 * Usage:
 *   node scripts/test-sprint-4c2c.mjs
 */

import { strict as assert } from "node:assert/strict";
import {
  classifyGpxMedia,
  selectUniqueGpxMedia,
  selectGpxMedia,
  buildGpxBusinessIdentity,
  formatGpxUserError,
} from "../src/lib/roadbooks/gpx-media.js";
import { buildGpxPath } from "../src/lib/roadbooks/validators.js";

let passed = 0, failed = 0;
const failures = [];
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

// ===================== helpers =====================

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

// ===================== 10.1 formatGpxUserError =====================
console.log("=== 10.1 formatGpxUserError ===");

test("null → null", () => {
  assert.equal(formatGpxUserError(null), null);
});

test("undefined → null", () => {
  assert.equal(formatGpxUserError(undefined), null);
});

test("RLS error → permission", () => {
  const msg = formatGpxUserError(new Error("violates row-level security policy"));
  assert.ok(msg.includes("Permission"));
});

test("duplicate key → doublon", () => {
  const msg = formatGpxUserError(new Error("duplicate key value violates unique constraint"));
  assert.ok(msg.includes("existe déjà"));
});

test("JWT expiré → session", () => {
  const msg = formatGpxUserError(new Error("JWT expired"));
  assert.ok(msg.includes("Session"));
});

test("network error → réseau", () => {
  const msg = formatGpxUserError(new Error("fetch failed: NetworkError"));
  assert.ok(msg.includes("réseau"));
});

test("not found → introuvable", () => {
  const msg = formatGpxUserError(new Error("Not found"));
  assert.ok(msg.includes("introuvable"));
});

test("timeout → timeout", () => {
  const msg = formatGpxUserError(new Error("timeout exceeded"));
  assert.ok(msg.includes("trop de temps"));
});

test("fallback par défaut", () => {
  const msg = formatGpxUserError(new Error("bogues inconnus"));
  assert.equal(msg, "Erreur lors de l'opération GPX.");
});

test("fallback personnalisé", () => {
  const msg = formatGpxUserError(new Error("bogues inconnus"), "Fallback perso.");
  assert.equal(msg, "Fallback perso.");
});

test("chaîne nue (pas Error)", () => {
  const msg = formatGpxUserError("timeout exceeded");
  assert.ok(msg.includes("trop de temps"));
});

test("objet Supabase (code + message)", () => {
  const msg = formatGpxUserError({ code: "23505", message: "duplicate key", details: "..." });
  assert.ok(msg.includes("existe déjà"));
});

// ===================== 10.2 buildGpxPath =====================
console.log("\n=== 10.2 buildGpxPath (variantId) ===");

const UID = "user1";
const RB = 42;

test("scope roadbook → chemin roadbook/role/uuid", () => {
  const path = buildGpxPath(UID, RB, "roadbook", "official", null, null);
  assert.ok(path.startsWith(`${UID}/${RB}/roadbook/official/`));
  assert.equal(path.split("/").length, 5);
});

test("scope stage → chemin stages/id/role/uuid", () => {
  const path = buildGpxPath(UID, RB, "stage", "official", 7, null);
  assert.ok(path.startsWith(`${UID}/${RB}/stages/7/official/`));
});

test("scope variant → chemin stages/id/variants/id/role/uuid", () => {
  const path = buildGpxPath(UID, RB, "variant", "official", 7, 3);
  assert.ok(path.startsWith(`${UID}/${RB}/stages/7/variants/3/official/`));
});

test("scope variant sans variantId → erreur", () => {
  assert.throws(() => buildGpxPath(UID, RB, "variant", "custom", 7, null), /gpx-path-variant-id-required/);
});

test("scope variant sans stageId → erreur", () => {
  assert.throws(() => buildGpxPath(UID, RB, "variant", "official", null, 3), /gpx-path-stage-id-required/);
});

test("scope stage sans stageId → erreur", () => {
  assert.throws(() => buildGpxPath(UID, RB, "stage", "official", null, null), /gpx-path-stage-id-required/);
});

// ===================== 10.3 selectUniqueGpxMedia / selectGpxMedia =====================
console.log("\n=== 10.3 selectUniqueGpxMedia / selectGpxMedia ===");

const RBID = 1, sid = 10, vid = 20;

test("selectUniqueGpxMedia: canonical roadbook", () => {
  const a = makeMedia(1);
  const b = makeMedia(2, { id: 2, metadata: { scope: "roadbook", role: "custom" } });
  const result = selectUniqueGpxMedia([a, b]);
  // 2 lignes classifiées
  assert.equal(result.classified.length, 2);
  // 2 identités uniques
  assert.equal(result.unique.size, 2);
  // Pas de doublons
  assert.equal(result.duplicates.length, 0);
});

test("selectUniqueGpxMedia: ignore les non-gpx", () => {
  const gpx = makeMedia(1);
  const img = { id: 2, type: "image", roadbook_id: 1, metadata: {} };
  const result = selectUniqueGpxMedia([gpx, img]);
  // img n'a pas d'identité (pas gpx)
  assert.equal(result.classified.length, 2);
  // seule la ligne gpx a une identité
  assert.equal(result.unique.size, 1);
});

test("selectGpxMedia roadbook official → selected", () => {
  const official = makeMedia(1);
  const custom = makeMedia(2, { metadata: { scope: "roadbook", role: "custom" } });
  const result = selectGpxMedia([official, custom], { roadbookId: RBID, scope: "roadbook", role: "official" });
  assert.equal(result.status, "selected");
  assert.equal(result.media.id, 1);
});

test("selectGpxMedia roadbook custom → selected", () => {
  const official = makeMedia(1);
  const custom = makeMedia(2, { metadata: { scope: "roadbook", role: "custom" } });
  const result = selectGpxMedia([official, custom], { roadbookId: RBID, scope: "roadbook", role: "custom" });
  assert.equal(result.status, "selected");
  assert.equal(result.media.id, 2);
});

test("selectGpxMedia stage → selected", () => {
  const stage = makeMedia(3, { stage_id: sid, metadata: { scope: "stage", role: "official" } });
  const other = makeMedia(4, { stage_id: 99, metadata: { scope: "stage", role: "official" } });
  const result = selectGpxMedia([stage, other], { roadbookId: RBID, scope: "stage", role: "official", stageId: sid });
  assert.equal(result.status, "selected");
  assert.equal(result.media.id, 3);
});

test("selectGpxMedia variant → selected", () => {
  const variant = makeMedia(5, { stage_id: sid, metadata: { scope: "variant", role: "official", variant_id: vid } });
  const other = makeMedia(6, { stage_id: sid, metadata: { scope: "variant", role: "official", variant_id: 99 } });
  const result = selectGpxMedia([variant, other], { roadbookId: RBID, scope: "variant", role: "official", stageId: sid, variantId: vid });
  assert.equal(result.status, "selected");
  assert.equal(result.media.id, 5);
});

test("selectGpxMedia manquant → missing", () => {
  const a = makeMedia(1);
  const result = selectGpxMedia([a], { roadbookId: RBID, scope: "stage", role: "official", stageId: 99 });
  assert.equal(result.status, "missing");
  assert.equal(result.media, null);
});

// ===================== 10.4 Global GPX strict =====================
console.log("\n=== 10.4 Global GPX strict (roadbook scope only) ===");

test("selectGpxMedia roadbook scope trouve uniquement roadbook", () => {
  const stage = makeMedia(7, { stage_id: sid, metadata: { scope: "stage", role: "official" } });
  const roadbook = makeMedia(8);
  const result = selectGpxMedia([stage, roadbook], { roadbookId: RBID, scope: "roadbook", role: "official" });
  assert.equal(result.status, "selected");
  assert.equal(result.media.id, 8);
});

test("selectUniqueGpxMedia sépare roadbook et stage", () => {
  const stage = makeMedia(7, { stage_id: sid, metadata: { scope: "stage", role: "official" } });
  const roadbook = makeMedia(8);
  const result = selectUniqueGpxMedia([stage, roadbook]);
  assert.equal(result.unique.size, 2);
  // Vérifie que les identités sont différentes
  const identities = [...result.unique.keys()];
  assert.ok(identities.some(i => i.includes("roadbook:")));
  assert.ok(identities.some(i => i.includes("stage:")));
});

// ===================== 10.5 Stage/variant selection =====================
console.log("\n=== 10.5 Stage/variant: canonical/legacy-compatible seulement ===");

test("classifyGpxMedia stage canonical", () => {
  const valid = makeMedia(10, { stage_id: sid, metadata: { scope: "stage", role: "official" } });
  const c = classifyGpxMedia(valid);
  assert.equal(c.status, "canonical");
  assert.equal(c.scope, "stage");
});

test("selectUniqueGpxMedia ne garde que canonical/legacy-compatible", () => {
  // Un média invalide n'aura pas d'identité
  const invalid = makeMedia(99, { type: "gpx", metadata: {} });
  const valid = makeMedia(10, { stage_id: sid, metadata: { scope: "stage", role: "official" } });
  const result = selectUniqueGpxMedia([invalid, valid]);
  assert.equal(result.unique.size, 1);
  const entry = result.unique.values().next().value;
  assert.equal(entry.media.id, 10);
});

// ===================== 10.6 Deduplication =====================
console.log("\n=== 10.6 Deduplication (selectGpxMedia avant create) ===");

test("selectGpxMedia détecte doublon roadbook", () => {
  const existing = makeMedia(1);
  const result = selectGpxMedia([existing], { roadbookId: RBID, scope: "roadbook", role: "official" });
  assert.equal(result.status, "selected");
  assert.equal(result.media.id, 1);
});

test("selectGpxMedia pas de doublon si scope/rôle diffèrent", () => {
  const custom = makeMedia(2, { metadata: { scope: "roadbook", role: "custom" } });
  const result = selectGpxMedia([custom], { roadbookId: RBID, scope: "roadbook", role: "official" });
  assert.equal(result.status, "missing");
});

test("selectGpxMedia stage dedup", () => {
  const a = makeMedia(3, { stage_id: sid, metadata: { scope: "stage", role: "official" } });
  const result = selectGpxMedia([a], { roadbookId: RBID, scope: "stage", role: "official", stageId: sid });
  assert.equal(result.status, "selected");
  assert.equal(result.media.id, 3);
});

test("selectGpxMedia stage pas dedup si stageId diff", () => {
  const a = makeMedia(3, { stage_id: sid, metadata: { scope: "stage", role: "official" } });
  const result = selectGpxMedia([a], { roadbookId: RBID, scope: "stage", role: "official", stageId: 99 });
  assert.equal(result.status, "missing");
});

test("selectGpxMedia variant dedup", () => {
  const a = makeMedia(4, { stage_id: sid, metadata: { scope: "variant", role: "official", variant_id: vid } });
  const result = selectGpxMedia([a], { roadbookId: RBID, scope: "variant", role: "official", stageId: sid, variantId: vid });
  assert.equal(result.status, "selected");
  assert.equal(result.media.id, 4);
});

test("selectGpxMedia variant pas dedup si variantId diff", () => {
  const a = makeMedia(4, { stage_id: sid, metadata: { scope: "variant", role: "official", variant_id: vid } });
  const result = selectGpxMedia([a], { roadbookId: RBID, scope: "variant", role: "official", stageId: sid, variantId: 99 });
  assert.equal(result.status, "missing");
});

// ===================== 10.7 replaceGpx consistency =====================
console.log("\n=== 10.7 replaceGpx consistency (classifyGpxMedia) ===");

test("classifyGpxMedia canonical → status canonical", () => {
  const m = makeMedia(1);
  const c = classifyGpxMedia(m);
  assert.equal(c.status, "canonical");
});

test("classifyGpxMedia roadbook sans stageId ok", () => {
  const m = makeMedia(1);
  const c = classifyGpxMedia(m);
  assert.equal(c.scope, "roadbook");
  assert.equal(c.stageId, null);
});

test("classifyGpxMedia roadbook avec stage_id → refusé", () => {
  const m = makeMedia(1, { stage_id: 5 });
  const c = classifyGpxMedia(m);
  assert.equal(c.reason, "roadbook-scope-must-not-have-stage-id");
});

test("classifyGpxMedia stage valide", () => {
  const m = makeMedia(2, { stage_id: sid, metadata: { scope: "stage", role: "official" } });
  const c = classifyGpxMedia(m);
  assert.equal(c.status, "canonical");
  assert.equal(c.scope, "stage");
  assert.equal(c.stageId, sid);
});

test("classifyGpxMedia variant valide", () => {
  const m = makeMedia(3, { stage_id: sid, metadata: { scope: "variant", role: "official", variant_id: vid } });
  const c = classifyGpxMedia(m);
  assert.equal(c.status, "canonical");
  assert.equal(c.scope, "variant");
  assert.equal(c.stageId, sid);
  assert.equal(c.variantId, vid);
});

test("classifyGpxMedia variant sans variant_id → échec", () => {
  const m = makeMedia(4, { stage_id: sid, metadata: { scope: "variant", role: "official" } });
  const c = classifyGpxMedia(m);
  assert.ok(["variant-scope-requires-stage-and-variant-id", "variant-id-must-be-positive-integer"].includes(c.reason));
});

test("classifyGpxMedia variant sans stage_id → échec", () => {
  const m = makeMedia(5, { stage_id: null, metadata: { scope: "variant", role: "official", variant_id: vid } });
  const c = classifyGpxMedia(m);
  assert.ok(c.reason.includes("variant"));
});

test("classifyGpxMedia gpx_role seul sans role → invalide", () => {
  const m = makeMedia(6, { metadata: { gpx_role: "official", scope: "roadbook" } });
  const c = classifyGpxMedia(m);
  assert.equal(c.status, "invalid");
  assert.equal(c.reason, "scope-and-role-are-required");
});

test("classifyGpxMedia legacy role string gpx-stage → invalide", () => {
  const m = makeMedia(7, { metadata: { role: "gpx-stage", gpx_role: "official", scope: "stage" }, stage_id: sid });
  const c = classifyGpxMedia(m);
  assert.equal(c.status, "invalid");
  assert.equal(c.reason, "unknown-role");
});

test("buildGpxBusinessIdentity canonical → identité", () => {
  const m = makeMedia(1);
  const c = classifyGpxMedia(m);
  const id = buildGpxBusinessIdentity(c);
  assert.ok(id);
  assert.ok(id.includes("roadbook:1:roadbook:official"));
});

test("buildGpxBusinessIdentity invalid → null", () => {
  const m = makeMedia(1, { metadata: {} });
  const c = classifyGpxMedia(m);
  const id = buildGpxBusinessIdentity(c);
  assert.equal(id, null);
});

// ===================== 10.8 Error wrapping =====================
console.log("\n=== 10.8 Error wrapping (formatGpxUserError dans catch) ===");

test("catch RLS → Permission", async () => {
  const simulate = async () => {
    try { throw new Error("new row violates row-level security"); }
    catch (e) { return formatGpxUserError(e); }
  };
  assert.ok((await simulate()).includes("Permission"));
});

test("catch duplicate key", async () => {
  const simulate = async () => {
    try { throw new Error("duplicate key value"); }
    catch (e) { return formatGpxUserError(e); }
  };
  assert.ok((await simulate()).includes("existe déjà"));
});

test("catch network error", async () => {
  const simulate = async () => {
    try { throw new Error("NetworkError: Failed to fetch"); }
    catch (e) { return formatGpxUserError(e); }
  };
  assert.ok((await simulate()).includes("réseau"));
});

test("catch fallback personnalisé", async () => {
  const simulate = async () => {
    try { throw new Error("Erreur bizarre"); }
    catch (e) { return formatGpxUserError(e, "Action échouée."); }
  };
  assert.equal(await simulate(), "Action échouée.");
});

test("catch fallback défaut", async () => {
  const simulate = async () => {
    try { throw new Error("Erreur bizarre"); }
    catch (e) { return formatGpxUserError(e); }
  };
  assert.equal(await simulate(), "Erreur lors de l'opération GPX.");
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
  else console.log(`\n\u2705 Tests Sprint 4C2C réussis.`);
}

main().catch(e => { console.error(e); process.exit(1); });
