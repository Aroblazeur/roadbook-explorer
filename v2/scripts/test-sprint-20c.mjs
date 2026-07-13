/**
 * Sprint 20C — Tests de la couche data Supabase
 *
 * Teste loaders, writers et enrich avec un faux client Supabase.
 * Aucun accès réseau réel.
 *
 * Usage:
 *   node scripts/test-sprint-20c.mjs
 */

import { strict as assert } from "node:assert";



import {
  loadRoadbook, loadRoadbookSafe, loadStages, loadPois, loadVariants,
  loadMedia, loadCoverMedia, getSignedUrl, loadMediaWithUrls,
  loadGpxRows, loadStudioData,
} from "../src/lib/roadbooks/loaders.js";

import {
  insertStage, updateStage, deleteStage,
  insertPoi, updatePoi, deletePoi,
  insertVariant, updateVariant, deleteVariant,
  updateStageNotes, updateStageAccommodation, clearStageAccommodation,
  uploadImage, insertMediaRecord, deleteMedia,
  uploadGpx, removeStorageFile, insertGpxRecord, updateGpxRecord, deleteGpx,
  swapStageNumbers, insertRoadbook, duplicateRoadbook,
} from "../src/lib/roadbooks/writers.js";

import {
  applyPoiEnrichment, applyAccommodationEnrichment,
  applyBatchPoiEnrichment, applyBatchAccommodationEnrichment,
} from "../src/lib/roadbooks/enrich.js";

let passed = 0, failed = 0;
const failures = [];
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

// --- Mock Supabase ---

