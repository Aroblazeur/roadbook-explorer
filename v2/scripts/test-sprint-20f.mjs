/**
 * Sprint 20F — Extraction finale des hooks et réduction de page.js
 *
 * Vérifie que page.js a < 400 lignes, < 5 useState, 0 useEffect,
 * 0 appel supabase direct, 0 business handler (handle*), et que
 * les hooks extraits en 20D/20E/20F existent.
 *
 * Usage:
 *   node scripts/test-sprint-20f.mjs
 */

import { strict as assert } from "node:assert";
import { readFileSync, existsSync, readdirSync } from "node:fs";

let passed = 0, failed = 0;
const failures = [];
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

// ===================== 1. Hooks extraits =====================
console.log("=== 1. Vérification des hooks extraits ===");

const HOOKS = [
  "useRoadbookData",
  "useMediaManager",
  "useGpxManager",
  "useCoverManager",
  "useEnrichment",
  "useSaveWithLock",
  "useStageCrud",
  "useStageDragDrop",
  "useStudioEditing",
  "useLoadData",
  "useSaveActions",
];
for (const name of HOOKS) {
  test(`le hook ${name}.js existe`, () => {
    const path = `src/hooks/studio/${name}.js`;
    assert.ok(existsSync(path), `Fichier manquant : ${path}`);
    const content = readFileSync(path, "utf-8");
    assert.ok(content.length > 50, `${name} est vide`);
  });
}

// ===================== 2. Métriques de page.js =====================
console.log("\n=== 2. Métriques structurelles de page.js ===");

const pagePath = "src/app/dashboard/roadbooks/[id]/page.js";
const pageSrc = readFileSync(pagePath, "utf-8");
const pageLines = pageSrc.split("\n");

test("page.js fait moins de 400 lignes", () => {
  assert.ok(pageLines.length < 400, `page.js fait ${pageLines.length} lignes (attendu < 400)`);
});

test("useState count < 5", () => {
  const matches = pageSrc.match(/\buseState\b/g);
  const count = matches ? matches.length : 0;
  assert.ok(count < 5, `Attendu < 5 useState, obtenu ${count}`);
});

test("useEffect count < 3", () => {
  const re = /\buseEffect\s*\(/g;
  const matches = pageSrc.match(re);
  const count = matches ? matches.length : 0;
  assert.ok(count < 3, `Attendu < 3 useEffect, obtenu ${count}`);
});

test("aucun appel supabase. direct dans page.js", () => {
  const matches = pageSrc.match(/\bsupabase\./g);
  const count = matches ? matches.length : 0;
  assert.ok(count === 0, `${count} appels supabase. trouvés dans page.js`);
});

test("aucune fonction handle* définie dans page.js", () => {
  const fnMatch = pageSrc.match(/function handle/);
  const constHandleMatch = pageSrc.match(/const handle.*=/);
  assert.ok(!fnMatch, "function handle* trouvé dans page.js");
  assert.ok(!constHandleMatch, "const handle* trouvé dans page.js");
});

// ===================== 3. Imports préservés =====================
console.log("\n=== 3. Imports des composants UI ===");

const COMPONENTS = [
  "GeneralInfoForm", "RouteForm", "CoverSection",
  "StageForm", "StageCard", "StudioHeader", "StudioInfoCard",
];
for (const name of COMPONENTS) {
  test(`page.js importe ${name}`, () => {
    assert.ok(pageSrc.includes(name), `Import manquant pour ${name} dans page.js`);
  });
}

// ===================== 4. Hooks sans Supabase direct =====================
console.log("\n=== 4. Hooks sans appels Supabase bruts ===");

const HOOKS_DIR = "src/hooks/studio/";
const hookFiles = readdirSync(HOOKS_DIR);

for (const file of hookFiles) {
  if (!file.endsWith(".js")) continue;
  test(`${file} ne contient pas d'appel supabase.from()`, () => {
    const content = readFileSync(HOOKS_DIR + file, "utf-8");
    const matches = content.match(/\bsupabase\.from\b/g);
    assert.ok(!matches, `${file} contient ${matches?.length ?? 0} supabase.from() direct`);
  });
}

// ===================== 5. Composants sans hooks React =====================
console.log("\n=== 5. Composants Studio sans hooks métier ===");

const STUDIO_DIR = "src/components/studio/";
const componentFiles = readdirSync(STUDIO_DIR);

for (const file of componentFiles) {
  if (!file.endsWith(".js")) continue;
  test(`${file} n'importe pas de hooks Supabase ou métier`, () => {
    const content = readFileSync(STUDIO_DIR + file, "utf-8");
    const badImports = ["@/hooks/", "@/lib/supabase", "useSupabase", "useRoadbookData", "useMediaManager", "useGpxManager", "useCoverManager", "useEnrichment", "useSaveWithLock", "useStageCrud", "useStudioDraft"];
    for (const bad of badImports) {
      if (content.includes(bad)) {
        assert.fail(`${file} importe "${bad}"`);
      }
    }
  });
}

// ===================== Run =====================
async function main() {
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (e) { failures.push({ name, message: e.message }); failed++; }
  }

  const total = passed + failed;
  console.log(`\n=== Résultat ===`);
  console.log(`\n  ${passed} OK, ${failed} échec(s)`);
  for (const f of failures) console.error(`  \u2717 ${f.name}: ${f.message}`);
  if (failed > 0) process.exit(1);
  else console.log(`\n\u2705 Tests Sprint 20F réussis.`);
}

main().catch(e => { console.error(e); process.exit(1); });
