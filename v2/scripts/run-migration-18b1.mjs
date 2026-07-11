#!/usr/bin/env node
/**
 * Sprint 18B.1 — Migration runner for stage_variants columns
 *
 * Attempts to apply the migration SQL via:
 *   1. supabase.rpc("exec_sql") — requires the exec_sql function to exist
 *   2. If not available, prints the SQL for manual execution in Supabase SQL Editor
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "..", ".env.local");

// Load env
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

const migrationPath = path.resolve(__dirname, "..", "supabase", "migrations", "20260711-001-add-variant-columns.sql");
const sql = fs.readFileSync(migrationPath, "utf-8");

async function main() {
  console.log(`Target: ${supabaseUrl}`);
  console.log("Migration: 20260711-001-add-variant-columns.sql\n");

  // Try RPC method first
  console.log("1. Attempting supabase.rpc('exec_sql')...");
  const { error: rpcError } = await supabase.rpc("exec_sql", { sql_text: sql });
  if (!rpcError) {
    console.log("   ✅ Migration completed successfully via exec_sql RPC.\n");
    return;
  }
  console.log(`   ❌ RPC failed: ${rpcError.message}`);

  // Try raw SQL query via REST API
  console.log("\n2. Attempting direct SQL via REST API...");
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": serviceRoleKey,
        "Authorization": `Bearer ${serviceRoleKey}`,
        "Prefer": "params=single-object",
      },
      body: JSON.stringify({ query: sql }),
    });
    const text = await response.text();
    if (response.ok) {
      console.log("   ✅ Migration completed via REST API.\n");
      return;
    }
    console.log(`   ❌ REST API failed: ${response.status} ${text.substring(0, 200)}`);
  } catch (err) {
    console.log(`   ❌ REST API error: ${err.message}`);
  }

  // Fallback: provide manual instructions
  console.log("\n============================================================");
  console.log("  MANUAL STEP REQUIRED");
  console.log("============================================================");
  console.log("Could not apply migration programmatically.");
  console.log("Please run the following SQL in your Supabase SQL Editor:");
  console.log("  Dashboard → https://supabase.com/dashboard/project/wuberwxheznzntdyqwyj/sql/new\n");
  console.log(sql);
  console.log("============================================================\n");
}

main().catch(console.error);