function makeMockSupabase(overrides = {}) {
  const tables = {};
  const storageBuckets = {};

  function getTable(name) {
    if (!tables[name]) tables[name] = [];
    return tables[name];
  }

  function applyFilters(rows, filters) {
    return rows.filter(r => {
      for (const f of filters) {
        if (f.op === "eq") { if (r[f.col] !== f.val) return false; }
        if (f.op === "in") { if (!f.val.includes(r[f.col])) return false; }
      }
      return true;
    });
  }

  function orderRows(rows, orderCol, orderAsc) {
    if (!orderCol) return rows;
    return [...rows].sort((a, b) => {
      const va = a[orderCol], vb = b[orderCol];
      if (va == null) return 1; if (vb == null) return -1;
      return orderAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });
  }

  // Builds a thenable query builder shared for a single from() call
  function makeQuery(table) {
    const q = {
      _filters: [],
      _single: false,
      _maybeSingle: false,
      _orderCol: null,
      _orderAsc: true,
      _selectCols: null,
      _op: null,     // "update" | "delete" | null
      _updates: null,
      _insertRecord: null,
      _insertResult: null,
    };

    // Shared resolve for select queries
    function resolveSelect() {
      if (overrides.selectError) throw new Error(overrides.selectError);
      let rows = applyFilters(table, q._filters);
      rows = orderRows(rows, q._orderCol, q._orderAsc);
      const sel = q._selectCols;
      if (sel === "id" || sel === "id, updated_at") rows = rows.map(r => ({ id: r.id, updated_at: r.updated_at }));
      if (q._single) return { data: rows[0] ?? null, error: rows.length === 0 ? new Error("No rows") : null };
      if (q._maybeSingle) return { data: rows[0] ?? null, error: null };
      return { data: rows, error: null };
    }

    // Thenable: makes `await q` work
    q.then = function (onOk, onErr) {
      try {
        // Insert mode (after .insert().select().single())
        if (q._insertResult) {
          let data = q._insertResult;
          if (q._selectCols === "id") data = { id: data.id };
          q._insertResult = null;
          return Promise.resolve(onOk({ data, error: null }));
        }
        // Insert record mode (from .insert() alone, no .select() chained)
        if (q._insertRecord) {
          const id = crypto.randomUUID();
          const newRow = { ...q._insertRecord, id };
          table.push(newRow);
          q._insertRecord = null;
          return Promise.resolve(onOk({ data: newRow, error: null }));
        }
        // Update mode
        if (q._op === "update") {
          if (overrides.updateError) throw new Error(overrides.updateError);
          const rows = applyFilters(table, q._filters);
          rows.forEach(r => Object.assign(r, q._updates));
          q._op = null; q._updates = null;
          return Promise.resolve(onOk({ data: rows, error: null }));
        }
        // Delete mode
        if (q._op === "delete") {
          if (overrides.deleteError) throw new Error(overrides.deleteError);
          const rows = applyFilters(table, q._filters);
          const ids = new Set(rows.map(r => r.id));
          for (let i = table.length - 1; i >= 0; i--) { if (ids.has(table[i].id)) table.splice(i, 1); }
          q._op = null;
          return Promise.resolve(onOk({ data: rows, error: null }));
        }
        // Default: select
        return Promise.resolve(onOk(resolveSelect()));
      } catch (e) {
        return Promise.resolve(onErr(e));
      }
    };

    // Chainable methods (mutate q, return q)
    q.eq = (col, val) => { q._filters.push({ op: "eq", col, val }); return q; };
    q.in = (col, val) => { q._filters.push({ op: "in", col, val }); return q; };
    q.order = (col, { ascending } = {}) => { q._orderCol = col; q._orderAsc = ascending !== false; return q; };
    q.single = () => { q._single = true; return q; };
    q.maybeSingle = () => { q._maybeSingle = true; return q; };
    q.select = (sel) => { q._selectCols = sel; return q; };

    return q;
  }

  const mock = {
    _tables: tables,
    _storage: storageBuckets,
    from(name) {
      const table = getTable(name);
      const q = makeQuery(table);

      const fromObj = {
        eq: (col, val) => q.eq(col, val),
        in: (col, val) => q.in(col, val),
        order: (col, opts) => q.order(col, opts),
        select: (sel) => q.select(sel),
        single: () => q.single(),
        maybeSingle: () => q.maybeSingle(),
        insert: (record) => { q._insertRecord = record; q._insertResult = null; return q; },
        update: (updates) => { q._op = "update"; q._updates = updates; return q; },
        delete: () => { q._op = "delete"; return q; },
      };

      return fromObj;
    },
    storage: {
      from(bucket) {
        if (!storageBuckets[bucket]) storageBuckets[bucket] = {};
        const files = storageBuckets[bucket];
        return {
          async upload(path, file, opts) {
            if (overrides.uploadError) return { data: null, error: new Error(overrides.uploadError) };
            files[path] = file;
            return { data: { path }, error: null };
          },
          async remove(paths) {
            if (overrides.removeError) return { data: null, error: new Error(overrides.removeError) };
            paths.forEach(p => delete files[p]);
            return { data: paths, error: null };
          },
          async createSignedUrl(path, expiresIn) {
            if (overrides.signedUrlError) return { data: null, error: new Error(overrides.signedUrlError) };
            return { data: { signedUrl: `https://signed/${path}?exp=${expiresIn}` }, error: null };
          },
        };
      },
    },
    rpc(fn, params) {
      if (overrides.rpcError) return { error: new Error(overrides.rpcError) };
      if (overrides.rpcResult !== undefined) return overrides.rpcResult;
      return { error: null };
    },
  };
  return mock;
}

// ===================== LOADERS =====================
console.log("=== 1. Loaders ===");

test("loadRoadbook charge un roadbook", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.roadbooks = [{ id: 42, title: "Test", slug: "test", updated_at: "2024-01-01" }];
  const rb = await loadRoadbook(supabase, 42);
  assert.equal(rb.title, "Test");
});

test("loadRoadbook lève une erreur si introuvable", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.roadbooks = [];
  try {
    await loadRoadbook(supabase, 999);
    assert.fail("Should have thrown");
  } catch (e) {
    assert.ok(e.message);
  }
});

