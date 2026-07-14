import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGpxBusinessIdentity,
  classifyGpxMedia,
  classifyGpxReferenceUrl,
  isExplorerUsableGpx,
  resolveExplorerGpxUrl,
  selectGpxMedia,
  selectUniqueGpxMedia,
} from "../src/lib/roadbooks/gpx-media.js";
import { loadExplorerGpxMedia } from "../src/lib/roadbooks/loaders.js";

function media(overrides = {}) {
  return {
    id: 1,
    type: "gpx",
    roadbook_id: 4,
    stage_id: null,
    bucket: "roadbook-gpx",
    path: "roadbooks/test/gpx/test.gpx",
    metadata: {},
    ...overrides,
  };
}

function canonical(scope, role, overrides = {}) {
  return media({ metadata: { scope, role }, ...overrides });
}

function fakeSupabase({ inaccessibleIds = [] } = {}) {
  return {
    storage: {
      from() {
        return {
          async createSignedUrl(path) {
            const match = /media-(\d+)/.exec(path);
            const id = match ? Number(match[1]) : null;
            if (inaccessibleIds.includes(id)) return { data: null, error: { message: "signature denied", statusCode: 403 } };
            return { data: { signedUrl: `https://example.test/storage/v1/object/sign/roadbook-gpx/${path}?token=secret-test-token` }, error: null };
          },
        };
      },
    },
  };
}

test("classifie roadbook/official canonique", () => {
  const result = classifyGpxMedia(canonical("roadbook", "official"));
  assert.equal(result.status, "canonical");
  assert.equal(result.scope, "roadbook");
  assert.equal(result.role, "official");
  assert.equal(result.source, "canonical");
});

test("classifie roadbook/custom canonique", () => {
  const result = classifyGpxMedia(canonical("roadbook", "custom"));
  assert.equal(result.status, "canonical");
  assert.equal(result.role, "custom");
});

test("classifie stage/official canonique", () => {
  const result = classifyGpxMedia(canonical("stage", "official", { stage_id: 12 }));
  assert.equal(result.status, "canonical");
  assert.equal(result.stageId, 12);
});

test("classifie variant/official canonique", () => {
  const result = classifyGpxMedia(canonical("variant", "official", {
    stage_id: 12,
    metadata: { scope: "variant", role: "official", variant_id: 34 },
  }));
  assert.equal(result.status, "canonical");
  assert.equal(result.variantId, 34);
});

test("reconnaît gpx-official legacy", () => {
  const result = classifyGpxMedia(media({ metadata: { role: "gpx-official" } }));
  assert.deepEqual([result.status, result.scope, result.role, result.source], ["legacy-compatible", "roadbook", "official", "legacy-role"]);
});

test("reconnaît gpx-total legacy", () => {
  const result = classifyGpxMedia(media({ metadata: { role: "gpx-total" } }));
  assert.deepEqual([result.status, result.scope, result.role], ["legacy-compatible", "roadbook", "custom"]);
});

test("reconnaît gpx-stage legacy avec stage_id", () => {
  const result = classifyGpxMedia(media({ stage_id: 9, metadata: { role: "gpx-stage" } }));
  assert.deepEqual([result.status, result.scope, result.role, result.stageId], ["legacy-compatible", "stage", "official", 9]);
});

test("refuse gpx-stage legacy sans stage_id", () => {
  const result = classifyGpxMedia(media({ metadata: { role: "gpx-stage" } }));
  assert.equal(result.status, "invalid");
  assert.equal(result.reason, "stage-id-is-required");
});

test("gpx-variant legacy incomplet reste ambigu", () => {
  const result = classifyGpxMedia(media({ id: 41, metadata: { role: "gpx-variant" } }));
  assert.equal(result.status, "ambiguous");
  assert.equal(result.reason, "legacy-variant-target-is-incomplete");
  assert.equal(isExplorerUsableGpx(result), false);
});

test("refuse un rôle legacy inconnu", () => {
  const result = classifyGpxMedia(media({ metadata: { role: "gpx-mystery" } }));
  assert.equal(result.status, "invalid");
  assert.equal(result.reason, "unknown-role");
});

