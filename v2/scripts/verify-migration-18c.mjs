/**
 * Script de verification de la migration Sprint 18C.
 * Execute en lecture seule sur la base Supabase.
 *
 * Usage:
 *   node scripts/verify-migration-18c.mjs
 *
 * Variables d'environnement requises :
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Erreur : definissez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const headers = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

async function query(sql) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: "POST",
    headers,
    body: JSON.stringify({ sql }),
  });
  // Fallback : utiliser le SQL endpoint si disponible
  const res2 = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    method: "POST",
    headers: { ...headers, Prefer: "params=single-object" },
    body: JSON.stringify({ query: sql }),
  });
  return res2;
}

async function runSQL(sql) {
  const res = await fetch(SUPABASE_URL.replace(".supabase.co", ".supabase.co/rest/v1/rpc/sql"), {
    method: "POST",
    headers,
    body: JSON.stringify({ query_text: sql }),
  });
  if (res.status === 404) {
    // Fallback : utiliser query endpoint direct
    const res2 = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Prefer: "params=single-object",
      },
      body: JSON.stringify({ query: sql }),
    });
    if (res2.status === 404) {
      // Dernier fallback : exec via le dashboard
      console.warn("⚠ Impossible d'executer SQL directement via API.");
      console.warn("  Executez les commandes suivantes dans le SQL Editor Supabase :");
      return null;
    }
    return res2.json();
  }
  return res.json();
}

const checks = [];

async function check(description, fn) {
  try {
    const result = await fn();
    const ok = result === true || result === undefined;
    checks.push({ description, ok: ok ? "OK" : "ECHEC", detail: ok ? "" : String(result) });
    if (!ok) console.error(`  ✗ ${description}: ${result}`);
    else console.log(`  ✓ ${description}`);
  } catch (err) {
    checks.push({ description, ok: "ERREUR", detail: err.message });
    console.error(`  ✗ ${description}: ${err.message}`);
  }
}

console.log("\n=== Verification Migration Sprint 18C ===\n");

// 1. Type de updated_at
await check("roadbooks.updated_at est timestamptz", async () => {
  const res = await runSQL(`
    select data_type from information_schema.columns
    where table_schema = 'public'
      and table_name = 'roadbooks'
      and column_name = 'updated_at'
  `);
  if (!res) return "Requete impossible";
  const rows = Array.isArray(res) ? res : [res];
  return rows[0]?.data_type === "timestamp with time zone";
});

// 2. Fonction set_updated_at existe
await check("Fonction set_updated_at existe", async () => {
  const res = await runSQL(`
    select count(*) as cnt from information_schema.routines
    where routine_schema = 'public'
      and routine_name = 'set_updated_at'
  `);
  if (!res) return "Requete impossible";
  const rows = Array.isArray(res) ? res : [res];
  return parseInt(rows[0]?.cnt) > 0;
});

// 3. Fonction touch_roadbook existe
await check("Fonction touch_roadbook existe", async () => {
  const res = await runSQL(`
    select count(*) as cnt from information_schema.routines
    where routine_schema = 'public'
      and routine_name = 'touch_roadbook'
  `);
  if (!res) return "Requete impossible";
  const rows = Array.isArray(res) ? res : [res];
  return parseInt(rows[0]?.cnt) > 0;
});

// 4. Trigger stages
await check("Trigger trg_stages_touch_roadbook present", async () => {
  const res = await runSQL(`
    select count(*) as cnt from information_schema.triggers
    where trigger_name = 'trg_stages_touch_roadbook'
      and event_object_table = 'stages'
  `);
  if (!res) return "Requete impossible";
  const rows = Array.isArray(res) ? res : [res];
  return parseInt(rows[0]?.cnt) > 0;
});

// 5. Trigger POIs
await check("Trigger trg_pois_touch_roadbook present", async () => {
  const res = await runSQL(`
    select count(*) as cnt from information_schema.triggers
    where trigger_name = 'trg_pois_touch_roadbook'
      and event_object_table = 'stage_pois'
  `);
  if (!res) return "Requete impossible";
  const rows = Array.isArray(res) ? res : [res];
  return parseInt(rows[0]?.cnt) > 0;
});

// 6. Trigger variants
await check("Trigger trg_variants_touch_roadbook present", async () => {
  const res = await runSQL(`
    select count(*) as cnt from information_schema.triggers
    where trigger_name = 'trg_variants_touch_roadbook'
      and event_object_table = 'stage_variants'
  `);
  if (!res) return "Requete impossible";
  const rows = Array.isArray(res) ? res : [res];
  return parseInt(rows[0]?.cnt) > 0;
});

// 7. Trigger media
await check("Trigger trg_media_touch_roadbook present", async () => {
  const res = await runSQL(`
    select count(*) as cnt from information_schema.triggers
    where trigger_name = 'trg_media_touch_roadbook'
      and event_object_table = 'media'
  `);
  if (!res) return "Requete impossible";
  const rows = Array.isArray(res) ? res : [res];
  return parseInt(rows[0]?.cnt) > 0;
});

// 8. Couverture INSERT/UPDATE/DELETE pour chaque trigger
await check("Trigger stages couvre INSERT UPDATE DELETE", async () => {
  const res = await runSQL(`
    select string_agg(event_manipulation, ',' order by event_manipulation) as events
    from information_schema.triggers
    where trigger_name = 'trg_stages_touch_roadbook'
      and event_object_table = 'stages'
  `);
  if (!res) return "Requete impossible";
  const rows = Array.isArray(res) ? res : [res];
  return rows[0]?.events?.includes("INSERT")
    && rows[0]?.events?.includes("UPDATE")
    && rows[0]?.events?.includes("DELETE");
});

// 9. Absence de content_version
await check("content_version n existe PAS sur roadbooks", async () => {
  const res = await runSQL(`
    select count(*) as cnt from information_schema.columns
    where table_schema = 'public'
      and table_name = 'roadbooks'
      and column_name = 'content_version'
  `);
  if (!res) return "Requete impossible";
  const rows = Array.isArray(res) ? res : [res];
  return parseInt(rows[0]?.cnt) === 0;
});

// 10. Index
await check("Index idx_stages_roadbook present", async () => {
  const res = await runSQL(`
    select count(*) as cnt from pg_indexes
    where tablename = 'stages'
      and indexname = 'idx_stages_roadbook'
  `);
  if (!res) return "Requete impossible";
  const rows = Array.isArray(res) ? res : [res];
  return parseInt(rows[0]?.cnt) > 0;
});

// --- Resume ---
console.log("\n=== Resultat ===\n");
let ok = 0, fail = 0, err = 0;
checks.forEach(c => {
  if (c.ok === "OK") ok++;
  else if (c.ok === "ECHEC") fail++;
  else err++;
  console.log(`  ${c.ok === "OK" ? "✓" : "✗"} ${c.description} (${c.ok})`);
});
console.log(`\n${ok} OK, ${fail} echec(s), ${err} erreur(s)`);
if (fail > 0 || err > 0) {
  console.log("\n⚠ Certains controles ont echoue. Executez la migration dans le SQL Editor Supabase.");
  process.exit(1);
} else {
  console.log("\n✅ Migration 18C verifiee avec succes.");
}
