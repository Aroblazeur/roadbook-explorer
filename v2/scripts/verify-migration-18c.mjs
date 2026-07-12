import dotenv from "dotenv";
import pg from "pg";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env.local") });

const { Pool } = pg;
const connectionString = process.env.SUPABASE_DB_URL;

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

if (!connectionString) {
  console.error("Erreur : definissez SUPABASE_DB_URL dans .env.local");
  process.exit(1);
}

const pool = new Pool({ connectionString });

async function query(sql) {
  const client = await pool.connect();
  try {
    const res = await client.query(sql);
    return res.rows;
  } finally {
    client.release();
  }
}

try {
  // 1. Type de updated_at
  await check("roadbooks.updated_at est timestamptz", async () => {
    const rows = await query(`
      select data_type from information_schema.columns
      where table_schema = 'public'
        and table_name = 'roadbooks'
        and column_name = 'updated_at'
    `);
    return rows[0]?.data_type === "timestamp with time zone";
  });

  // 2. Fonction set_updated_at existe
  await check("Fonction set_updated_at existe", async () => {
    const rows = await query(`
      select count(*)::int as cnt from information_schema.routines
      where routine_schema = 'public'
        and routine_name = 'set_updated_at'
    `);
    return rows[0]?.cnt > 0;
  });

  // 3. Fonction touch_roadbook existe
  await check("Fonction touch_roadbook existe", async () => {
    const rows = await query(`
      select count(*)::int as cnt from information_schema.routines
      where routine_schema = 'public'
        and routine_name = 'touch_roadbook'
    `);
    return rows[0]?.cnt > 0;
  });

  // 4. Trigger stages
  await check("Trigger trg_stages_touch_roadbook present", async () => {
    const rows = await query(`
      select count(*)::int as cnt from information_schema.triggers
      where trigger_name = 'trg_stages_touch_roadbook'
        and event_object_table = 'stages'
    `);
    return rows[0]?.cnt > 0;
  });

  // 5. Trigger POIs
  await check("Trigger trg_pois_touch_roadbook present", async () => {
    const rows = await query(`
      select count(*)::int as cnt from information_schema.triggers
      where trigger_name = 'trg_pois_touch_roadbook'
        and event_object_table = 'stage_pois'
    `);
    return rows[0]?.cnt > 0;
  });

  // 6. Trigger variants
  await check("Trigger trg_variants_touch_roadbook present", async () => {
    const rows = await query(`
      select count(*)::int as cnt from information_schema.triggers
      where trigger_name = 'trg_variants_touch_roadbook'
        and event_object_table = 'stage_variants'
    `);
    return rows[0]?.cnt > 0;
  });

  // 7. Trigger media
  await check("Trigger trg_media_touch_roadbook present", async () => {
    const rows = await query(`
      select count(*)::int as cnt from information_schema.triggers
      where trigger_name = 'trg_media_touch_roadbook'
        and event_object_table = 'media'
    `);
    return rows[0]?.cnt > 0;
  });

  // 8. Couverture INSERT/UPDATE/DELETE pour chaque trigger
  await check("Trigger stages couvre INSERT UPDATE DELETE", async () => {
    const rows = await query(`
      select string_agg(event_manipulation, ',' order by event_manipulation) as events
      from information_schema.triggers
      where trigger_name = 'trg_stages_touch_roadbook'
        and event_object_table = 'stages'
    `);
    return rows[0]?.events?.includes("INSERT")
      && rows[0]?.events?.includes("UPDATE")
      && rows[0]?.events?.includes("DELETE");
  });

  // 9. Absence de content_version
  await check("content_version n existe PAS sur roadbooks", async () => {
    const rows = await query(`
      select count(*)::int as cnt from information_schema.columns
      where table_schema = 'public'
        and table_name = 'roadbooks'
        and column_name = 'content_version'
    `);
    return rows[0]?.cnt === 0;
  });

  // 10. Index
  await check("Index idx_stages_roadbook present", async () => {
    const rows = await query(`
      select count(*)::int as cnt from pg_indexes
      where tablename = 'stages'
        and indexname = 'idx_stages_roadbook'
    `);
    return rows[0]?.cnt > 0;
  });
} finally {
  await pool.end();
}

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
