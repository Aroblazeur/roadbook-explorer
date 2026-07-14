import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildPoiImportKey,
  buildVariantImportKey,
  hasSameImportedContent,
  loadExistingChildren,
  persistImportedChild,
  resolveImportedChild,
  sourcePois,
  validateV1Source,
  variantScope,
  withImportKey,
} from "./lib/import-v1-idempotency.mjs";

const POI_PRESENCE = {
  fields: ["name", "lat", "lng", "poi_type", "description", "link_url", "region", "sort_order"],
  metadataFields: ["source", "status", "fromVariant"],
};
const VARIANT_PRESENCE = {
  fields: [
    "label", "distance_km", "description", "sort_order", "departure", "arrival",
    "elevation_gain_m", "elevation_loss_m", "map_embed_url", "notes",
  ],
  metadataFields: [
    "type", "itemType", "hierarchyLevel", "enabled", "legacyAccommodation",
    "accommodation", "alternativeAccommodationName", "alternativeAccommodationPhoto",
    "departure", "arrival", "elevation_gain_m", "elevation_loss_m", "map_embed_url", "notes",
  ],
};

function fakeSupabase(initial = {}) {
  const tables = {
    stage_pois: structuredClone(initial.stage_pois ?? []),
    stage_variants: structuredClone(initial.stage_variants ?? []),
  };
  const calls = [];
  let nextId = Math.max(0, ...Object.values(tables).flat().map(row => Number(row.id) || 0)) + 1;

  return {
    tables,
    calls,
    from(table) {
      return {
        select() {
          return {
            eq(field, value) {
              return {
                async order(orderField, { ascending }) {
                  calls.push({ operation: "select", table, field, value, orderField });
                  const data = tables[table]
                    .filter(row => row[field] === value)
                    .sort((a, b) => ascending ? a[orderField] - b[orderField] : b[orderField] - a[orderField]);
                  return { data: structuredClone(data), error: null };
                },
              };
            },
          };
        },
        insert(payload) {
          return {
            select() {
              return {
                async single() {
                  calls.push({ operation: "insert", table, payload });
                  const row = { id: nextId++, ...structuredClone(payload) };
                  tables[table].push(row);
                  return { data: structuredClone(row), error: null };
                },
              };
            },
          };
        },
        update(update) {
          return {
            async eq(field, value) {
              calls.push({ operation: "update", table, field, value, update });
              const row = tables[table].find(item => item[field] === value);
              if (row) Object.assign(row, structuredClone(update));
              return { error: null };
            },
          };
        },
      };
    },
  };
}

function poiPayload({ stageId = 7, stageNumber = 2, name = "Belvédère", variant = null, description = "Vue", link = null } = {}) {
  const scope = variant ? variantScope(variant) : "stage";
  const metadata = variant ? { fromVariant: variant } : {};
  return {
    stage_id: stageId,
    name,
    lat: null,
    lng: null,
    poi_type: null,
    description,
    photo_url: "source/photo.jpg",
    link_url: link,
    region: null,
    sort_order: 0,
    metadata: withImportKey(metadata, buildPoiImportKey(stageNumber, name, scope), `poi-${name}`),
  };
}

function variantPayload({ stageId = 7, stageNumber = 2, label = "Version courte", description = "Variante", order = 1 } = {}) {
  return {
    stage_id: stageId,
    label,
    distance_km: 12,
    gpx_url: "source/variant.gpx",
    description,
    sort_order: order,
    departure: "Départ",
    arrival: "Arrivée",
    elevation_gain_m: 120,
    elevation_loss_m: 80,
    map_embed_url: "https://maps.test/embed",
    notes: [{ text: "Note" }],
    metadata: withImportKey({ type: "option", notes: [] }, buildVariantImportKey(stageNumber, { name: label }), "substep-42"),
  };
}

test("l'identité POI combine étape, portée et nom normalisé", () => {
  assert.equal(buildPoiImportKey(2, "  Belvédère ", "STAGE"), "stage:2:poi:stage:belvédère");
  assert.notEqual(
    buildPoiImportKey(2, "Belvédère", "stage"),
    buildPoiImportKey(2, "Belvédère", variantScope("Variante A")),
  );
  assert.notEqual(
    buildPoiImportKey(2, "Belvédère", variantScope("Variante A")),
    buildPoiImportKey(2, "Belvédère", variantScope("Variante B")),
  );
});