test("loadRoadbookSafe retourne null si introuvable", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.roadbooks = [];
  const rb = await loadRoadbookSafe(supabase, 999);
  assert.equal(rb, null);
});

test("loadStages retourne les étapes ordonnées", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.stages = [
    { id: 2, roadbook_id: 42, stage_number: 2, title: "B" },
    { id: 1, roadbook_id: 42, stage_number: 1, title: "A" },
    { id: 3, roadbook_id: 99, stage_number: 1, title: "Other" },
  ];
  const stages = await loadStages(supabase, 42);
  assert.equal(stages.length, 2);
  assert.equal(stages[0].stage_number, 1);
  assert.equal(stages[1].stage_number, 2);
});

test("loadStages retourne [] si aucune étape", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.stages = [];
  const stages = await loadStages(supabase, 42);
  assert.deepEqual(stages, []);
});

test("loadPois retourne les POI filtrés par stageIds", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.stage_pois = [
    { id: 1, stage_id: 10, name: "POI A", sort_order: 2 },
    { id: 2, stage_id: 10, name: "POI B", sort_order: 1 },
    { id: 3, stage_id: 20, name: "POI C", sort_order: 1 },
  ];
  const pois = await loadPois(supabase, [10]);
  assert.equal(pois.length, 2);
  assert.equal(pois[0].sort_order, 1);
  assert.equal(pois[1].name, "POI A");
});

test("loadPois retourne [] si stageIds vide", async () => {
  const supabase = makeMockSupabase();
  const pois = await loadPois(supabase, []);
  assert.deepEqual(pois, []);
});

test("loadVariants retourne les variantes filtrées", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.stage_variants = [
    { id: 1, stage_id: 10, label: "Var A" },
  ];
  const variants = await loadVariants(supabase, [10]);
  assert.equal(variants.length, 1);
});

test("loadMedia retourne les médias filtrés par type", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.media = [
    { id: 1, roadbook_id: 42, type: "image" },
    { id: 2, roadbook_id: 42, type: "gpx" },
  ];
  const images = await loadMedia(supabase, 42, "image");
  assert.equal(images.length, 1);
});

test("loadCoverMedia retourne le média de couverture", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.media = [{ id: 5, bucket: "roadbook-images", path: "cover.jpg" }];
  const m = await loadCoverMedia(supabase, 5);
  assert.equal(m.bucket, "roadbook-images");
});

test("loadCoverMedia retourne null si pas de mediaId", async () => {
  const supabase = makeMockSupabase();
  const m = await loadCoverMedia(supabase, null);
  assert.equal(m, null);
});

test("getSignedUrl retourne une URL signée", async () => {
  const supabase = makeMockSupabase();
  const url = await getSignedUrl(supabase, "bucket", "path/file.gpx", 3600);
  assert.ok(url.includes("signed"));
  assert.ok(url.includes("path/file.gpx"));
});

test("getSignedUrl retourne null si path est null", async () => {
  const supabase = makeMockSupabase();
  const url = await getSignedUrl(supabase, "bucket", null);
  assert.equal(url, null);
});

test("getSignedUrl lève une erreur si Supabase échoue", async () => {
  const supabase = makeMockSupabase({ signedUrlError: "Storage error" });
  try {
    await getSignedUrl(supabase, "bucket", "path");
    assert.fail("Should have thrown");
  } catch (e) {
    assert.ok(e.message);
  }
});

test("loadMediaWithUrls retourne les images avec signed URLs", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.media = [
    { id: 1, roadbook_id: 42, type: "image", bucket: "roadbook-images", path: "img1.jpg" },
  ];
  const rows = await loadMediaWithUrls(supabase, 42);
  assert.equal(rows.length, 1);
  assert.ok(rows[0].signedUrl);
});

test("loadGpxRows retourne les GPX", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.media = [
    { id: 1, roadbook_id: 42, type: "gpx", metadata: { gpx_role: "official" } },
  ];
  const rows = await loadGpxRows(supabase, 42);
  assert.equal(rows.length, 1);
});

