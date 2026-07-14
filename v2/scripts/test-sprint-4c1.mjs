import assert from "node:assert/strict";
import crypto from "node:crypto";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
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

test("la migration contient les cinq policies et les operations Storage exactes", () => {
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
  const publicRead = migration.slice(
    migration.indexOf('create policy "roadbook_media_public_read"'),
    migration.indexOf('create policy "roadbook_media_owner_read"'),
  );
  const ownerRead = migration.slice(
    migration.indexOf('create policy "roadbook_media_owner_read"'),
    migration.indexOf('create policy "roadbook_media_owner_insert"'),
  );
  for (const operation of [
    "object.sign",
    "object.sign_many",
    "object.get_authenticated",
    "object.get_authenticated_info",
  ]) {
    const pattern = new RegExp(`'${operation.replaceAll(".", "\\.")}'`);
    assert.match(publicRead, pattern);
    assert.match(ownerRead, pattern);
  }
  for (const operation of ["object.upload", "object.upload_update", "object.delete_many"]) {
    const pattern = new RegExp(`'${operation.replaceAll(".", "\\.")}'`);
    assert.doesNotMatch(publicRead, pattern);
    assert.match(ownerRead, pattern);
  }
  for (const operation of ["object.list", "object.get_signed", "object.move", "object.copy"]) {
    const pattern = new RegExp(`'${operation.replaceAll(".", "\\.")}'`);
    assert.doesNotMatch(publicRead, pattern);
    assert.doesNotMatch(ownerRead, pattern);
  }
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
    upsert: `${prefix}/upsert.jpg`,
    update: `${prefix}/update.jpg`,
    remove: `${prefix}/remove.jpg`,
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

    for (const objectPath of [
      paths.linked,
      paths.upsert,
      paths.update,
      paths.remove,
      paths.ownerInsert,
      paths.otherInsert,
    ]) {
      await client.query(
        "insert into public.media(bucket,path,roadbook_id,type,uploaded_by) values ('roadbook-images',$1,$2,'image',$3)",
        [objectPath, roadbookId, ownerId],
      );
    }
    for (const objectPath of [paths.linked, paths.upsert, paths.update, paths.remove, paths.orphan]) {
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

    await setActor("anon", null, "storage.object.sign");
    assert.equal(await visibleCount(paths.linked), 0, "anon ne signe pas un roadbook privé");

    for (const operation of [
      "storage.object.sign",
      "storage.object.sign_many",
      "storage.object.get_authenticated",
    ]) {
      await setActor("authenticated", ownerId, operation);
      assert.equal(await visibleCount(paths.linked), 1, `le propriétaire autorise ${operation}`);
    }
    assert.equal(await visibleCount(paths.orphan), 0, "un objet sans ligne media reste inaccessible");
    const historical = await client.query(
      "select count(*)::int as count from storage.objects where bucket_id='roadbook-images' and name=$1 and owner_id is null",
      [paths.linked],
    );
    assert.equal(historical.rows[0].count, 1, "owner_id null n'empêche pas l'accès par media");
    await client.query("select set_config('storage.operation','storage.object.list',true)");
    const listing = await client.query("select count(*)::int as count from storage.objects where bucket_id='roadbook-images'");
    assert.equal(listing.rows[0].count, 0, "le listing du bucket reste interdit");

    await setActor("authenticated", otherId, "storage.object.sign");
    assert.equal(await visibleCount(paths.linked), 0, "un autre utilisateur ne lit pas le roadbook privé");
    await setActor("authenticated", otherId, "storage.object.upload");
    assert.notEqual(await attemptDml(
      "insert into storage.objects(bucket_id,name,owner_id,metadata) values ('roadbook-images',$1,null,'{}'::jsonb)",
      [paths.otherInsert],
    ), 1, "un autre utilisateur ne peut pas insérer");
    await setActor("authenticated", otherId, "storage.object.upload_update");
    assert.notEqual(await attemptDml(
      "update storage.objects set user_metadata='{}'::jsonb where bucket_id='roadbook-images' and name=$1",
      [paths.update],
    ), 1, "un autre utilisateur ne peut pas mettre à jour");
    await setActor("authenticated", otherId, "storage.object.delete_many");
    await client.query("select set_config('storage.allow_delete_query','true',true)");
    assert.notEqual(await attemptDml(
      "delete from storage.objects where bucket_id='roadbook-images' and name=$1",
      [paths.remove],
    ), 1, "un autre utilisateur ne peut pas supprimer");

    await setActor("authenticated", ownerId, "storage.object.upload");
    assert.equal(await attemptDml(
      "insert into storage.objects(bucket_id,name,owner_id,metadata) values ('roadbook-images',$1,null,'{}'::jsonb)",
      [paths.ownerInsert],
    ), 1, "upload simple : le propriétaire peut insérer");
    assert.equal(await visibleCount(paths.upsert), 1, "upsert : SELECT autorisé avec object.upload");
    assert.equal(await attemptDml(
      "update storage.objects set user_metadata='{}'::jsonb where bucket_id='roadbook-images' and name=$1",
      [paths.upsert],
    ), 1, "upsert : UPDATE autorisé avec object.upload");

    await setActor("authenticated", ownerId, "storage.object.upload_update");
    assert.equal(await visibleCount(paths.update), 1, "update : SELECT autorisé avec object.upload_update");
    assert.equal(await attemptDml(
      "update storage.objects set user_metadata='{}'::jsonb where bucket_id='roadbook-images' and name=$1",
      [paths.update],
    ), 1, "update : le propriétaire peut mettre à jour");

    await setActor("authenticated", ownerId, "storage.object.delete_many");
    assert.equal(await visibleCount(paths.remove), 1, "remove : SELECT autorisé avec object.delete_many");
    await client.query("select set_config('storage.allow_delete_query','true',true)");
    assert.equal(await attemptDml(
      "delete from storage.objects where bucket_id='roadbook-images' and name=$1",
      [paths.remove],
    ), 1, "remove : le propriétaire peut supprimer");

    await client.query("reset role");
    await client.query("update public.roadbooks set is_public=true where id=$1", [roadbookId]);
    for (const operation of [
      "storage.object.sign",
      "storage.object.sign_many",
      "storage.object.get_authenticated",
    ]) {
      await setActor("anon", null, operation);
      assert.equal(await visibleCount(paths.linked), 1, `anon autorise ${operation} sur un roadbook public`);
    }
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

const sprint4c1RemotePhases = [
  "public-read",
  "private-read",
  "owner-write",
  "other-user-write",
  "listing",
  "cleanup-check",
];
const sprint4c1PhaseArgumentIndex = process.argv.indexOf("--phase");
const sprint4c1RequestedPhase = sprint4c1PhaseArgumentIndex >= 0
  ? process.argv[sprint4c1PhaseArgumentIndex + 1]
  : process.env.SPRINT_4C1_PHASE;
const sprint4c1RemoteRequested = process.env.SPRINT_4C1_REMOTE_HTTP === "1"
  || Boolean(sprint4c1RequestedPhase);

test("le banc distant expose uniquement les six phases courtes attendues", () => {
  assert.deepEqual(sprint4c1RemotePhases, [
    "public-read",
    "private-read",
    "owner-write",
    "other-user-write",
    "listing",
    "cleanup-check",
  ]);
});

test("la phase HTTP Storage reelle utilise des fixtures autonomes", {
  skip: !sprint4c1RemoteRequested,
  timeout: 75_000,
}, async () => {
  assert.ok(
    sprint4c1RemotePhases.includes(sprint4c1RequestedPhase),
    `--phase est requis (${sprint4c1RemotePhases.join(", ")})`,
  );
  console.log(`[sprint-4c1] phase-start ${sprint4c1RequestedPhase}`);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL est requis");
  assert.ok(anonKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY est requis");
  assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY est requis");
  assert.ok(process.env.SUPABASE_DB_URL, "SUPABASE_DB_URL est requis");

  const stepTimeoutMs = 20_000;
  const safeLogMessage = value => String(value)
    .replace(/https?:\/\/\S+/gi, "[url-redacted]")
    .replace(/([?&]token=)[^&\s]+/gi, "$1[redacted]");
  async function withTimeout(promise, timeoutMs, label) {
    let timeoutId;

    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(new Error(`${label} timed out after ${timeoutMs}ms`));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
  const closePostgresClient = async (client, label) => {
    const endPromise = client.end();
    endPromise.catch(() => {});
    try {
      await withTimeout(endPromise, 5_000, `fermeture PostgreSQL ${label}`);
      console.log(`[sprint-4c1] postgres-closed ${label}`);
    } catch (error) {
      console.error(`[sprint-4c1] postgres-force-close ${label}: ${safeLogMessage(error.message)}`);
      client.connection?.stream?.destroy();
    }
    await assert.rejects(
      Promise.resolve().then(() => client.query("select 1")),
      /closed|ended|not queryable|Client was closed/i,
      `${label} doit etre inutilisable apres fermeture`,
    );
  };
  const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };
  const createObservedClient = (key, role) => {
    let activeScenario = null;
    const observedFetch = async (input, init = {}) => {
      const timeoutSignal = AbortSignal.timeout(stepTimeoutMs);
      const signal = init.signal
        ? AbortSignal.any([init.signal, timeoutSignal])
        : timeoutSignal;
      const response = await fetch(input, { ...init, signal });
      if (activeScenario) activeScenario.httpStatuses.push(response.status);
      return response;
    };
    const client = createClient(supabaseUrl, key, {
      ...clientOptions,
      global: { fetch: observedFetch },
    });

    const runScenario = async ({ id, operation, bucket = null, objectPath = null, expected }, task) => {
      assert.equal(activeScenario, null, `scenario concurrent interdit pour ${role}`);
      const startedAt = new Date();
      const startedMs = performance.now();
      const scenario = { id, role, operation, bucket, path: objectPath, expected, httpStatuses: [] };
      activeScenario = scenario;
      console.log(`SCENARIO START ${JSON.stringify({ ...scenario, httpStatuses: undefined, startedAt: startedAt.toISOString() })}`);
      let timer;
      try {
        const result = await Promise.race([
          task(client),
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              reject(new Error(`timeout ${stepTimeoutMs}ms: ${id}`));
            }, stepTimeoutMs);
          }),
        ]);
        const elapsedMs = Math.round(performance.now() - startedMs);
        console.log(`SCENARIO END ${JSON.stringify({
          ...scenario,
          finishedAt: new Date().toISOString(),
          elapsedMs,
        })}`);
        return { result, httpStatuses: [...scenario.httpStatuses], elapsedMs };
      } catch (error) {
        const elapsedMs = Math.round(performance.now() - startedMs);
        console.error(`SCENARIO FAIL ${JSON.stringify({
          ...scenario,
          finishedAt: new Date().toISOString(),
          elapsedMs,
          error: safeLogMessage(error instanceof Error ? error.message : String(error)),
        })}`);
        throw error;
      } finally {
        clearTimeout(timer);
        activeScenario = null;
      }
    };
    return { client, runScenario, role };
  };
  const anonObserved = createObservedClient(anonKey, "anon");
  const serviceObserved = createObservedClient(serviceRoleKey, "service-role-cleanup");
  const anon = anonObserved.client;
  const service = serviceObserved.client;
  const suffix = crypto.randomUUID();
  const prefix = `__sprint_4c1_http__/${suffix}`;
  const slug = `__sprint-4c1-http-${suffix}`;
  const userIds = [];
  const fixturePaths = {
    private: `${prefix}/private.txt`,
    historical: `${prefix}/historical.txt`,
    simpleUpload: `${prefix}/simple-upload.txt`,
    upsert: `${prefix}/upsert.txt`,
    update: `${prefix}/update.txt`,
    remove: `${prefix}/remove.txt`,
    otherUpload: `${prefix}/other-upload.txt`,
    otherRemove: `${prefix}/other-remove.txt`,
    orphan: `${prefix}/orphan.txt`,
  };
  let roadbookId = null;

  const asBlob = value => new Blob([value], { type: "text/plain" });
  const assertDenied = (result, message) => {
    assert.ok(result.error || !result.data, message);
  };
  const fetchSigned = async result => {
    assert.ifError(result.error);
    assert.ok(result.data?.signedUrl, "l'URL signee est absente");
    const response = await fetch(result.data.signedUrl, {
      signal: AbortSignal.timeout(stepTimeoutMs),
    });
    assert.equal(response.status, 200);
    return response.status;
  };
  const createFixtureUser = async label => {
    const email = `sprint-4c1-${label}-${suffix}@example.invalid`;
    const password = `S4c1!${crypto.randomUUID()}aA`;
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true });
    assert.ifError(created.error);
    const authId = created.data.user.id;
    userIds.push(authId);

    const profile = await service.from("profiles").insert({ id: authId }).select("id").single();
    assert.ifError(profile.error);
    assert.equal(profile.data.id, authId, "le profil doit reutiliser exactement l'UUID Auth");

    const observed = createObservedClient(anonKey, label === "owner" ? "owner" : "other-user");
    const login = await observed.client.auth.signInWithPassword({ email, password });
    assert.ifError(login.error);
    assert.equal(login.data.user.id, authId);
    return { id: authId, ...observed };
  };
  const storageScenario = (observed, id, operation, objectPath, expected, task) => (
    observed.runScenario({
      id,
      operation,
      bucket: "roadbook-images",
      objectPath,
      expected,
    }, task)
  );

  try {
    const phaseMediaNames = {
      "private-read": ["private", "historical"],
      "owner-write": ["simpleUpload", "upsert", "update", "remove"],
      "other-user-write": ["otherUpload", "upsert", "update", "otherRemove"],
      listing: ["private"],
    }[sprint4c1RequestedPhase] ?? [];
    const needsOwner = phaseMediaNames.length > 0;
    const needsOther = ["private-read", "other-user-write", "listing"].includes(sprint4c1RequestedPhase);
    const owner = needsOwner ? await createFixtureUser("owner") : null;
    const other = needsOther ? await createFixtureUser("other") : null;

    if (needsOwner) {
      const roadbook = await service.from("roadbooks").insert({
        slug,
        owner_id: owner.id,
        title: `Sprint 4C1 ${sprint4c1RequestedPhase} fixture`,
        is_public: false,
      }).select("id,owner_id").single();
      assert.ifError(roadbook.error);
      assert.equal(roadbook.data.owner_id, owner.id);
      roadbookId = roadbook.data.id;
    }

    if (phaseMediaNames.length > 0) {
      const mediaRows = phaseMediaNames.map(name => ({
        bucket: "roadbook-images",
        path: fixturePaths[name],
        roadbook_id: roadbookId,
        type: "other",
        file_name: `${name}.txt`,
        mime_type: "text/plain",
        uploaded_by: name === "otherUpload" ? other.id : owner.id,
      }));
      const mediaInsert = await service.from("media").insert(mediaRows);
      assert.ifError(mediaInsert.error);
    }

    if (sprint4c1RequestedPhase === "private-read") {
      for (const [name, objectPath] of [
        ["private", fixturePaths.private],
        ["historical", fixturePaths.historical],
        ["orphan", fixturePaths.orphan],
      ]) {
        const uploaded = await storageScenario(
          serviceObserved,
          `service-setup-upload-${name}`,
          "upload",
          objectPath,
          "allowed",
          client => client.storage.from("roadbook-images").upload(objectPath, asBlob(objectPath)),
        );
        assert.ifError(uploaded.result.error);
      }

      const db = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        connectionTimeoutMillis: stepTimeoutMs,
        query_timeout: stepTimeoutMs,
      });
      await withTimeout(db.connect(), stepTimeoutMs, "connexion PostgreSQL historical-owner-check");
      try {
        await withTimeout(
          db.query(
            "update storage.objects set owner_id=null where bucket_id='roadbook-images' and name=$1",
            [fixturePaths.historical],
          ),
          stepTimeoutMs,
          "mise a jour PostgreSQL historical-owner-check",
        );
        const historicalOwner = await withTimeout(
          db.query(
            "select owner_id from storage.objects where bucket_id='roadbook-images' and name=$1",
            [fixturePaths.historical],
          ),
          stepTimeoutMs,
          "lecture PostgreSQL historical-owner-check",
        );
        assert.equal(historicalOwner.rows[0]?.owner_id, null);
      } finally {
        await closePostgresClient(db, "historical-owner-check");
      }
    } else if (["other-user-write", "listing"].includes(sprint4c1RequestedPhase)) {
      const seedNames = sprint4c1RequestedPhase === "listing"
        ? ["private"]
        : ["upsert", "update", "otherRemove"];
      for (const name of seedNames) {
        const uploaded = await storageScenario(
          serviceObserved,
          `service-setup-upload-${name}`,
          "upload",
          fixturePaths[name],
          "allowed",
          client => client.storage.from("roadbook-images").upload(fixturePaths[name], asBlob(`${name}-seed`)),
        );
        assert.ifError(uploaded.result.error);
      }
    }

    if (sprint4c1RequestedPhase === "public-read") {
    const voiePath = "roadbooks/voie-bleue/cover/cover.jpg";
    const alsacePath = "roadbooks/alsace-canal-marne-rhin/cover/cover.webp";
    const voieSign = await storageScenario(
      anonObserved,
      "anon-sign-voie-bleue-allowed",
      "createSignedUrl",
      voiePath,
      "allowed",
      client => client.storage.from("roadbook-images").createSignedUrl(voiePath, 3600),
    );
    assert.equal(await fetchSigned(voieSign.result), 200);
    const alsaceSign = await storageScenario(
      anonObserved,
      "anon-sign-alsace-allowed",
      "createSignedUrl",
      alsacePath,
      "allowed",
      client => client.storage.from("roadbook-images").createSignedUrl(alsacePath, 3600),
    );
    assert.equal(await fetchSigned(alsaceSign.result), 200);
    const signedManyScenario = await storageScenario(
      anonObserved,
      "anon-sign-many-public-allowed",
      "createSignedUrls",
      `${voiePath},${alsacePath}`,
      "allowed",
      client => client.storage.from("roadbook-images").createSignedUrls([voiePath, alsacePath], 3600),
    );
    assert.ifError(signedManyScenario.result.error);
    assert.equal(signedManyScenario.result.data.length, 2);
    for (const signed of signedManyScenario.result.data) {
      assert.ok(signed.signedUrl);
      assert.equal((await fetch(signed.signedUrl, { signal: AbortSignal.timeout(stepTimeoutMs) })).status, 200);
    }

    }

    if (sprint4c1RequestedPhase === "private-read") {
    const anonPrivate = await storageScenario(
      anonObserved,
      "anon-sign-private-denied",
      "createSignedUrl",
      fixturePaths.private,
      "denied",
      client => client.storage.from("roadbook-images").createSignedUrl(fixturePaths.private, 3600),
    );
    assertDenied(anonPrivate.result, "anon ne doit pas signer un media prive");
    const ownerPrivate = await storageScenario(
      owner,
      "owner-sign-private-allowed",
      "createSignedUrl",
      fixturePaths.private,
      "allowed",
      client => client.storage.from("roadbook-images").createSignedUrl(fixturePaths.private, 3600),
    );
    assert.equal(await fetchSigned(ownerPrivate.result), 200);
    const ownerHistorical = await storageScenario(
      owner,
      "owner-sign-historical-null-owner-allowed",
      "createSignedUrl",
      fixturePaths.historical,
      "allowed",
      client => client.storage.from("roadbook-images").createSignedUrl(fixturePaths.historical, 3600),
    );
    assert.equal(await fetchSigned(ownerHistorical.result), 200);
    const otherPrivate = await storageScenario(
      other,
      "other-user-sign-private-denied",
      "createSignedUrl",
      fixturePaths.private,
      "denied",
      client => client.storage.from("roadbook-images").createSignedUrl(fixturePaths.private, 3600),
    );
    assertDenied(otherPrivate.result, "un autre utilisateur ne doit pas signer un media prive");
    const orphanSign = await storageScenario(
      owner,
      "owner-sign-orphan-denied",
      "createSignedUrl",
      fixturePaths.orphan,
      "denied",
      client => client.storage.from("roadbook-images").createSignedUrl(fixturePaths.orphan, 3600),
    );
    assertDenied(orphanSign.result, "un objet sans ligne media ne doit pas etre signable");

    const download = await storageScenario(
      owner,
      "owner-download-private-allowed",
      "download",
      fixturePaths.private,
      "allowed",
      client => client.storage.from("roadbook-images").download(fixturePaths.private),
    );
    assert.ifError(download.result.error);
    assert.equal(await download.result.data.text(), fixturePaths.private);

    }

    if (sprint4c1RequestedPhase === "owner-write") {
    const simpleUpload = await storageScenario(
      owner,
      "owner-upload-simple-allowed",
      "upload",
      fixturePaths.simpleUpload,
      "allowed",
      client => client.storage.from("roadbook-images").upload(fixturePaths.simpleUpload, asBlob("simple")),
    );
    assert.ifError(simpleUpload.result.error);
    const initialUpsert = await storageScenario(
      owner,
      "owner-upload-upsert-seed-allowed",
      "upload",
      fixturePaths.upsert,
      "allowed",
      client => client.storage.from("roadbook-images").upload(fixturePaths.upsert, asBlob("upsert-v1")),
    );
    assert.ifError(initialUpsert.result.error);
    const upsert = await storageScenario(
      owner,
      "owner-upsert-allowed",
      "upload upsert",
      fixturePaths.upsert,
      "allowed",
      client => client.storage.from("roadbook-images").upload(
        fixturePaths.upsert,
        asBlob("upsert-v2"),
        { upsert: true },
      ),
    );
    assert.ifError(upsert.result.error);
    const initialUpdate = await storageScenario(
      owner,
      "owner-upload-update-seed-allowed",
      "upload",
      fixturePaths.update,
      "allowed",
      client => client.storage.from("roadbook-images").upload(fixturePaths.update, asBlob("update-v1")),
    );
    assert.ifError(initialUpdate.result.error);
    const update = await storageScenario(
      owner,
      "owner-update-allowed",
      "update",
      fixturePaths.update,
      "allowed",
      client => client.storage.from("roadbook-images").update(fixturePaths.update, asBlob("update-v2")),
    );
    assert.ifError(update.result.error);
    const initialRemove = await storageScenario(
      owner,
      "owner-upload-remove-seed-allowed",
      "upload",
      fixturePaths.remove,
      "allowed",
      client => client.storage.from("roadbook-images").upload(fixturePaths.remove, asBlob("remove")),
    );
    assert.ifError(initialRemove.result.error);
    const remove = await storageScenario(
      owner,
      "owner-remove-allowed",
      "remove",
      fixturePaths.remove,
      "allowed",
      client => client.storage.from("roadbook-images").remove([fixturePaths.remove]),
    );
    assert.ifError(remove.result.error);
    const removedObject = await storageScenario(
      serviceObserved,
      "service-check-owner-remove-object-absent",
      "download",
      fixturePaths.remove,
      "absent",
      client => client.storage.from("roadbook-images").download(fixturePaths.remove),
    );
    assert.ok(removedObject.result.error, "owner remove doit supprimer effectivement l'objet");

    }

    if (sprint4c1RequestedPhase === "other-user-write") {
    const otherUpload = await storageScenario(
      other,
      "other-user-upload-denied",
      "upload",
      fixturePaths.otherUpload,
      "denied",
      client => client.storage.from("roadbook-images").upload(fixturePaths.otherUpload, asBlob("denied")),
    );
    assertDenied(otherUpload.result, "un autre utilisateur ne doit pas uploader");
    const deniedUploadAbsent = await storageScenario(
      serviceObserved,
      "service-check-other-upload-object-absent",
      "download",
      fixturePaths.otherUpload,
      "absent",
      client => client.storage.from("roadbook-images").download(fixturePaths.otherUpload),
    );
    assert.ok(deniedUploadAbsent.result.error, "l'upload refuse ne doit creer aucun objet");
    const otherUpsert = await storageScenario(
      other,
      "other-user-upsert-denied",
      "upload upsert",
      fixturePaths.upsert,
      "denied",
      client => client.storage.from("roadbook-images").upload(
        fixturePaths.upsert,
        asBlob("denied"),
        { upsert: true },
      ),
    );
    assertDenied(otherUpsert.result, "un autre utilisateur ne doit pas faire d'upsert");
    const unchangedUpsert = await storageScenario(
      serviceObserved,
      "service-check-other-upsert-object-unchanged",
      "download",
      fixturePaths.upsert,
      "unchanged",
      client => client.storage.from("roadbook-images").download(fixturePaths.upsert),
    );
    assert.ifError(unchangedUpsert.result.error);
    assert.equal(await unchangedUpsert.result.data.text(), "upsert-seed");
    const otherUpdate = await storageScenario(
      other,
      "other-user-update-denied",
      "update",
      fixturePaths.update,
      "denied",
      client => client.storage.from("roadbook-images").update(fixturePaths.update, asBlob("denied")),
    );
    assertDenied(otherUpdate.result, "un autre utilisateur ne doit pas mettre a jour");
    const unchangedUpdate = await storageScenario(
      serviceObserved,
      "service-check-other-update-object-unchanged",
      "download",
      fixturePaths.update,
      "unchanged",
      client => client.storage.from("roadbook-images").download(fixturePaths.update),
    );
    assert.ifError(unchangedUpdate.result.error);
    assert.equal(await unchangedUpdate.result.data.text(), "update-seed");
    const otherRemove = await storageScenario(
      other,
      "other-user-remove-denied",
      "remove",
      fixturePaths.otherRemove,
      "denied",
      client => client.storage.from("roadbook-images").remove([fixturePaths.otherRemove]),
    );
    console.log(`SCENARIO INFO ${JSON.stringify({
      id: "other-user-remove-denied",
      httpStatuses: otherRemove.httpStatuses,
      clientError: Boolean(otherRemove.result.error),
      deletedRows: Array.isArray(otherRemove.result.data) ? otherRemove.result.data.length : null,
      interpretation: "HTTP 200 possible; suppression vide; autorisation metier refusee si objet preserve",
    })}`);
    const otherRemoveStillExists = await storageScenario(
      serviceObserved,
      "service-check-other-remove-object-still-present",
      "download",
      fixturePaths.otherRemove,
      "allowed",
      client => client.storage.from("roadbook-images").download(fixturePaths.otherRemove),
    );
    assert.ifError(otherRemoveStillExists.result.error);
    assert.equal(await otherRemoveStillExists.result.data.text(), "otherRemove-seed");

    }

    if (sprint4c1RequestedPhase === "listing") {
    const listingCases = [
      { id: "anon-list-denied", observed: anonObserved },
      { id: "owner-list-denied", observed: owner },
      { id: "other-user-list-denied", observed: other },
    ];
    const listingResults = [];
    for (const listingCase of listingCases) {
      const listing = await storageScenario(
        listingCase.observed,
        listingCase.id,
        "list",
        prefix,
        "denied or empty",
        client => client.storage.from("roadbook-images").list(prefix, { limit: 100 }),
      );
      const items = Array.isArray(listing.result.data) ? listing.result.data : [];
      const visibleFixtureNames = items
        .map(item => item?.name)
        .filter(name => typeof name === "string")
        .filter(name => Object.values(fixturePaths).some(value => value.endsWith(`/${name}`)));
      const result = {
        id: listingCase.id,
        httpStatuses: listing.httpStatuses,
        clientError: Boolean(listing.result.error),
        returnedCount: items.length,
        visibleFixtureNames,
      };
      listingResults.push(result);
      console.log(`[sprint-4c1] listing-result ${JSON.stringify({
        ...result,
        interpretation: visibleFixtureNames.length === 0
          ? "refus effectif: HTTP 200 avec liste vide autorise"
          : "echec: une fixture existante est visible",
      })}`);
    }
    assert.deepEqual(
      listingResults.map(result => result.id),
      listingCases.map(listingCase => listingCase.id),
      "les trois scenarios de listing doivent etre executes",
    );
    for (const listingResult of listingResults) {
      assert.deepEqual(
        listingResult.visibleFixtureNames,
        [],
        `${listingResult.id} ne doit exposer aucune fixture existante`,
      );
    }
    }

    if (sprint4c1RequestedPhase === "cleanup-check") {
      const cleanupCheckDb = new Client({
        connectionString: process.env.SUPABASE_DB_URL,
        connectionTimeoutMillis: stepTimeoutMs,
        query_timeout: stepTimeoutMs,
      });
      try {
        await withTimeout(cleanupCheckDb.connect(), stepTimeoutMs, "connexion PostgreSQL cleanup-check");
        const cleanupCheck = await withTimeout(
          cleanupCheckDb.query(`select
            (select count(*) from storage.objects where name like '__sprint_4c1_http__/%')::int as objects,
            (select count(*) from public.media where path like '__sprint_4c1_http__/%')::int as media,
            (select count(*) from public.roadbooks where slug like '__sprint-4c1-http-%')::int as roadbooks,
            (select count(*) from public.profiles p join auth.users u on u.id=p.id where u.email like 'sprint-4c1-%@example.invalid')::int as profiles,
            (select count(*) from auth.users where email like 'sprint-4c1-%@example.invalid')::int as auth_users`),
          stepTimeoutMs,
          "requete PostgreSQL cleanup-check",
        );
        console.log(`[sprint-4c1] cleanup-check ${JSON.stringify(cleanupCheck.rows[0])}`);
        assert.deepEqual(cleanupCheck.rows[0], { objects: 0, media: 0, roadbooks: 0, profiles: 0, auth_users: 0 });
      } finally {
        await closePostgresClient(cleanupCheckDb, "cleanup-check");
      }
    }
  } finally {
    const cleanupErrors = [];
    const cleanupStep = async (name, task) => {
      const startedMs = performance.now();
      console.log(`service-cleanup START ${name}`);
      try {
        const result = await task();
        if (result?.error) throw result.error;
        console.log(`service-cleanup END ${name} ${Math.round(performance.now() - startedMs)}ms`);
      } catch (error) {
        cleanupErrors.push(error);
        console.error(`service-cleanup FAIL ${name} ${Math.round(performance.now() - startedMs)}ms: ${safeLogMessage(error.message)}`);
      }
    };

    if (sprint4c1RequestedPhase !== "cleanup-check") {
      await cleanupStep("service-cleanup-remove-objects", async () => {
        const scenario = await storageScenario(
          serviceObserved,
          "service-cleanup-remove",
          "remove",
          Object.values(fixturePaths).join(","),
          "allowed",
          client => client.storage.from("roadbook-images").remove(Object.values(fixturePaths)),
        );
        return scenario.result;
      });
    }
    if (roadbookId !== null) {
      await cleanupStep(
        "service-cleanup-delete-media",
        () => service.from("media").delete().eq("roadbook_id", roadbookId),
      );
      await cleanupStep(
        "service-cleanup-delete-roadbook",
        () => service.from("roadbooks").delete().eq("id", roadbookId),
      );
    }
    if (userIds.length > 0) {
      await cleanupStep(
        "service-cleanup-delete-profiles",
        () => service.from("profiles").delete().in("id", userIds),
      );
      for (const userId of userIds) {
        await cleanupStep(
          `service-cleanup-delete-auth-user-${userId}`,
          () => service.auth.admin.deleteUser(userId),
        );
      }
    }

    const verificationDb = new Client({
      connectionString: process.env.SUPABASE_DB_URL,
      connectionTimeoutMillis: stepTimeoutMs,
      query_timeout: stepTimeoutMs,
    });
    let counters;
    try {
      await withTimeout(
        verificationDb.connect(),
        stepTimeoutMs,
        "connexion PostgreSQL final-fixture-verification",
      );
      const verificationQuery = sprint4c1RequestedPhase === "cleanup-check"
        ? {
            text: `select
              (select count(*) from storage.objects where name like '__sprint_4c1_http__/%')::int as objects,
              (select count(*) from public.media where path like '__sprint_4c1_http__/%')::int as media,
              (select count(*) from public.roadbooks where slug like '__sprint-4c1-http-%')::int as roadbooks,
              (select count(*) from public.profiles p join auth.users u on u.id=p.id where u.email like 'sprint-4c1-%@example.invalid')::int as profiles,
              (select count(*) from auth.users where email like 'sprint-4c1-%@example.invalid')::int as auth_users`,
            values: [],
          }
        : {
            text: `select
              (select count(*) from storage.objects where bucket_id='roadbook-images' and name=any($1::text[]))::int as objects,
              (select count(*) from public.media where roadbook_id=$2::bigint)::int as media,
              (select count(*) from public.roadbooks where id=$2::bigint)::int as roadbooks,
              (select count(*) from public.profiles where id=any($3::uuid[]))::int as profiles,
              (select count(*) from auth.users where id=any($3::uuid[]))::int as auth_users`,
            values: [Object.values(fixturePaths), roadbookId, userIds],
          };
      const verification = await withTimeout(
        verificationDb.query(verificationQuery.text, verificationQuery.values),
        stepTimeoutMs,
        "requete PostgreSQL final-fixture-verification",
      );
      counters = verification.rows[0];
    } finally {
      const handlesBeforeClose = process
        ._getActiveHandles()
        .map(handle => handle?.constructor?.name ?? "Unknown");
      console.log("[sprint-4c1] active-handles-before-postgres-close", handlesBeforeClose);
      await closePostgresClient(verificationDb, "final-fixture-verification");
    }
    console.log(`service-cleanup COUNTERS ${JSON.stringify(counters)}`);
    assert.deepEqual(counters, { objects: 0, media: 0, roadbooks: 0, profiles: 0, auth_users: 0 });
    await new Promise(resolve => setImmediate(resolve));
    const activeHandles = process
      ._getActiveHandles()
      .map(handle => handle?.constructor?.name ?? "Unknown");
    const activeRequests = process
      ._getActiveRequests()
      .map(request => request?.constructor?.name ?? "Unknown");
    console.log("[sprint-4c1] active-handles", activeHandles);
    console.log("[sprint-4c1] active-requests", activeRequests);
    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, "une ou plusieurs actions service-cleanup ont echoue");
    }
    console.log(`[sprint-4c1] phase-clean ${sprint4c1RequestedPhase}`);
  }
});