test("l'identité variante combine étape et libellé, sans ID Supabase ni ordre", () => {
  assert.equal(
    buildVariantImportKey(3, { id: "source-a", name: " Version courte " }),
    buildVariantImportKey(3, { id: "source-b", name: "version COURTE" }),
  );
  assert.notEqual(buildVariantImportKey(3, { name: "Version courte" }), buildVariantImportKey(4, { name: "Version courte" }));
});

test("l'identifiant V1 explicite reste une métadonnée de traçabilité", () => {
  const metadata = withImportKey({}, "business-key", "source-17");
  assert.equal(metadata.v1ImportKey, "business-key");
  assert.equal(metadata.v1ImportSource, "v1");
  assert.equal(metadata.v1SourceId, "source-17");
});

test("les listes POI historiques sont des alias et non trois sources distinctes", () => {
  const canonical = [{ name: "A" }];
  assert.deepEqual(sourcePois({ pois: canonical, pointsOfInterest: [{ name: "A" }], interest: [{ name: "A" }, { name: "B" }] }), [{ name: "A" }, { name: "B" }]);
  assert.deepEqual(validateV1Source([{ stage: 1, pois: canonical, pointsOfInterest: [{ name: "A" }] }]), []);
  assert.equal(validateV1Source([{ stage: 1, pois: [{ name: "A", description: "un" }], pointsOfInterest: [{ name: "A", description: "deux" }] }]).length, 1);
});

test("les doublons POI et variantes dans la source produisent des conflits explicites", () => {
  const conflicts = validateV1Source([{
    stage: 1,
    pois: [{ name: "Lac" }, { name: " lac " }],
    substeps: [
      { name: "Option", pois: [{ name: "Plage" }, { name: "PLAGE" }] },
      { name: " option ", pois: [] },
    ],
  }]);
  assert.equal(conflicts.length, 3);
  assert.match(conflicts.join("\n"), /POI dupliqué "lac"/);
  assert.match(conflicts.join("\n"), /variante dupliquée "option"/);
  assert.match(conflicts.join("\n"), /POI dupliqué "plage"/);
});

test("un même nom POI reste autorisé dans des portées différentes", () => {
  assert.deepEqual(validateV1Source([{
    stage: 1,
    pois: [{ name: "Belvédère" }],
    substeps: [
      { name: "A", pois: [{ name: "Belvédère" }] },
      { name: "B", pois: [{ name: "Belvédère" }] },
    ],
  }]), []);
});

test("une ligne V1 historique explicitement marquée est reconnue sans clé stable", () => {
  const payload = poiPayload();
  const legacy = { ...payload, id: 1, photo_url: "signed/photo.jpg", metadata: { source: "v1-import" } };
  const presence = { fields: POI_PRESENCE.fields, metadataFields: [] };
  const resolution = resolveImportedChild({ table: "stage_pois", rows: [legacy], payload, presence });
  assert.equal(resolution.status, "unchanged");
  assert.equal(resolution.provenance, "legacy-marker");
});

test("une ligne Studio homonyme strictement identique reste de provenance ambiguë", async () => {
  const payload = poiPayload();
  const studio = { ...payload, id: 9, metadata: {} };
  const supabase = fakeSupabase({ stage_pois: [studio] });
  const result = await persistImportedChild({
    supabase, table: "stage_pois", payload, presence: POI_PRESENCE, existingRows: [studio], upsert: true,
  });
  assert.equal(result.action, "conflict");
  assert.equal(result.reason, "ambiguous-provenance");
  assert.equal(supabase.calls.length, 0);
});

test("une ligne non marquée et identique ne prouve jamais une provenance V1", () => {
  const payload = variantPayload();
  const unmarked = { ...payload, id: 8, metadata: { type: "option", notes: [] } };
  const resolution = resolveImportedChild({
    table: "stage_variants", rows: [unmarked], payload, presence: VARIANT_PRESENCE,
  });
  assert.equal(resolution.status, "conflict");
  assert.equal(resolution.reason, "ambiguous-provenance");
});

test("une ligne portant une autre clé stable ne correspond jamais par fallback", () => {
  const payload = variantPayload();
  const other = { ...payload, id: 3, metadata: withImportKey({ type: "option", notes: [] }, "different-key") };
  const resolution = resolveImportedChild({ table: "stage_variants", rows: [other], payload, presence: VARIANT_PRESENCE });
  assert.equal(resolution.status, "conflict");
  assert.equal(resolution.reason, "different-import-key");
});

