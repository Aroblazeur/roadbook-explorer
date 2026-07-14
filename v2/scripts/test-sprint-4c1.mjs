import assert from "node:assert/strict";
import crypto from "node:crypto";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  MEDIA_SIGNED_URL_TTL_SECONDS,
  getSignedMediaAccess,
  loadMediaWithUrls,
} from "../src/lib/roadbooks/loaders.js";
import {
  createMediaWithUpload,
  uploadGpx,
} from "../src/lib/roadbooks/writers.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
dotenv.config({ path: path.join(root, ".env.local") });
const { Client } = pg;

function fakeSupabase(initialRows = [], options = {}) {
  const rows = structuredClone(initialRows);
  const calls = [];
  let nextId = Math.max(0, ...rows.map(row => Number(row.id) || 0)) + 1;

  function from(table) {
    assert.equal(table, "media");
    let operation = "select";
    let payload = null;
    const filters = [];

    const matchingRows = () => rows.filter(row => filters.every(([field, value]) => row[field] === value));
    const result = () => {
      if (operation === "insert") {
        const row = { id: nextId++, ...structuredClone(payload) };
        rows.push(row);
        calls.push({ operation: "media-insert", row: structuredClone(row) });
        return { data: structuredClone(row), error: null };
      }
      if (operation === "delete") {
        const selected = matchingRows();
        calls.push({ operation: "media-delete", ids: selected.map(row => row.id) });
        if (options.compensationDeleteError) {
          return { data: null, error: new Error(options.compensationDeleteError) };
        }
        if (!options.compensationLeavesRow) {
          const ids = new Set(selected.map(row => row.id));
          for (let index = rows.length - 1; index >= 0; index -= 1) {
            if (ids.has(rows[index].id)) rows.splice(index, 1);
          }
        }
        return { data: selected, error: null };
      }
      return { data: structuredClone(matchingRows()), error: null };
    };

    const query = {
      select() { return query; },
      insert(record) { operation = "insert"; payload = record; return query; },
      delete() { operation = "delete"; return query; },
      eq(field, value) { filters.push([field, value]); return query; },
      order() { return query; },
      async single() {
        const resolved = result();
        const data = Array.isArray(resolved.data) ? resolved.data[0] ?? null : resolved.data;
        return { ...resolved, data };
      },
      async maybeSingle() {
        const resolved = result();
        const data = Array.isArray(resolved.data) ? resolved.data[0] ?? null : resolved.data;
        return { ...resolved, data };
      },
      then(resolve, reject) {
        try {
          return Promise.resolve(result()).then(resolve, reject);
        } catch (error) {
          return Promise.reject(error).then(resolve, reject);
        }
      },
    };
    return query;
  }

  return {
    rows,
    calls,
    from,
    storage: {
      from(bucket) {
        return {
          async createSignedUrl(objectPath, expiresIn) {
            calls.push({ operation: "sign", bucket, path: objectPath, expiresIn });
            if (options.inaccessiblePaths?.includes(objectPath)) {
              return {
                data: null,
                error: new Error(`Refusé https://storage.example/object?token=secret-${objectPath}`),
              };
            }
            return { data: { signedUrl: `https://signed.invalid/${objectPath}` }, error: null };
          },
          async upload(objectPath, file, uploadOptions) {
            calls.push({ operation: "storage-upload", bucket, path: objectPath, uploadOptions });
            if (options.uploadError) return { data: null, error: new Error(options.uploadError) };
            return { data: { path: objectPath }, error: null };
          },
        };
      },
    },
  };
}

test("la durée des URL signées à la demande est de 3 600 secondes", () => {
  assert.equal(MEDIA_SIGNED_URL_TTL_SECONDS, 3600);
});

test("un média sans bucket ou chemin est absent sans appel Storage", async () => {
  const supabase = fakeSupabase();
  const access = await getSignedMediaAccess(supabase, { id: 1, bucket: null, path: null });
  assert.deepEqual(access, { status: "absent", signedUrl: null, error: null });
  assert.equal(supabase.calls.length, 0);
});

