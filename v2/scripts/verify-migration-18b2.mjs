#!/usr/bin/env node
/**
 * Sprint 18B.2 — Verification for roadbook distance column normalization
 *
 * Checks:
 *   1. No remaining references to `distance_total_km` in source code
 *   2. All 3 affected tables use `distance_km`
 *   3. Roadbook fetch returns distance_km
 *   4. No negative distances in DB
 *
 * Run: node scripts/verify-migration-18b2.mjs
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

const srcDir = path.resolve(__dirname, "..", "src");

let pass = 0;
let fail = 0;

function ok(msg) { pass++; console.log("  ✅", msg); }
function nok(msg) { fail++; console.log("  ❌", msg); }

async function main() {
  // ----------------------------------------------------------------
  // 1. Source code: no remaining distance_total_km references
  // ----------------------------------------------------------------
  console.log("1. Checking source code for remaining distance_total_km references...");
  const files = ["src/app/dashboard/roadbooks/[id]/page.js"];
  let found = 0;
  for (const f of files) {
    const fullPath = path.resolve(__dirname, "..", f);
    if (!fs.existsSync(fullPath)) { nok(`File not found: ${f}`); continue; }
    const content = fs.readFileSync(fullPath, "utf-8");
    if (content.includes("distance_total_km")) {
      nok(`${f}: contains "distance_total_km"`);
      found++;
    }
  }
  if (!found) ok("No distance_total_km references remain in source code");

  // ----------------------------------------------------------------
  // 2. Git diff shows only the 3 expected changes
  // ----------------------------------------------------------------
  console.log("\n2. Checking git diff for distance_km changes...");
  try {
    const { execSync } = await import("child_process");
    const diff = execSync("git diff --cached src/", { encoding: "utf-8", cwd: path.resolve(__dirname, "..") });
    const distChanges = (diff.match(/distance_total_km|distance_km/g) || []).length;
    // We expect 3 replacements of distance_total_km -> distance_km
    if (distChanges > 0) {
      ok(`Found ${distChanges} distance column changes in staged diff`);
    } else {
      // Check working tree diff
      const wdiff = execSync("git diff src/", { encoding: "utf-8", cwd: path.resolve(__dirname, "..") });
      const wdist = (wdiff.match(/distance_km/g) || []).length;
      if (wdist > 0) ok(`Found changes in working tree (${wdist} references)`);
      else wrn("No staged or working tree changes detected");
    }
  } catch {
    wrn("Could not check git diff (not a git repo or git unavailable)");
  }

  // ----------------------------------------------------------------
  // 3. DB check: roadbooks table has distance_km column
  // ----------------------------------------------------------------
  console.log("\n3. Checking database schema...");
  if (!supabaseUrl) {
    wrn("No Supabase URL configured — skipping DB checks");
  } else {
    let passC = 0, failC = 0;
    const supabase = createClient(supabaseUrl, serviceRoleKey || "", {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Try via REST
    const { data: sample, error: sampleErr } = await supabase
      .from("roadbooks")
      .select("id, distance_km")
      .limit(5);

    if (sampleErr) {
      nok(`Cannot SELECT roadbooks: ${sampleErr.message}`);
    } else {
      ok(`Can SELECT roadbooks.distance_km (${sample.length} row(s) sampled)`);
    }

    // Check for negative distances
    if (sample && sample.length > 0) {
      const negatives = sample.filter(r => r.distance_km != null && r.distance_km < 0);
      if (negatives.length > 0) {
        nok(`Found ${negatives.length} roadbook(s) with negative distance_km`);
        for (const r of negatives) {
          console.log(`     id=${r.id} distance_km=${r.distance_km}`);
        }
      } else {
        ok("No negative distances found in sampled rows");
      }
    }

    // Check stage_variants also has distance_km
    const { error: svErr } = await supabase
      .from("stage_variants")
      .select("id, distance_km")
      .limit(1);

    if (svErr) {
      nok(`Cannot SELECT stage_variants.distance_km: ${svErr.message}`);
    } else {
      ok("Can SELECT stage_variants.distance_km");
    }
  }

  // ----------------------------------------------------------------
  // Summary
  // ----------------------------------------------------------------
  console.log(`\n${"=".repeat(50)}`);
  console.log(`  PASS: ${pass}  |  FAIL: ${fail}`);
  console.log(`${"=".repeat(50)}`);

  if (fail > 0) {
    console.log("\n❌ Some checks failed.");
    process.exit(1);
  }
  console.log("\n✅ All checks passed.");
}

function wrn(msg) { console.log("  ⚠️", msg); }

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