test("deux lignes existantes avec la même identité métier produisent un conflit explicite", () => {
  const payload = poiPayload();
  const rows = [
    { ...payload, id: 1 },
    { ...payload, id: 2, metadata: { source: "v1-import" } },
  ];
  const resolution = resolveImportedChild({
    table: "stage_pois", rows, payload, presence: POI_PRESENCE,
  });
  assert.equal(resolution.status, "conflict");
  assert.equal(resolution.reason, "duplicate-business-identity");
});

test("sans upsert, un contenu V1 modifié produit un conflit sans écriture", async () => {
  const payload = poiPayload({ description: "Nouveau" });
  const existing = { ...payload, id: 1, description: "Ancien", photo_url: "signed/photo.jpg" };
  const supabase = fakeSupabase({ stage_pois: [existing] });
  const result = await persistImportedChild({
    supabase, table: "stage_pois", payload, presence: POI_PRESENCE, existingRows: [existing], upsert: false,
  });
  assert.equal(result.action, "conflict");
  assert.equal(result.reason, "source-content-changed");
  assert.equal(supabase.calls.length, 0);
});

test("avec upsert, seuls les champs V1 sont mis à jour et le média signé est conservé", async () => {
  const payload = poiPayload({ description: "Nouveau", link: "https://source.test" });
  const existing = { ...payload, id: 1, description: "Ancien", link_url: null, photo_url: "signed/photo.jpg", metadata: { ...payload.metadata, studioExtra: "keep" } };
  const supabase = fakeSupabase({ stage_pois: [existing] });
  const cache = [structuredClone(existing)];
  const result = await persistImportedChild({
    supabase, table: "stage_pois", payload, presence: POI_PRESENCE, existingRows: cache, upsert: true,
  });
  assert.equal(result.action, "updated");
  assert.equal(supabase.tables.stage_pois[0].description, "Nouveau");
  assert.equal(supabase.tables.stage_pois[0].link_url, "https://source.test");
  assert.equal(supabase.tables.stage_pois[0].photo_url, "signed/photo.jpg");
  assert.equal(supabase.tables.stage_pois[0].metadata.studioExtra, "keep");
});

test("un upsert préserve latitude et description Studio absentes de la source V1", async () => {
  const payload = poiPayload({ description: null, link: "https://source.test/nouveau" });
  const existing = {
    ...payload,
    id: 11,
    lat: 48.123,
    description: "Description Studio",
    link_url: "https://source.test/ancien",
    photo_url: "signed/photo.jpg",
    metadata: { ...payload.metadata, studioExtra: "keep" },
  };
  const presence = { fields: ["name", "link_url", "sort_order"], metadataFields: [] };
  const supabase = fakeSupabase({ stage_pois: [existing] });
  const result = await persistImportedChild({
    supabase, table: "stage_pois", payload, presence, existingRows: [structuredClone(existing)], upsert: true,
  });
  assert.equal(result.action, "updated");
  assert.equal(supabase.tables.stage_pois[0].lat, 48.123);
  assert.equal(supabase.tables.stage_pois[0].description, "Description Studio");
  assert.equal(supabase.tables.stage_pois[0].link_url, "https://source.test/nouveau");
  assert.equal(supabase.tables.stage_pois[0].photo_url, "signed/photo.jpg");
  assert.equal(supabase.tables.stage_pois[0].metadata.studioExtra, "keep");
});

test("un champ explicitement vide dans V1 peut être effacé avec upsert", async () => {
  const payload = poiPayload({ description: null });
  const existing = { ...payload, id: 12, description: "À effacer" };
  const presence = { fields: ["name", "description", "sort_order"], metadataFields: [] };
  const supabase = fakeSupabase({ stage_pois: [existing] });
  const result = await persistImportedChild({
    supabase, table: "stage_pois", payload, presence, existingRows: [structuredClone(existing)], upsert: true,
  });
  assert.equal(result.action, "updated");
  assert.equal(supabase.tables.stage_pois[0].description, null);
});

