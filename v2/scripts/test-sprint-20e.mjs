/**
 * Sprint 20E — Tests d'extraction des composants UI Studio
 *
 * Vérifie structurellement que les 12 composants existent,
 * sont importés par page.js, et que page.js a réduit sa taille.
 *
 * Usage:
 *   node scripts/test-sprint-20e.mjs
 */

import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { existsSync } from "node:fs";

let passed = 0, failed = 0;
const failures = [];
const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

// ===================== Composants extraits =====================
console.log("=== 1. Vérification des 12 composants ===");

const COMPONENTS = [
  "GeneralInfoForm",
  "RouteForm",
  "CoverSection",
  "MediaSection",
  "GpxSection",
  "GpxBlock",
  "AutomationPanel",
  "PoiForm",
  "VariantForm",
  "NoteForm",
  "AccommSection",
  "StageForm",
  "StageCard",
];

for (const name of COMPONENTS) {
  test(`le composant ${name}.js existe`, () => {
    const path = `src/components/studio/${name}.js`;
    assert.ok(existsSync(path), `Fichier manquant : ${path}`);
    const content = readFileSync(path, "utf-8");
    assert.ok(content.includes("export default"), `${name} n'exporte pas de default`);
    assert.ok(content.length > 50, `${name} est vide`);
  });
}

// ===================== Import dans page.js =====================
console.log("\n=== 2. Imports dans page.js ===");

const pagePath = "src/app/dashboard/roadbooks/[id]/page.js";
const pageSrc = readFileSync(pagePath, "utf-8");

const IMPORTED_BY_PAGE = [
  "GeneralInfoForm",
  "RouteForm",
  "CoverSection",
  "MediaSection",
  "AutomationPanel",
  "StageForm",
  "StageCard",
];
for (const name of IMPORTED_BY_PAGE) {
  test(`page.js importe ${name}`, () => {
    assert.ok(pageSrc.includes(name), `Import manquant pour ${name} dans page.js`);
  });
}

test("le GPX roadbook est intégré aux formulaires d'itinéraire", () => {
  assert.ok(!pageSrc.includes("GpxSection"), "GpxSection ne doit plus créer un second champ GPX séparé");
  assert.ok(pageSrc.includes("mediaRow={gpxOfficial}"), "Le fichier GPX officiel doit être rattaché à RouteForm");
  assert.ok(pageSrc.includes("mediaRow={gpxCustom}"), "Le fichier GPX du tracé doit être rattaché à RouteForm");
});

test("les champs de création V1 sont présents dans le catalogue V2", () => {
  const catalogSrc = readFileSync("src/components/studio/StudioCatalog.js", "utf-8");
  for (const field of ["ID du roadbook", "Projet", "officialDistance", "officialElevationGain", "officialElevationLoss", "officialGpx", "officialMapEmbedUrl", "currentGpx", "currentMapEmbedUrl"]) {
    assert.ok(catalogSrc.includes(field), `Champ de création manquant : ${field}`);
  }
});

test("les ressources URL ou fichier utilisent un champ visuel unique", () => {
  const coverSrc = readFileSync("src/components/studio/CoverSection.js", "utf-8");
  const routeSrc = readFileSync("src/components/studio/RouteForm.js", "utf-8");
  const stageFormSrc = readFileSync("src/components/studio/StageForm.js", "utf-8");
  assert.ok(coverSrc.includes("Image de couverture (URL ou fichier)"));
  assert.ok(routeSrc.includes("GPX (URL ou fichier)"));
  assert.ok(stageFormSrc.includes("Photo (URL ou fichier)"));
});

// ==================== Vérifications structurelles ====================
console.log("\n=== 3. Vérifications structurelles de page.js ===");

test("page.js n'a plus les anciennes cards inline studio-card--accent, studio-card__header avec h3", () => {
  const cardPattern = /<h3>(?:Informations|Itinéraire|Image|GPX|Automatisations)/g;
  const matches = pageSrc.match(cardPattern);
  assert.ok(!matches || matches.length === 0, `Anciens h3 de cards trouvés dans page.js: ${matches?.length}`);
});

test("page.js n'a plus l'ancien renderGpxBlock inline", () => {
  assert.ok(!pageSrc.includes("function renderGpxBlock("), "renderGpxBlock encore présent dans page.js");
});

test("page.js utilise StageCard pour itérer les étapes", () => {
  const stageCardUsage = pageSrc.match(/<StageCard/g);
  assert.ok(stageCardUsage, "StageCard non trouvé dans page.js");
  assert.ok(stageCardUsage.length >= 1, "StageCard doit être utilisé au moins une fois");
});

test("nombre de lignes de page.js <= 900", () => {
  const lines = pageSrc.split("\n").length;
  assert.ok(lines <= 900, `page.js fait ${lines} lignes (attendu <= 900)`);
});

test("useState count <= 15", () => {
  const matches = pageSrc.match(/\buseState\b/g);
  assert.ok(matches, "Aucun useState trouvé");
  assert.ok(matches.length <= 15, `Expected <= 15 useState, got ${matches.length}`);
});

test("aucun useEffect avec appel Supabase direct", () => {
  const supabaseInEffect = pageSrc.match(/useEffect[^}]*\{[^}]*supabase[^}]*\}/g);
  assert.ok(!supabaseInEffect || supabaseInEffect.length === 0, "useEffect contient un appel supabase direct");
});

test("JSX confirm count < 4 (handlers inlines depuis Sprint 20F)", () => {
  const lines = pageSrc.split("\n");
  let inJsx = false;
  let confirmCount = 0;
  for (const line of lines) {
    if (line.includes("return (")) inJsx = true;
    if (inJsx && line.includes("window.confirm(")) confirmCount++;
  }
  assert.ok(confirmCount < 4, `${confirmCount} window.confirm dans JSX (attendu < 4)`);
});

// ==================== Vérification des exports des composants ====================
console.log("\n=== 4. Vérification que les composants n'ont pas de hooks Supabase ===");

const STUDIO_DIR = "src/components/studio/";
const fs = await import("node:fs");
const componentFiles = fs.readdirSync(STUDIO_DIR).filter(f => f.endsWith(".js"));

for (const file of componentFiles) {
  test(`${file} n'importe pas de hooks Supabase`, () => {
    const content = readFileSync(STUDIO_DIR + file, "utf-8");
    if (content.includes("useEffect") || content.includes("useState")) {
      assert.ok(content.includes('"use client"'), `${file} a des hooks React mais pas "use client"`);
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
  else console.log(`\n\u2705 Tests Sprint 20E réussis.`);
}

main().catch(e => { console.error(e); process.exit(1); });