test("reste compatible avec scope + gpx_role du Studio V2 existant", () => {
  const result = classifyGpxMedia(media({ stage_id: 7, metadata: { scope: "stage", gpx_role: "official" } }));
  assert.equal(result.status, "legacy-compatible");
  assert.equal(result.source, "legacy-gpx-role");
});

test("refuse un scope canonique inconnu", () => {
  const result = classifyGpxMedia(canonical("journey", "official"));
  assert.equal(result.status, "invalid");
  assert.equal(result.reason, "unknown-scope");
});

test("détecte une contradiction canonique et legacy", () => {
  const result = classifyGpxMedia(media({ stage_id: 3, metadata: { scope: "stage", role: "gpx-official" } }));
  assert.equal(result.status, "invalid");
  assert.equal(result.reason, "canonical-legacy-scope-contradiction");
});

test("détecte une contradiction role et gpx_role", () => {
  const result = classifyGpxMedia(media({ metadata: { scope: "roadbook", role: "official", gpx_role: "custom" } }));
  assert.equal(result.status, "invalid");
  assert.equal(result.reason, "canonical-role-contradiction");
});

test("refuse un média non GPX", () => {
  assert.equal(classifyGpxMedia(media({ type: "image" })).status, "invalid");
});

test("refuse variant_id invalide", () => {
  const result = classifyGpxMedia(canonical("variant", "official", {
    stage_id: 2,
    metadata: { scope: "variant", role: "official", variant_id: -1 },
  }));
  assert.equal(result.status, "invalid");
  assert.equal(result.reason, "variant-id-must-be-positive-integer");
});

test("refuse scope variant sans étape", () => {
  const result = classifyGpxMedia(canonical("variant", "official", {
    metadata: { scope: "variant", role: "official", variant_id: 5 },
  }));
  assert.equal(result.status, "invalid");
  assert.equal(result.reason, "variant-scope-requires-stage-and-variant-id");
});

test("refuse variant_id hors scope variant", () => {
  const result = classifyGpxMedia(canonical("stage", "official", {
    stage_id: 2,
    metadata: { scope: "stage", role: "official", variant_id: 5 },
  }));
  assert.equal(result.status, "invalid");
  assert.equal(result.reason, "variant-id-not-allowed-for-scope");
});

test("construit les trois identités métier sans label", () => {
  const roadbook = classifyGpxMedia(canonical("roadbook", "official"));
  const stage = classifyGpxMedia(canonical("stage", "official", { stage_id: 12 }));
  const variant = classifyGpxMedia(canonical("variant", "official", { stage_id: 12, metadata: { scope: "variant", role: "official", variant_id: 34 } }));
  assert.equal(buildGpxBusinessIdentity(roadbook), "roadbook:4:roadbook:official");
  assert.equal(buildGpxBusinessIdentity(stage), "roadbook:4:stage:12:official");
  assert.equal(buildGpxBusinessIdentity(variant), "roadbook:4:stage:12:variant:34:official");
});

test("détecte deux lignes portant la même identité", () => {
  const rows = [canonical("stage", "official", { id: 1, stage_id: 12 }), canonical("stage", "official", { id: 2, stage_id: 12 })];
  const grouped = selectUniqueGpxMedia(rows);
  assert.equal(grouped.unique.size, 0);
  assert.equal(grouped.duplicates.length, 1);
  assert.equal(selectGpxMedia(rows, { roadbookId: 4, stageId: 12, variantId: null, scope: "stage", role: "official" }).status, "duplicate-identity");
});

test("sélectionne une ligne seulement lorsqu'elle est unique", () => {
  const row = canonical("stage", "official", { id: 9, stage_id: 12 });
  const selected = selectGpxMedia([row], { roadbookId: 4, stageId: 12, variantId: null, scope: "stage", role: "official" });
  assert.equal(selected.status, "selected");
  assert.equal(selected.media.id, 9);
});

test("distingue URL externe et URL Storage signée historique", () => {
  assert.equal(classifyGpxReferenceUrl("https://tracks.example/route.gpx"), "external");
  assert.equal(classifyGpxReferenceUrl("https://project.supabase.co/storage/v1/object/sign/roadbook-gpx/a.gpx?token=x"), "legacy-storage-signed");
});