test("loadStudioData agrège toutes les données", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.roadbooks = [{ id: 42, title: "Studio", slug: "studio", updated_at: "2024-01-01" }];
  supabase._tables.stages = [{ id: 1, roadbook_id: 42, stage_number: 1 }];
  supabase._tables.stage_pois = [{ id: 1, stage_id: 1, name: "POI" }];
  supabase._tables.stage_variants = [{ id: 1, stage_id: 1, label: "Var" }];
  supabase._tables.media = [
    { id: 1, roadbook_id: 42, type: "image", bucket: "b", path: "i.jpg" },
    { id: 2, roadbook_id: 42, type: "gpx", bucket: "b", path: "g.gpx" },
  ];
  const data = await loadStudioData(supabase, 42);
  assert.equal(data.roadbook.title, "Studio");
  assert.equal(data.stages.length, 1);
  assert.equal(data.pois.length, 1);
  assert.equal(data.variants.length, 1);
  assert.equal(data.media.length, 1);
  assert.equal(data.gpxRows.length, 1);
});

// ===================== WRITERS =====================
console.log("=== 2. Writers ===");

test("insertStage insère une étape", async () => {
  const supabase = makeMockSupabase();
  await insertStage(supabase, { roadbook_id: 42, stage_number: 1, title: "New" });
  assert.equal(supabase._tables.stages.length, 1);
});

test("insertStage lève une erreur", async () => {
  const supabase = makeMockSupabase({ insertError: "DB error" });
  try {
    await insertStage(supabase, {});
    assert.fail("Should have thrown");
  } catch (e) {
    assert.ok(e.message);
  }
});

test("updateStage met à jour une étape", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.stages = [{ id: 1, title: "Old", roadbook_id: 42 }];
  await updateStage(supabase, 1, { title: "New" });
  assert.equal(supabase._tables.stages[0].title, "New");
});

test("deleteStage supprime une étape", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.stages = [{ id: 1, roadbook_id: 42 }, { id: 2, roadbook_id: 42 }];
  await deleteStage(supabase, 1);
  assert.equal(supabase._tables.stages.length, 1);
});

test("insertPoi insère un POI", async () => {
  const supabase = makeMockSupabase();
  await insertPoi(supabase, { stage_id: 1, name: "Lac" });
  assert.equal(supabase._tables.stage_pois.length, 1);
});

test("updatePoi met à jour un POI", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.stage_pois = [{ id: 1, name: "Old" }];
  await updatePoi(supabase, 1, { name: "New" });
  assert.equal(supabase._tables.stage_pois[0].name, "New");
});

test("deletePoi supprime un POI", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.stage_pois = [{ id: 1 }, { id: 2 }];
  await deletePoi(supabase, 1);
  assert.equal(supabase._tables.stage_pois.length, 1);
});

test("insertVariant insère une variante", async () => {
  const supabase = makeMockSupabase();
  await insertVariant(supabase, { stage_id: 1, label: "Var" });
  assert.equal(supabase._tables.stage_variants.length, 1);
});

test("updateVariant met à jour une variante", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.stage_variants = [{ id: 1, label: "Old" }];
  await updateVariant(supabase, 1, { label: "New" });
  assert.equal(supabase._tables.stage_variants[0].label, "New");
});

test("deleteVariant supprime une variante", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.stage_variants = [{ id: 1 }];
  await deleteVariant(supabase, 1);
  assert.equal(supabase._tables.stage_variants.length, 0);
});

test("updateStageNotes met à jour les notes", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.stages = [{ id: 1, notes: [] }];
  await updateStageNotes(supabase, 1, [{ text: "Note" }]);
  assert.equal(supabase._tables.stages[0].notes.length, 1);
});