test("une signature réussie produit l'état available", async () => {
  const supabase = fakeSupabase();
  const access = await getSignedMediaAccess(supabase, { id: 1, bucket: "roadbook-images", path: "ok.jpg" });
  assert.equal(access.status, "available");
  assert.equal(access.signedUrl, "https://signed.invalid/ok.jpg");
  assert.equal(supabase.calls[0].expiresIn, 3600);
});

test("une erreur de signature est structurée et son journal ne contient ni URL ni token", async () => {
  const supabase = fakeSupabase([], { inaccessiblePaths: ["blocked.jpg"] });
  const logs = [];
  const access = await getSignedMediaAccess(
    supabase,
    { id: 8, bucket: "roadbook-images", path: "blocked.jpg" },
    { logger: (...args) => logs.push(args) },
  );
  assert.equal(access.status, "inaccessible");
  assert.equal(access.signedUrl, null);
  const serialized = JSON.stringify(logs);
  assert.equal(serialized.includes("https://"), false);
  assert.equal(serialized.includes("secret-blocked"), false);
});

test("un média inaccessible n'empêche pas les autres médias de se charger", async () => {
  const supabase = fakeSupabase([
    { id: 1, roadbook_id: 42, type: "image", bucket: "roadbook-images", path: "ok.jpg" },
    { id: 2, roadbook_id: 42, type: "image", bucket: "roadbook-images", path: "blocked.jpg" },
  ], { inaccessiblePaths: ["blocked.jpg"] });
  const rows = await loadMediaWithUrls(supabase, 42);
  assert.equal(rows.length, 2);
  assert.equal(rows.find(row => row.id === 1).access.status, "available");
  assert.equal(rows.find(row => row.id === 2).access.status, "inaccessible");
});

test("un échec d'upload compense et vérifie la suppression de la ligne media", async () => {
  const supabase = fakeSupabase();
  await assert.rejects(
    createMediaWithUpload(
      supabase,
      { bucket: "roadbook-images", path: "failed.jpg", roadbook_id: 42, uploaded_by: "owner" },
      async () => {
        supabase.calls.push({ operation: "storage-upload" });
        throw new Error("upload failed");
      },
    ),
    /upload failed/,
  );
  assert.equal(supabase.rows.length, 0);
  assert.deepEqual(supabase.calls.slice(0, 3).map(call => call.operation), [
    "media-insert",
    "storage-upload",
    "media-delete",
  ]);
});

test("un échec de compensation remonte une erreur avec l'ID media", async () => {
  const supabase = fakeSupabase([], { compensationDeleteError: "delete denied" });
  await assert.rejects(
    createMediaWithUpload(
      supabase,
      { bucket: "roadbook-images", path: "failed.jpg", roadbook_id: 42, uploaded_by: "owner" },
      async () => { throw new Error("upload failed"); },
    ),
    error => {
      assert.match(error.message, /ligne media 1/);
      assert.equal(error.mediaId, 1);
      assert.equal(error.compensationError, "delete denied");
      return true;
    },
  );
  assert.equal(supabase.rows.length, 1);
});

test("un remplacement GPX conserve le chemin et utilise upsert", async () => {
  const supabase = fakeSupabase();
  await uploadGpx(
    supabase,
    "roadbook-gpx",
    "owner/42/stages/1/existing.gpx",
    { name: "replacement.gpx" },
    { upsert: true },
  );
  const upload = supabase.calls.find(call => call.operation === "storage-upload");
  assert.equal(upload.path, "owner/42/stages/1/existing.gpx");
  assert.equal(upload.uploadOptions.upsert, true);
  assert.equal(supabase.calls.some(call => call.operation === "media-insert"), false);
});

test("la migration contient les cinq policies et n'autorise pas le listing", () => {
  const migration = fs.readFileSync(
    path.join(root, "supabase/migrations/20260714114608_storage_media_policies.sql"),
    "utf8",
  );
  for (const policy of [
    "roadbook_media_public_read",
    "roadbook_media_owner_read",
    "roadbook_media_owner_insert",
    "roadbook_media_owner_update",
    "roadbook_media_owner_delete",
  ]) {
    assert.match(migration, new RegExp(policy, "g"));
  }
  assert.match(migration, /object\.get_authenticated_info/);
  assert.match(migration, /object\.get_authenticated/);
  assert.doesNotMatch(migration, /object\.list/);
  assert.doesNotMatch(migration, /storage\.objects\.owner_id/);
  assert.match(migration, /m\.bucket = storage\.objects\.bucket_id/);
  assert.match(migration, /m\.path = storage\.objects\.name/);
});

