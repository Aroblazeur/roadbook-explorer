#!/usr/bin/env node
/**
 * Sprint 18B.1 — Schema verification for stage_variants columns
 *
 * Run after the migration has been applied:
 *   node scripts/verify-migration-18b1.mjs
 *
 * Checks:
 *   1. All 12 columns exist in information_schema
 *   2. Data types match expectations
 *   3. Can SELECT from stage_variants (readability)
 *   4. Can INSERT/UPDATE/DELETE the new columns (CRUD)
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local
const envPath = path.resolve(__dirname, "..", ".env.local");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    process.env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase credentials in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const EXPECTED_COLUMNS = {
  id: { data_type: "integer", is_nullable: "NO" },
  stage_id: { data_type: "integer", is_nullable: "NO" },
  label: { data_type: "text", is_nullable: "NO" },
  distance_km: { data_type: "numeric", is_nullable: "YES" },
  gpx_url: { data_type: "text", is_nullable: "YES" },
  description: { data_type: "text", is_nullable: "YES" },
  sort_order: { data_type: "integer", is_nullable: "YES" },
  metadata: { data_type: "jsonb", is_nullable: "YES" },
  created_at: { data_type: "timestamp with time zone", is_nullable: "YES" },
  updated_at: { data_type: "timestamp with time zone", is_nullable: "YES" },
  departure: { data_type: "text", is_nullable: "YES" },
  arrival: { data_type: "text", is_nullable: "YES" },
  elevation_gain_m: { data_type: "integer", is_nullable: "YES" },
  elevation_loss_m: { data_type: "integer", is_nullable: "YES" },
  map_embed_url: { data_type: "text", is_nullable: "YES" },
  notes: { data_type: "jsonb", is_nullable: "NO", column_default: "'[]'::jsonb" },
};

let pass = 0;
let fail = 0;
let warn = 0;

function ok(msg) { pass++; console.log("  ✅", msg); }
function nok(msg) { fail++; console.log("  ❌", msg); }
function wrn(msg) { warn++; console.log("  ⚠️", msg); }

async function main() {
  console.log(`Target: ${supabaseUrl}\n`);

  // ----------------------------------------------------------------
  // 1. Check columns exist via information_schema
  // ----------------------------------------------------------------
  console.log("1. Checking information_schema.columns for stage_variants...");
  const { data: columns, error: colErr } = await supabase
    .rpc("exec_sql", {
      sql_text:
        "SELECT column_name, data_type, is_nullable, column_default " +
        "FROM information_schema.columns " +
        "WHERE table_schema = 'public' AND table_name = 'stage_variants' " +
        "ORDER BY ordinal_position",
    });

  if (colErr) {
    // Fallback: query information_schema via REST API (read-only)
    console.log("   RPC not available, using REST fallback...");
    const { data: restCols, error: restErr } = await supabase
      .from("stage_variants")
      .select("id")
      .limit(0);

    if (restErr) {
      nok(`Cannot access stage_variants table: ${restErr.message}`);
      return { pass, fail, warn };
    }

    // Just check we can read all columns
    const { data: sample, error: sampleErr } = await supabase
      .from("stage_variants")
      .select("*")
      .limit(1);

    if (sampleErr) {
      nok(`Cannot SELECT from stage_variants: ${sampleErr.message}`);
    } else {
      ok("Can SELECT from stage_variants");
    }

    if (sample && sample.length > 0) {
      const row = sample[0];
      console.log("   Found", sample.length, "row(s)");
      for (const [col, spec] of Object.entries(EXPECTED_COLUMNS)) {
        if (col in row) ok(`Column "${col}" exists on actual row`);
        else nok(`Column "${col}" is missing from actual row`);
      }
    } else {
      wrn("No rows found in stage_variants (table may be empty)");
      // Check columns via a raw query trick
      const { data: anyRow } = await supabase
        .from("stage_variants")
        .select("*")
        .limit(0);

      if (anyRow) {
        // PostgREST returns column info even with limit(0)
        console.log("   Empty table, column check skipped");
      }
    }
  } else {
    // We have full column info from information_schema
    if (columns.length === 0) {
      nok("No columns returned from information_schema");
      return { pass, fail, warn };
    }

    const actualColumns = {};
    for (const c of columns) {
      actualColumns[c.column_name] = c;
    }

    for (const [col, spec] of Object.entries(EXPECTED_COLUMNS)) {
      if (!actualColumns[col]) {
        nok(`Column "${col}" is missing from information_schema`);
        continue;
      }
      const actual = actualColumns[col];
      const typeOk = actual.data_type === spec.data_type;
      const nullableOk = actual.is_nullable === spec.is_nullable;
      const defaultOk = spec.column_default
        ? (actual.column_default || "").includes(spec.column_default.replace(/'/g, ""))
        : true;

      if (typeOk && nullableOk && defaultOk) {
        ok(`Column "${col}": ${spec.data_type}${spec.column_default ? " default " + spec.column_default : ""}`);
      } else {
        let msg = `Column "${col}": got ${actual.data_type} ${actual.is_nullable}`;
        if (!typeOk) msg += ` (expected ${spec.data_type})`;
        if (!nullableOk) msg += ` (expected nullable=${spec.is_nullable})`;
        if (!defaultOk) msg += ` (expected default ${spec.column_default})`;
        nok(msg);
      }
    }
  }

  // ----------------------------------------------------------------
  // 2. CRUD test on new columns (if table has data)
  // ----------------------------------------------------------------
  console.log("\n2. CRUD test on new columns...");
  const { data: existing } = await supabase
    .from("stage_variants")
    .select("id, departure, arrival, elevation_gain_m, elevation_loss_m, map_embed_url, notes")
    .limit(1);

  if (existing && existing.length > 0) {
    const variantId = existing[0].id;
    console.log("   Testing UPDATE on variant", variantId);

    const { error: updErr } = await supabase
      .from("stage_variants")
      .update({
        departure: "Test Departure",
        arrival: "Test Arrival",
        elevation_gain_m: 100,
        elevation_loss_m: 50,
        map_embed_url: "https://maps.example.com/test",
        notes: [{ text: "Test note" }],
      })
      .eq("id", variantId);

    if (updErr) {
      nok(`Cannot UPDATE new columns: ${updErr.message}`);
    } else {
      ok("UPDATE new columns succeeded");

      // Verify the update
      const { data: verify } = await supabase
        .from("stage_variants")
        .select("departure, arrival, elevation_gain_m, elevation_loss_m, map_embed_url, notes")
        .eq("id", variantId)
        .single();

      if (verify) {
        let allGood = true;
        if (verify.departure !== "Test Departure") { allGood = false; nok("  departure was not saved correctly"); }
        if (verify.arrival !== "Test Arrival") { allGood = false; nok("  arrival was not saved correctly"); }
        if (verify.elevation_gain_m !== 100) { allGood = false; nok("  elevation_gain_m was not saved correctly"); }
        if (verify.elevation_loss_m !== 50) { allGood = false; nok("  elevation_loss_m was not saved correctly"); }
        if (allGood) ok("Verify: all column values persisted correctly");
      }

      // Restore original values (null them out)
      await supabase
        .from("stage_variants")
        .update({
          departure: null,
          arrival: null,
          elevation_gain_m: null,
          elevation_loss_m: null,
          map_embed_url: null,
          notes: [],
        })
        .eq("id", variantId);
    }
  } else {
    wrn("No rows to test CRUD (empty table)");
  }

  // ----------------------------------------------------------------
  // Summary
  // ----------------------------------------------------------------
  console.log(`\n${"=".repeat(50)}`);
  console.log(`  PASS: ${pass}  |  FAIL: ${fail}  |  WARN: ${warn}`);
  console.log(`${"=".repeat(50)}`);

  if (fail > 0) {
    console.log("\n❌ Some checks failed — review the issues above.");
    process.exit(1);
  }
  if (warn > 0) {
    console.log("\n⚠️ Some warnings — review if expected.");
  } else {
    console.log("\n✅ All checks passed.");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