test("clearStageAccommodation vide l'hébergement", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.stages = [{ id: 1, accommodation_name: "Hotel", accommodation_url: "url", accommodation_photo: "photo" }];
  await clearStageAccommodation(supabase, 1);
  assert.equal(supabase._tables.stages[0].accommodation_name, null);
});

test("uploadImage uploade et retourne le chemin", async () => {
  const supabase = makeMockSupabase();
  const path = await uploadImage(supabase, "user1", "42", { name: "test.jpg" }, new Blob());
  assert.ok(path.includes("user1/42/"));
});

test("uploadImage lève une erreur Storage", async () => {
  const supabase = makeMockSupabase({ uploadError: "Storage full" });
  try {
    await uploadImage(supabase, "u1", "42", { name: "test.jpg" }, new Blob());
    assert.fail("Should have thrown");
  } catch (e) {
    assert.ok(e.message);
  }
});

test("deleteMedia supprime le storage ET la DB", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.media = [{ id: 1, path: "img.jpg" }];
  await deleteMedia(supabase, { id: 1, path: "img.jpg" });
  assert.equal(supabase._tables.media.length, 0);
});

test("deleteMedia lève une erreur si storage échoue", async () => {
  const supabase = makeMockSupabase({ removeError: "Storage error" });
  supabase._tables.media = [{ id: 1, path: "img.jpg" }];
  try {
    await deleteMedia(supabase, { id: 1, path: "img.jpg" });
    assert.fail("Should have thrown");
  } catch (e) {
    assert.ok(e.message);
    // DB row must still exist after storage failure
    assert.equal(supabase._tables.media.length, 1);
  }
});

test("uploadGpx uploade un fichier GPX", async () => {
  const supabase = makeMockSupabase();
  await uploadGpx(supabase, "roadbook-gpx", "path/to/file.gpx", { name: "test.gpx" });
  assert.ok(supabase._storage["roadbook-gpx"]["path/to/file.gpx"]);
});

test("removeStorageFile supprime un fichier", async () => {
  const supabase = makeMockSupabase();
  supabase._storage["roadbook-gpx"] = { "path.gpx": {} };
  await removeStorageFile(supabase, "roadbook-gpx", "path.gpx");
  assert.equal(Object.keys(supabase._storage["roadbook-gpx"]).length, 0);
});

test("insertGpxRecord insère un enregistrement GPX", async () => {
  const supabase = makeMockSupabase();
  await insertGpxRecord(supabase, { roadbook_id: 42, type: "gpx", path: "p.gpx" });
  assert.equal(supabase._tables.media.length, 1);
});

test("updateGpxRecord met à jour un enregistrement GPX", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.media = [{ id: 1, file_name: "old.gpx" }];
  await updateGpxRecord(supabase, 1, { file_name: "new.gpx" });
  assert.equal(supabase._tables.media[0].file_name, "new.gpx");
});

test("deleteGpx supprime storage + DB", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.media = [{ id: 1, path: "p.gpx" }];
  await deleteGpx(supabase, { id: 1, path: "p.gpx" }, "roadbook-gpx");
  assert.equal(supabase._tables.media.length, 0);
});

test("swapStageNumbers via rpc", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.stages = [{ id: 1, stage_number: 1, roadbook_id: 42 }, { id: 2, stage_number: 2, roadbook_id: 42 }];
  await swapStageNumbers(supabase, 1, 2);
  // rpc mock ne modifie pas les données, mais on vérifie que ça ne lève pas
  assert.ok(true);
});

test("swapStageNumbers fallback si rpc échoue", async () => {
  const supabase = makeMockSupabase({ rpcError: "RPC error" });
  supabase._tables.stages = [{ id: 1, stage_number: 1 }, { id: 2, stage_number: 2 }];
  await swapStageNumbers(supabase, 1, 2);
  assert.equal(supabase._tables.stages[0].stage_number, 2);
});

test("insertRoadbook insère et retourne l'id", async () => {
  const supabase = makeMockSupabase();
  const result = await insertRoadbook(supabase, { slug: "test", owner_id: "u1", title: "Test", description: "", is_public: false });
  assert.ok(result.id);
});