test("les policies RLS respectent anon, propriétaire et autre utilisateur", { timeout: 60_000 }, async t => {
  if (!process.env.SUPABASE_DB_URL) {
    t.skip("SUPABASE_DB_URL absent : test RLS transactionnel non exécuté");
    return;
  }

  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL });
  const suffix = crypto.randomUUID();
  const slug = `__sprint_4c1_${suffix}`;
  const prefix = `__sprint_4c1__/${suffix}`;
  const paths = {
    linked: `${prefix}/linked.jpg`,
    mutate: `${prefix}/mutate.jpg`,
    ownerInsert: `${prefix}/owner-insert.jpg`,
    otherInsert: `${prefix}/other-insert.jpg`,
    orphan: `${prefix}/orphan.jpg`,
  };
  const migration = fs.readFileSync(
    path.join(root, "supabase/migrations/20260714114608_storage_media_policies.sql"),
    "utf8",
  );

  await client.connect();
  let transactionOpen = false;
  try {
    await client.query("begin");
    transactionOpen = true;
    await client.query(migration);

    const ownerResult = await client.query("select id from public.profiles order by created_at limit 1");
    assert.equal(ownerResult.rowCount, 1, "un profil propriétaire est requis pour le test RLS");
    const ownerId = ownerResult.rows[0].id;
    const otherId = "00000000-0000-0000-0000-000000000001";

    const roadbookResult = await client.query(
      "insert into public.roadbooks(slug,owner_id,title,is_public) values ($1,$2,$3,false) returning id",
      [slug, ownerId, "Sprint 4C1 fixture"],
    );
    const roadbookId = roadbookResult.rows[0].id;

    for (const objectPath of [paths.linked, paths.mutate, paths.ownerInsert, paths.otherInsert]) {
      await client.query(
        "insert into public.media(bucket,path,roadbook_id,type,uploaded_by) values ('roadbook-images',$1,$2,'image',$3)",
        [objectPath, roadbookId, ownerId],
      );
    }
    for (const objectPath of [paths.linked, paths.mutate, paths.orphan]) {
      await client.query(
        "insert into storage.objects(bucket_id,name,owner_id,metadata) values ('roadbook-images',$1,null,'{}'::jsonb)",
        [objectPath],
      );
    }

    async function setActor(role, sub, operation = "storage.object.get_authenticated_info") {
      await client.query("reset role");
      await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub, role })]);
      await client.query(`set local role ${role}`);
      await client.query("select set_config('storage.operation',$1,true)", [operation]);
    }

    async function visibleCount(objectPath) {
      const result = await client.query(
        "select count(*)::int as count from storage.objects where bucket_id='roadbook-images' and name=$1",
        [objectPath],
      );
      return result.rows[0].count;
    }

    let savepointIndex = 0;
    async function attemptDml(sql, params = []) {
      const savepoint = `case_${savepointIndex++}`;
      await client.query(`savepoint ${savepoint}`);
      try {
        const result = await client.query(sql, params);
        await client.query(`release savepoint ${savepoint}`);
        return result.rowCount;
      } catch {
        await client.query(`rollback to savepoint ${savepoint}`);
        await client.query(`release savepoint ${savepoint}`);
        return -1;
      }
    }

    await setActor("anon", null);
    assert.equal(await visibleCount(paths.linked), 0, "anon ne lit pas un roadbook privé");

    await setActor("authenticated", ownerId);
    assert.equal(await visibleCount(paths.linked), 1, "le propriétaire lit son média privé");
    assert.equal(await visibleCount(paths.orphan), 0, "un objet sans ligne media reste inaccessible");
    const historical = await client.query(
      "select count(*)::int as count from storage.objects where bucket_id='roadbook-images' and name=$1 and owner_id is null",
      [paths.linked],
    );
    assert.equal(historical.rows[0].count, 1, "owner_id null n'empêche pas l'accès par media");
    await client.query("select set_config('storage.operation','storage.object.list',true)");
    const listing = await client.query("select count(*)::int as count from storage.objects where bucket_id='roadbook-images'");
    assert.equal(listing.rows[0].count, 0, "le listing du bucket reste interdit");

    await setActor("authenticated", otherId);
    assert.equal(await visibleCount(paths.linked), 0, "un autre utilisateur ne lit pas le roadbook privé");
    assert.notEqual(await attemptDml(
      "insert into storage.objects(bucket_id,name,owner_id,metadata) values ('roadbook-images',$1,null,'{}'::jsonb)",
      [paths.otherInsert],
    ), 1, "un autre utilisateur ne peut pas insérer");
    assert.notEqual(await attemptDml(
      "update storage.objects set user_metadata='{}'::jsonb where bucket_id='roadbook-images' and name=$1",
      [paths.mutate],
    ), 1, "un autre utilisateur ne peut pas mettre à jour");
    await client.query("select set_config('storage.allow_delete_query','true',true)");
    assert.notEqual(await attemptDml(
      "delete from storage.objects where bucket_id='roadbook-images' and name=$1",
      [paths.mutate],
    ), 1, "un autre utilisateur ne peut pas supprimer");

    await setActor("authenticated", ownerId);
    assert.equal(await attemptDml(
      "insert into storage.objects(bucket_id,name,owner_id,metadata) values ('roadbook-images',$1,null,'{}'::jsonb)",
      [paths.ownerInsert],
    ), 1, "le propriétaire peut insérer");
    assert.equal(await attemptDml(
      "update storage.objects set user_metadata='{}'::jsonb where bucket_id='roadbook-images' and name=$1",
      [paths.mutate],
    ), 1, "le propriétaire peut mettre à jour");
    await client.query("select set_config('storage.allow_delete_query','true',true)");
    assert.equal(await attemptDml(
      "delete from storage.objects where bucket_id='roadbook-images' and name=$1",
      [paths.mutate],
    ), 1, "le propriétaire peut supprimer");

    await client.query("reset role");
    await client.query("update public.roadbooks set is_public=true where id=$1", [roadbookId]);
    await setActor("anon", null);
    assert.equal(await visibleCount(paths.linked), 1, "anon lit un média lié à un roadbook public");
  } finally {
    if (transactionOpen) await client.query("rollback");

    const cleanup = await client.query(
      `select
        (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'roadbook_media_%')::int as policies,
        (select count(*) from public.roadbooks where slug=$1)::int as roadbooks,
        (select count(*) from public.media where path like $2)::int as media,
        (select count(*) from storage.objects where name like $2)::int as objects`,
      [slug, `${prefix}%`],
    );
    assert.deepEqual(cleanup.rows[0], { policies: 0, roadbooks: 0, media: 0, objects: 0 });
    await client.end();
  }
});

test("Explorer et catalogue distinguent absent et inaccessible", () => {
  const explorer = fs.readFileSync(path.join(root, "src/app/roadbooks/[slug]/page.js"), "utf8");
  const catalogLoader = fs.readFileSync(path.join(root, "src/lib/getPublicRoadbooks.js"), "utf8");
  const catalogPage = fs.readFileSync(path.join(root, "src/app/explore/page.js"), "utf8");
  assert.match(explorer, /Une image est inaccessible/);
  assert.match(explorer, /availableImages\.length/);
  assert.match(catalogLoader, /coverMediaAccess/);
  assert.match(catalogPage, /Image indisponible/);
});

test("les erreurs média du Studio ne sont plus absorbées silencieusement", () => {
  for (const relativePath of [
    "src/hooks/studio/useMediaManager.js",
    "src/hooks/studio/useGpxManager.js",
    "src/hooks/studio/useLoadData.js",
    "src/hooks/studio/useCoverManager.js",
  ]) {
    const source = fs.readFileSync(path.join(root, relativePath), "utf8");
    assert.doesNotMatch(source, /catch\s*\{\s*\}/, relativePath);
  }
});
