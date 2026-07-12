/**
 * Sprint 18D — Tests déterministes unitaires
 *
 * Vérifie la logique métier sans dépendance à la base ni au navigateur :
 * - Contrôle optimiste (conditional update)
 * - Snapshot et détection de changement
 * - Verrou et expiration
 * - Génération des clés de brouillon
 * - Isolation utilisateur dans localStorage
 * - Restauration nouveau roadbook
 * - Revalidation sécurisée (schéma)
 * - Conflit distant (détection)
 *
 * Usage:
 *   node scripts/test-sprint-18d.mjs
 */

import { strict as assert } from "node:assert";
import { randomBytes } from "node:crypto";

// --- Mock minimal de localStorage ---
const store = new Map();
global.localStorage = {
  getItem(k) { return store.get(k) ?? null; },
  setItem(k, v) { store.set(String(k), String(v)); },
  removeItem(k) { store.delete(k); },
  clear() { store.clear(); },
  get length() { return store.size; },
  key(i) { return [...store.keys()][i] ?? null; },
};

// --- Imports des modules métier ---
const syncHelpers = await import("../src/lib/sync-helpers.js");
const drafts = await import("../src/lib/studio-drafts.js");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}

function testAsync(name, fn) {
  return (async () => {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}: ${err.message}`);
      failed++;
    }
  })();
}

// ============================================================
// 1. Snapshot
// ============================================================
console.log("\n=== 1. Snapshot ===");

test("takeSnapshot capture updated_at", () => {
  const s = syncHelpers.takeSnapshot({
    roadbookId: 42,
    roadbook: { updated_at: "2026-07-12T10:00:00Z" },
    stages: [{ id: 1 }],
    poisByStage: { 1: [{ id: 10 }] },
    variantsByStage: {},
  });
  assert.equal(s.updatedAt, "2026-07-12T10:00:00Z");
  assert.equal(s.roadbookId, 42);
  assert.equal(s.stages.length, 1);
});

test("hasStateChangedSinceSnapshot detecte changement updated_at", () => {
  const snap = { roadbook: { updated_at: "2026-07-12T10:00:00Z" }, stages: [] };
  const cur = { roadbook: { updated_at: "2026-07-12T11:00:00Z" }, stages: [] };
  assert.ok(syncHelpers.hasStateChangedSinceSnapshot(snap, cur));
});

test("hasStateChangedSinceSnapshot detecte stage count change", () => {
  const snap = { roadbook: { updated_at: "2026-07-12T10:00:00Z" }, stages: [{ id: 1 }] };
  const cur = { roadbook: { updated_at: "2026-07-12T10:00:00Z" }, stages: [{ id: 1 }, { id: 2 }] };
  assert.ok(syncHelpers.hasStateChangedSinceSnapshot(snap, cur));
});

test("hasStateChangedSinceSnapshot retourne false pour etat identique", () => {
  const snap = { roadbook: { updated_at: "2026-07-12T10:00:00Z" }, stages: [{ id: 1 }], poisByStage: { 1: [{ id: 10 }] }, variantsByStage: {} };
  const cur = { roadbook: { updated_at: "2026-07-12T10:00:00Z" }, stages: [{ id: 1 }], poisByStage: { 1: [{ id: 10 }] }, variantsByStage: {} };
  assert.ok(!syncHelpers.hasStateChangedSinceSnapshot(snap, cur));
});

test("hasStateChangedSinceSnapshot retourne true pour snapshot null", () => {
  assert.ok(syncHelpers.hasStateChangedSinceSnapshot(null, {}));
});

// ============================================================
// 2. Conditional update (mock supabase)
// ============================================================
console.log("\n=== 2. Conditional update ===");

test("conditionalUpdateRoadbook echoue sans supabase", async () => {
  const r = await syncHelpers.conditionalUpdateRoadbook(null, 1, {}, "2026-07-12T10:00:00Z");
  assert.equal(r.ok, false);
  assert.equal(r.error, "no_supabase");
});

test("conditionalUpdateRoadbook echoue sans version", async () => {
  const mock = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => ({ data: { updated_at: "2026-07-12T10:00:00Z" }, error: null }) }) }),
      update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: () => ({}) }) }) }) }),
    }),
  };
  const r = await syncHelpers.conditionalUpdateRoadbook(mock, 1, {}, null);
  assert.equal(r.ok, false);
  assert.equal(r.error, "no_version");
});

test("conditionalUpdateRoadbook retourne conflit si data null", async () => {
  let callCount = 0;
  const maybeSingleForFetch = () => {
    callCount++;
    if (callCount === 1) return { data: { updated_at: "2026-07-12T10:00:00Z" }, error: null };
    return { data: { updated_at: "2026-07-12T12:00:00Z" }, error: null };
  };
  const mockSupabase = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleForFetch }) }),
      update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: () => ({}) }) }) }) }),
    }),
  };
  const r = await syncHelpers.conditionalUpdateRoadbook(mockSupabase, 1, {}, "2026-07-12T10:00:00Z");
  assert.equal(r.ok, false);
  assert.equal(r.error, "conflict");
  assert.ok(r.remoteUpdatedAt);
});

test("conditionalUpdateRoadbook retourne succes si data trouvee", async () => {
  const mock = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: () => ({ data: { updated_at: "2026-07-12T10:00:00Z" }, error: null }) }) }),
      update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ maybeSingle: () => ({ data: { id: 1, updated_at: "2026-07-12T11:00:00Z" }, error: null }) }) }) }) }),
    }),
  };
  const r = await syncHelpers.conditionalUpdateRoadbook(mock, 1, { title: "test" }, "2026-07-12T10:00:00Z");
  assert.equal(r.ok, true);
  assert.equal(r.data.id, 1);
});

// ============================================================
// 3. Verrou synchronisation
// ============================================================
console.log("\n=== 3. Sync lock ===");

test("acquireSyncLockWithTabId acquiert le verrou", () => {
  store.clear();
  const r = syncHelpers.acquireSyncLockWithTabId(1, "tab-a");
  assert.equal(r.ok, true);
});

test("acquireSyncLockWithTabId refuse un second tabId", () => {
  store.clear();
  syncHelpers.acquireSyncLockWithTabId(1, "tab-a");
  const r = syncHelpers.acquireSyncLockWithTabId(1, "tab-b");
  assert.equal(r.ok, false);
  assert.equal(r.error, "locked");
});

test("acquireSyncLockWithTabId permet au meme tabId de reprendre", () => {
  store.clear();
  syncHelpers.acquireSyncLockWithTabId(1, "tab-a");
  const r = syncHelpers.acquireSyncLockWithTabId(1, "tab-a");
  assert.equal(r.ok, true);
});

test("releaseSyncLock ne libere que le bon tabId", () => {
  store.clear();
  syncHelpers.acquireSyncLockWithTabId(1, "tab-a");
  syncHelpers.releaseSyncLock(1, "tab-b");
  const lock = JSON.parse(localStorage.getItem("roadbook-explorer:lock:1"));
  assert.ok(lock);
  syncHelpers.releaseSyncLock(1, "tab-a");
  assert.equal(localStorage.getItem("roadbook-explorer:lock:1"), null);
});

test("cleanupStaleLocks supprime les verrous expires", () => {
  store.clear();
  const past = Date.now() - 20_000;
  localStorage.setItem("roadbook-explorer:lock:1", JSON.stringify({ tabId: "tab-a", timestamp: past }));
  syncHelpers.cleanupStaleLocks(1);
  assert.equal(localStorage.getItem("roadbook-explorer:lock:1"), null);
});

// ============================================================
// 4. Clés de brouillon et isolation utilisateur
// ============================================================
console.log("\n=== 4. Draft keys & user isolation ===");

test("getDraftKey inclut userId", () => {
  const key = drafts.getDraftKey("user-1", 42);
  assert.ok(key.includes("user-1"));
  assert.ok(key.includes("42"));
});

test("getNewDraftKey inclut new:{localId}", () => {
  const key = drafts.getNewDraftKey("user-1", "abc-123");
  assert.ok(key.includes("new:abc-123"));
});

test("deux utilisateurs ont des clés differentes", () => {
  const k1 = drafts.getDraftKey("user-a", 42);
  const k2 = drafts.getDraftKey("user-b", 42);
  assert.notEqual(k1, k2);
});

test("validateDraft accepte un brouillon valide", () => {
  const ok = drafts.validateDraft({
    version: 1,
    userId: "u1",
    roadbookId: 42,
    savedAt: "2026-07-12T10:00:00Z",
    payload: { title: "Test" },
  });
  assert.equal(ok, true);
});

test("validateDraft rejette un brouillon sans payload", () => {
  const ok = drafts.validateDraft({
    version: 1,
    userId: "u1",
    roadbookId: 42,
    savedAt: "2026-07-12T10:00:00Z",
  });
  assert.equal(ok, false);
});

test("validateDraft rejette une version incorrecte", () => {
  const ok = drafts.validateDraft({
    version: 999,
    userId: "u1",
    roadbookId: 42,
    savedAt: "2026-07-12T10:00:00Z",
    payload: { title: "Test" },
  });
  assert.equal(ok, false);
});

// ============================================================
// 5. Sauvegarde et restauration nouveau roadbook
// ============================================================
console.log("\n=== 5. New roadbook draft ===");

test("saveNewDraft et loadNewDraft preservent les donnees", () => {
  store.clear();
  const payload = drafts.buildNewDraftPayload({
    userId: "u1", localDraftId: "test-1", tabId: "tab-1",
    title: "Mon roadbook", description: "Description", isPublic: true,
  });
  drafts.saveNewDraft("u1", "test-1", payload);
  const loaded = drafts.loadNewDraft("u1", "test-1");
  assert.ok(loaded);
  assert.equal(loaded.payload.title, "Mon roadbook");
  assert.equal(loaded.payload.isPublic, true);
});

test("migrateNewDraftKey transfere la clef", () => {
  store.clear();
  const payload = drafts.buildNewDraftPayload({
    userId: "u1", localDraftId: "test-2", tabId: "tab-1",
    title: "Apres creation", description: "", isPublic: false,
  });
  drafts.saveNewDraft("u1", "test-2", payload);
  drafts.migrateNewDraftKey("u1", "test-2", 99);
  const newKeyExists = localStorage.getItem(drafts.getNewDraftKey("u1", "test-2"));
  assert.equal(newKeyExists, null);
  const migrated = drafts.loadDraft("u1", 99);
  assert.ok(migrated);
  assert.equal(migrated.roadbookId, 99);
  assert.equal(migrated.payload.title, "Apres creation");
});

test("loadNewDraft ne recharge pas le brouillon d'un autre userId", () => {
  store.clear();
  const payload = drafts.buildNewDraftPayload({
    userId: "u1", localDraftId: "test-3", tabId: "tab-1",
    title: "User A", description: "", isPublic: false,
  });
  drafts.saveNewDraft("u1", "test-3", payload);
  const loaded = drafts.loadNewDraft("u2", "test-3");
  assert.equal(loaded, null);
});

// ============================================================
// 6. Brouillons existants
// ============================================================
console.log("\n=== 6. Existing drafts ===");

test("saveDraft et loadDraft fonctionnent", () => {
  store.clear();
  const payload = {
    version: 1, userId: "u1", roadbookId: 42,
    savedAt: new Date().toISOString(), tabId: "tab-1",
    payload: { title: "Test", stages: [] },
  };
  drafts.saveDraft("u1", 42, payload);
  const loaded = drafts.loadDraft("u1", 42);
  assert.ok(loaded);
  assert.equal(loaded.payload.title, "Test");
});

test("listUserDrafts ne retourne que les brouillons de l'utilisateur", () => {
  store.clear();
  const d1 = { version: 1, userId: "u1", roadbookId: 1, savedAt: new Date().toISOString(), payload: {} };
  const d2 = { version: 1, userId: "u2", roadbookId: 2, savedAt: new Date().toISOString(), payload: {} };
  const d3 = { version: 1, userId: "u1", roadbookId: 3, savedAt: new Date().toISOString(), payload: {} };
  drafts.saveDraft("u1", 1, d1);
  drafts.saveDraft("u2", 2, d2);
  drafts.saveDraft("u1", 3, d3);
  const list = drafts.listUserDrafts("u1");
  assert.equal(list.length, 2);
  assert.equal(list[0].userId, "u1");
  assert.equal(list[1].userId, "u1");
});

test("isDraftNewerThanRemote compare les dates", () => {
  const draft = { savedAt: "2026-07-12T12:00:00Z" };
  assert.ok(drafts.isDraftNewerThanRemote(draft, "2026-07-12T10:00:00Z"));
  assert.ok(!drafts.isDraftNewerThanRemote(draft, "2026-07-12T14:00:00Z"));
  assert.ok(!drafts.isDraftNewerThanRemote(null, null));
});

// ============================================================
// 7. verifyAfterSync
// ============================================================
console.log("\n=== 7. verifyAfterSync ===");

test("verifyAfterSync echoue sans params", async () => {
  const r = await syncHelpers.verifyAfterSync(null, null, null);
  assert.equal(r.ok, false);
});

test("verifyAfterSync detecte mauvais stage count", async () => {
  const mockSupabase = {
    from(t) {
      if (t === "roadbooks") return { select() { return { eq() { return { maybeSingle() { return { data: { id: 1, updated_at: "x" }, error: null } } } } } } };
      if (t === "stages") return { select() { return { eq() { return { data: [{ id: 1 }], error: null } } } } };
    },
  };
  const r = await syncHelpers.verifyAfterSync(mockSupabase, 1, { stages: [{ id: 1 }, { id: 2 }] });
  assert.equal(r.ok, false);
  assert.ok(r.issues.length > 0);
});

test("verifyAfterSync reussit si stage count correspond", async () => {
  const mockSupabase = {
    from(t) {
      if (t === "roadbooks") return { select() { return { eq() { return { maybeSingle() { return { data: { id: 1, updated_at: "x" }, error: null } } } } } } };
      if (t === "stages") return { select() { return { eq() { return { data: [{ id: 1 }, { id: 2 }], error: null } } } } };
    },
  };
  const r = await syncHelpers.verifyAfterSync(mockSupabase, 1, { stages: [{ id: 1 }, { id: 2 }] });
  assert.equal(r.ok, true);
});

// ============================================================
// 8. Export
// ============================================================
console.log("\n=== 8. Draft export ===");

test("exportDraftToJSON genere un Blob", () => {
  store.clear();
  const payload = { version: 1, userId: "u1", roadbookId: 42, savedAt: new Date().toISOString(), tabId: "t1", payload: { title: "Export test" } };
  drafts.saveDraft("u1", 42, payload);
  const blob = drafts.exportDraftToJSON("u1", 42);
  assert.ok(blob);
  assert.ok(blob instanceof Blob);
});

// ============================================================
// 9. Sanitize next path
// ============================================================
console.log("\n=== 9. Sanitize next path ===");

const { sanitizeNextPath } = await import("../src/lib/sanitize-next.js");

test("sanitizeNextPath accepte un chemin interne", () => {
  assert.equal(sanitizeNextPath("/dashboard/roadbooks/123"), "/dashboard/roadbooks/123");
});

test("sanitizeNextPath rejette les URL absolues", () => {
  assert.equal(sanitizeNextPath("https://evil.com"), "/dashboard");
});

test("sanitizeNextPath rejette les protocoles relatifs", () => {
  assert.equal(sanitizeNextPath("//evil.com"), "/dashboard");
});

test("sanitizeNextPath rejette javascript:", () => {
  assert.equal(sanitizeNextPath("javascript:alert(1)"), "/dashboard");
});

test("sanitizeNextPath rejette les valeurs non-strings", () => {
  assert.equal(sanitizeNextPath(null), "/dashboard");
  assert.equal(sanitizeNextPath(undefined), "/dashboard");
  assert.equal(sanitizeNextPath(123), "/dashboard");
});

// ============================================================
// Resume
// ============================================================
console.log("\n=== Resultat ===\n");
console.log(`  ${passed} OK, ${failed} echec(s)`);
if (failed > 0) {
  console.log("\n⚠ Certains tests ont echoue.");
  process.exit(1);
} else {
  console.log("\n✅ Tests Sprint 18D reussis.");
}