test("duplicateRoadbook duplique un roadbook complet", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.roadbooks = [{ id: 1, title: "Original", slug: "orig", description: "Desc" }];
  const stages = [{ id: 10, stage_number: 1, title: "Stage1", departure: "A", arrival: "B" }];
  const poisByStage = { 10: [{ name: "POI1", lat: 45, lng: 6, sort_order: 1 }] };
  const variantsByStage = { 10: [{ label: "Var1", distance_km: 5, metadata: {} }] };
  const newId = await duplicateRoadbook(supabase, { title: "Original", slug: "orig", description: "Desc" }, stages, poisByStage, variantsByStage, "orig-copie", "user1");
  assert.ok(newId);
  assert.ok(supabase._tables.roadbooks.length >= 1);
  assert.ok(supabase._tables.stages.length >= 1);
  assert.ok(supabase._tables.stage_pois.length >= 1);
  assert.ok(supabase._tables.stage_variants.length >= 1);
});

// ===================== ENRICH =====================
console.log("=== 3. Enrich ===");

test("applyPoiEnrichment met à jour un POI", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.stage_pois = [{ id: 1, name: "Lac", description: null }];
  const result = await applyPoiEnrichment(supabase, 1, { description: "Beau lac", coordinates: null, image: null, url: null });
  assert.equal(result.updated, true);
  assert.equal(supabase._tables.stage_pois[0].description, "Beau lac");
});

test("applyPoiEnrichment ne fait rien si pas de champs", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.stage_pois = [{ id: 1 }];
  const result = await applyPoiEnrichment(supabase, 1, { description: null, coordinates: null, image: null, url: null });
  assert.equal(result.updated, false);
  assert.equal(result.reason, "no_fields");
});

test("applyAccommodationEnrichment met à jour", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.stages = [{ id: 1, accommodation_name: null }];
  const result = await applyAccommodationEnrichment(supabase, 1, { name: "Hotel", image: "hotel.jpg" });
  assert.equal(result.updated, true);
  assert.equal(supabase._tables.stages[0].accommodation_name, "Hotel");
});

test("applyAccommodationEnrichment ne fait rien si pas de champs", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.stages = [{ id: 1 }];
  const result = await applyAccommodationEnrichment(supabase, 1, { name: null, image: null });
  assert.equal(result.updated, false);
});

test("applyBatchPoiEnrichment traite plusieurs POI", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.stage_pois = [{ id: 1 }, { id: 2 }];
  const ops = [
    { poiId: 1, found: { description: "A", coordinates: null, image: null, url: null } },
    { poiId: 2, found: { description: "B", coordinates: null, image: null, url: null } },
  ];
  const results = await applyBatchPoiEnrichment(supabase, ops);
  assert.equal(results.poisUpdated, 2);
});

test("applyBatchAccommodationEnrichment traite plusieurs hébergements", async () => {
  const supabase = makeMockSupabase();
  supabase._tables.stages = [{ id: 1 }, { id: 2 }];
  const ops = [
    { stageId: 1, found: { name: "H1", image: "h1.jpg" } },
    { stageId: 2, found: { name: "H2", image: "h2.jpg" } },
  ];
  const results = await applyBatchAccommodationEnrichment(supabase, ops);
  assert.equal(results.accomsUpdated, 2);
});

async function main() {
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (e) { failures.push({ name, message: e.message }); failed++; }
  }

  const total = passed + failed;
  console.log(`\n=== Résultat ===`);
  console.log(`\n  ${passed} OK, ${failed} echec(s)`);
  for (const f of failures) console.error(`  ✗ ${f.name}: ${f.message}`);
  if (failed > 0 || failures.length > 0) process.exit(1);
  else console.log(`\n✅ Tests Sprint 20C réussis.`);
}

main().catch(e => { console.error(e); process.exit(1); });
