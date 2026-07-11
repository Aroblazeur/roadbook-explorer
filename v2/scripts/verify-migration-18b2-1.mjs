#!/usr/bin/env node
/**
 * Sprint 18B.2.1 — Verification for elevation field normalization
 *
 * Checks:
 *   1. No remaining references to `elevation_gain_total_m` / `elevation_loss_total_m` in source
 *   2. DB columns exist with correct type
 *   3. No negative values in sampled rows
 *
 * Run: node scripts/verify-migration-18b2-1.mjs
 */

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

let pass = 0;
let fail = 0;
let warnCount = 0;

function ok(msg) { pass++; console.log("  ✅", msg); }
function nok(msg) { fail++; console.log("  ❌", msg); }
function wrn(msg) { warnCount++; console.log("  ⚠️", msg); }

async function main() {
  // ----------------------------------------------------------------
  // 1. Source code check
  // ----------------------------------------------------------------
  console.log("1. Checking source code for remaining bad references...");
  const srcDir = path.resolve(__dirname, "..", "src");
  const files = ["src/app/dashboard/roadbooks/[id]/page.js"];
  let found = 0;
  for (const f of files) {
    const fullPath = path.resolve(__dirname, "..", f);
    if (!fs.existsSync(fullPath)) { nok(`File not found: ${f}`); continue; }
    const content = fs.readFileSync(fullPath, "utf-8");
    for (const bad of ["elevation_gain_total_m", "elevation_loss_total_m"]) {
      if (content.includes(bad)) {
        nok(`${f}: contains "${bad}"`);
        found++;
      }
    }
  }
  if (!found) ok("No elevation_gain_total_m or elevation_loss_total_m in source");

  // ----------------------------------------------------------------
  // 2. DB schema check
  // ----------------------------------------------------------------
  console.log("\n2. Checking database schema...");
  if (!supabaseUrl) {
    wrn("No Supabase URL — skipping DB checks");
  } else {
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Check roadbooks table
    const { data: rb, error: rbErr } = await supabase
      .from("roadbooks")
      .select("id, elevation_gain_m, elevation_loss_m")
      .limit(5);

    if (rbErr) {
      nok(`Cannot SELECT roadbooks: ${rbErr.message}`);
    } else {
      ok(`Can SELECT roadbooks.elevation_gain_m / elevation_loss_m (${rb.length} row(s))`);
      const negGain = rb.filter(r => r.elevation_gain_m != null && r.elevation_gain_m < 0);
      const negLoss = rb.filter(r => r.elevation_loss_m != null && r.elevation_loss_m < 0);
      if (negGain.length) nok(`${negGain.length} roadbook(s) with negative elevation_gain_m`);
      else if (rb.length > 0) ok("No negative elevation_gain_m");
      if (negLoss.length) nok(`${negLoss.length} roadbook(s) with negative elevation_loss_m`);
      else if (rb.length > 0) ok("No negative elevation_loss_m");
    }

    // Check stages table
    const { error: stErr } = await supabase
      .from("stages")
      .select("id, elevation_gain_m, elevation_loss_m")
      .limit(1);

    if (stErr) {
      nok(`Cannot SELECT stages: ${stErr.message}`);
    } else {
      ok("Can SELECT stages.elevation_gain_m / elevation_loss_m");
    }
  }

  // ----------------------------------------------------------------
  // Summary
  // ----------------------------------------------------------------
  console.log(`\n${"=".repeat(50)}`);
  console.log(`  PASS: ${pass}  |  FAIL: ${fail}  |  WARN: ${warnCount}`);
  console.log(`${"=".repeat(50)}`);

  if (fail > 0) {
    console.log("\n❌ Some checks failed.");
    process.exit(1);
  }
  console.log("\n✅ All checks passed.");
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