test("l'upsert contrôlé d'une variante conserve son GPX et sa photo migrés", async () => {
  const payload = variantPayload({ description: "Nouvelle description" });
  const existing = {
    ...payload,
    id: 5,
    description: "Ancienne description",
    departure: "Ancien départ",
    gpx_url: "signed/variant.gpx",
    metadata: { ...payload.metadata, stagePhoto: "signed/photo.jpg" },
  };
  const supabase = fakeSupabase({ stage_variants: [existing] });
  const result = await persistImportedChild({
    supabase,
    table: "stage_variants",
    payload,
    presence: VARIANT_PRESENCE,
    existingRows: [structuredClone(existing)],
    upsert: true,
  });
  assert.equal(result.action, "updated");
  assert.equal(supabase.tables.stage_variants[0].description, "Nouvelle description");
  assert.equal(supabase.tables.stage_variants[0].departure, "Départ");
  assert.equal(supabase.tables.stage_variants[0].gpx_url, "signed/variant.gpx");
  assert.equal(supabase.tables.stage_variants[0].metadata.stagePhoto, "signed/photo.jpg");
});

test("le contenu contrôlé ignore les URLs médias gérées par la migration média", () => {
  const payload = variantPayload();
  const stored = { ...payload, gpx_url: "signed/variant.gpx", metadata: { ...payload.metadata, stagePhoto: "signed/photo.jpg" } };
  assert.equal(hasSameImportedContent("stage_variants", stored, payload, VARIANT_PRESENCE), true);
});

async function importChildrenOnce(supabase, stageId, payloads, upsert) {
  const loaded = await loadExistingChildren(supabase, stageId);
  assert.equal(loaded.poisError, null);
  assert.equal(loaded.variantsError, null);
  return Promise.all([
    persistImportedChild({ supabase, table: "stage_pois", payload: payloads.mainPoi, presence: POI_PRESENCE, existingRows: loaded.pois, upsert }),
    persistImportedChild({ supabase, table: "stage_variants", payload: payloads.variant, presence: VARIANT_PRESENCE, existingRows: loaded.variants, upsert }),
    persistImportedChild({ supabase, table: "stage_pois", payload: payloads.variantPoi, presence: POI_PRESENCE, existingRows: loaded.pois, upsert }),
  ]);
}

test("le flux Supabase complet est idempotent avec et sans upsert et quel que soit l'ordre DB", async () => {
  const supabase = fakeSupabase();
  const payloads = {
    mainPoi: poiPayload({ name: "Principal" }),
    variant: variantPayload({ label: "Option" }),
    variantPoi: poiPayload({ name: "Dans option", variant: "Option" }),
  };
  assert.deepEqual((await importChildrenOnce(supabase, 7, payloads, false)).map(result => result.action), ["inserted", "inserted", "inserted"]);
  supabase.tables.stage_pois.reverse();
  assert.deepEqual((await importChildrenOnce(supabase, 7, payloads, false)).map(result => result.action), ["skipped", "skipped", "skipped"]);
  supabase.tables.stage_pois.reverse();
  assert.deepEqual((await importChildrenOnce(supabase, 7, payloads, true)).map(result => result.action), ["skipped", "skipped", "skipped"]);
  assert.equal(supabase.tables.stage_pois.length, 2);
  assert.equal(supabase.tables.stage_variants.length, 1);
});

test("un nouveau POI et une nouvelle variante sont encore insérés", async () => {
  const supabase = fakeSupabase();
  const loaded = await loadExistingChildren(supabase, 7);
  const poi = await persistImportedChild({
    supabase, table: "stage_pois", payload: poiPayload({ name: "Nouveau" }), presence: POI_PRESENCE, existingRows: loaded.pois,
  });
  const variant = await persistImportedChild({
    supabase, table: "stage_variants", payload: variantPayload({ label: "Nouvelle" }), presence: VARIANT_PRESENCE, existingRows: loaded.variants,
  });
  assert.equal(poi.action, "inserted");
  assert.equal(variant.action, "inserted");
});

test("le script réel valide la source avant toute écriture enfant et transporte la présence", () => {
  const source = fs.readFileSync(new URL("./import-v1-roadbook.js", import.meta.url), "utf8");
  assert.match(source, /validateV1Source\(v1\.stages \|\| \[\]\)/);
  assert.match(source, /loadExistingChildren\(supabase, stageId\)/);
  assert.match(source, /presence: poiPresence/);
  assert.match(source, /presence: variantPresence/);
  assert.equal(source.includes('supabase.from("stage_pois").insert'), false);
  assert.equal(source.includes('supabase.from("stage_variants").insert'), false);
  const validationCall = source.indexOf("const sourceConflicts = validateV1Source(");
  const firstChildWrite = source.indexOf("const poiResult = await persistImportedChild(");
  assert.ok(validationCall >= 0);
  assert.ok(firstChildWrite >= 0);
  assert.ok(validationCall < firstChildWrite);
});