test("le média signé est prioritaire sur le fallback", () => {
  const resolved = resolveExplorerGpxUrl({ media: { signedUrl: "https://signed.example/current" }, fallbackUrl: "https://tracks.example/fallback.gpx" });
  assert.deepEqual(resolved, { url: "https://signed.example/current", source: "signed-media" });
});

test("conserve une URL externe si le média est inaccessible", () => {
  const resolved = resolveExplorerGpxUrl({ media: { signedUrl: null, access: { status: "inaccessible" } }, fallbackUrl: "https://tracks.example/fallback.gpx" });
  assert.equal(resolved.source, "external-url");
});

test("conserve un ancien fallback Storage", () => {
  const fallback = "https://project.supabase.co/storage/v1/object/sign/roadbook-gpx/a.gpx?token=x";
  const resolved = resolveExplorerGpxUrl({ fallbackUrl: fallback });
  assert.deepEqual(resolved, { url: fallback, source: "legacy-storage-url" });
});

test("le loader signe une sélection unique et la classe par étape", async () => {
  const row = media({ id: 7, stage_id: 12, path: "media-7.gpx", metadata: { role: "gpx-stage" } });
  const loaded = await loadExplorerGpxMedia(fakeSupabase(), [row], { logger: () => {} });
  assert.equal(loaded.gpxByStage[12].id, 7);
  assert.match(loaded.gpxByStage[12].signedUrl, /media-7\.gpx/);
});

test("signature inaccessible journalisée et fallback encore utilisable", async () => {
  const logs = [];
  const row = media({ id: 8, stage_id: 12, path: "media-8.gpx", metadata: { role: "gpx-stage" } });
  const loaded = await loadExplorerGpxMedia(fakeSupabase({ inaccessibleIds: [8] }), [row], { logger: (...args) => logs.push(args) });
  assert.equal(loaded.gpxByStage[12].signedUrl, null);
  assert.equal(resolveExplorerGpxUrl({ media: loaded.gpxByStage[12], fallbackUrl: "legacy/stage.gpx" }).source, "legacy-relative-url");
  assert.equal(logs[0][0], "[gpx-media] signed-url-unavailable");
  assert.equal(JSON.stringify(logs).includes("secret-test-token"), false);
});

test("identité dupliquée non sélectionnée et fallback conservé", async () => {
  const logs = [];
  const rows = [
    media({ id: 10, stage_id: 12, path: "media-10.gpx", metadata: { role: "gpx-stage" } }),
    media({ id: 11, stage_id: 12, path: "media-11.gpx", metadata: { role: "gpx-stage" } }),
  ];
  const loaded = await loadExplorerGpxMedia(fakeSupabase(), rows, { logger: (...args) => logs.push(args) });
  assert.equal(loaded.gpxByStage[12], undefined);
  assert.equal(logs.filter(([event]) => event === "[gpx-media] duplicate-identity").length, 2);
  assert.equal(resolveExplorerGpxUrl({ fallbackUrl: "legacy/stage.gpx" }).url, "legacy/stage.gpx");
});

test("media.id 41 reste ambigu, non signé et non sélectionné", async () => {
  const logs = [];
  const row = media({ id: 41, path: "media-41.gpx", metadata: { role: "gpx-variant" } });
  const loaded = await loadExplorerGpxMedia(fakeSupabase(), [row], { logger: (...args) => logs.push(args) });
  assert.deepEqual(loaded.gpxByVariant, {});
  assert.equal(logs[0][0], "[gpx-media] ambiguous");
  assert.equal(resolveExplorerGpxUrl({ fallbackUrl: "legacy/variant.gpx" }).url, "legacy/variant.gpx");
});

test("les 19 lignes historiques non ambiguës sont classifiables", () => {
  const stageIds = [13, 16, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 17, 18];
  const rows = stageIds.map((stageId, index) => media({ id: 100 + index, roadbook_id: index < 2 ? 5 : index < 12 ? 3 : 4, stage_id: stageId, metadata: { role: "gpx-stage" } }));
  rows.push(media({ id: 43, roadbook_id: 4, metadata: { role: "gpx-official" } }));
  const results = rows.map(classifyGpxMedia);
  assert.equal(results.length, 19);
  assert.equal(results.every(item => item.status === "legacy-compatible" && isExplorerUsableGpx(item)), true);
});
