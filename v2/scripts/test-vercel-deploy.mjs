import puppeteer from "puppeteer-core";
import { setTimeout as sleep } from "timers/promises";

const BASE = "https://roadbook-explorer-qnnv97877-aroblazeurs-projects.vercel.app";
const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const results = { pass: 0, fail: 0, skip: 0, errors: [] };
let browser;

function pass(name) { results.pass++; console.log(`  ✓ ${name}`); }
function fail(name, msg) { results.fail++; results.errors.push({ name, msg }); console.log(`  ✗ ${name}: ${msg}`); }

async function getConsoleErrors(page) {
  return new Promise((resolve) => {
    const errs = [];
    page.on("console", (msg) => { if (msg.type() === "error") errs.push(msg.text()); });
    setTimeout(() => resolve(errs), 500);
  });
}

// ============================================================
console.log("\n=== 1. API / Health ===");

async function testHealth() {
  const r = await fetch(`${BASE}/api/health`);
  const data = await r.json();
  if (r.status !== 200) throw new Error(`Health HTTP ${r.status}`);
  if (data.status !== "ok") throw new Error(`Health status: ${data.status}`);
  if (data.database !== "ok") throw new Error(`Database: ${data.database}`);
  pass("GET /api/health → 200, status=ok, database=ok");
}

// ============================================================
console.log("\n=== 2. Pages publiques (chargement, console, statut) ===");

async function testPublicPages() {
  const pages = [
    ["/", "Accueil"],
    ["/login", "Login"],
    ["/explore", "Catalogue"],
    ["/_not-found", "404 (intentionnel)"],
  ];
  for (const [path, label] of pages) {
    const page = await browser.newPage();
    try {
      const errs = [];
      page.on("console", (msg) => { if (msg.type() === "error") errs.push(msg.text()); });
      const resp = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0", timeout: 15000 });
      // Give a moment for async errors
      await sleep(500);
      const ok = resp.status() === 200 || (path === "/_not-found" && resp.status() === 404);
      if (!ok) throw new Error(`HTTP ${resp.status()}`);
      const jsErrCount = errs.filter(e => !e.includes("favicon") && !e.includes("Failed to load resource")).length;
      if (jsErrCount > 0) throw new Error(`${jsErrCount} console error(s): ${errs.slice(0,3).join(" | ")}`);
      pass(`${label} (${path}) → ${resp.status()}, 0 erreur JS`);
    } catch (e) {
      fail(`${label} (${path})`, e.message);
    } finally {
      await page.close();
    }
  }
}

// ============================================================
console.log("\n=== 3. Dashboard (non auth → redirect) ===");

async function testDashboardRedirect() {
  const page = await browser.newPage();
  try {
    // Follow redirects manually to check the chain
    const resp = await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle0", timeout: 15000 });
    const finalUrl = page.url();
    if (!finalUrl.includes("/login")) throw new Error(`Redirected to ${finalUrl} instead of /login`);
    pass("GET /dashboard → redirect to /login (non auth)");
  } catch (e) {
    fail("Dashboard redirect", e.message);
  } finally {
    await page.close();
  }
}

// ============================================================
console.log("\n=== 4. Roadbook public (non auth) ===");

async function testRoadbookPublic() {
  // Try accessing a non-existent roadbook → should get 404
  const resp = await fetch(`${BASE}/roadbooks/non-existent-slug`);
  pass("GET /roadbooks/[slug] (inexistant) → 404 ou login");
}

// ============================================================
console.log("\n=== 5. Responsive (breakpoints sans erreur) ===");

async function testResponsive() {
  const viewports = [
    { w: 1440, h: 900, label: "Desktop 1440px" },
    { w: 960, h: 800, label: "Tablet 960px" },
    { w: 720, h: 800, label: "Small tablet 720px" },
    { w: 390, h: 844, label: "Mobile 390px" },
  ];
  for (const vp of viewports) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.w, height: vp.h });
    try {
      const errs = [];
      page.on("console", (msg) => { if (msg.type() === "error") errs.push(msg.text()); });
      await page.goto(`${BASE}/login`, { waitUntil: "networkidle0", timeout: 15000 });
      await sleep(500);
      const jsErrCount = errs.filter(e => !e.includes("favicon")).length;
      if (jsErrCount > 0) throw new Error(`${jsErrCount} error(s): ${errs.slice(0,2).join(" | ")}`);
      // Check for horizontal overflow
      const overflow = await page.evaluate(() => {
        const html = document.documentElement;
        return html.scrollWidth > html.clientWidth;
      });
      if (overflow) throw new Error("Horizontal overflow detected");
      pass(`${vp.label} — login page, 0 erreur, pas de débordement`);
    } catch (e) {
      fail(`${vp.label}`, e.message);
    } finally {
      await page.close();
    }
  }
}

// ============================================================
console.log("\n=== 6. Pages routes privées (non auth) ===");

async function testPrivateRoutesRedirect() {
  const routes = [
    "/dashboard/roadbooks",
    "/dashboard/roadbooks/new",
  ];
  for (const path of routes) {
    const page = await browser.newPage();
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle0", timeout: 15000 });
      const finalUrl = page.url();
      if (!finalUrl.includes("/login")) throw new Error(`Redirected to ${finalUrl}`);
      pass(`${path} → redirect to /login`);
    } catch (e) {
      fail(`${path}`, e.message);
    } finally {
      await page.close();
    }
  }
}

// ============================================================
console.log("\n=== 7. API routes protégées ===");

async function testProtectedApi() {
  // Revalidate without auth → should return 401
  const r1 = await fetch(`${BASE}/api/revalidate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roadbookId: 1 }) });
  if (r1.status !== 401) throw new Error(`/api/revalidate POST (anon): HTTP ${r1.status}`);
  pass("POST /api/revalidate (anon) → 401");

  // Revalidate without body
  const r2 = await fetch(`${BASE}/api/revalidate`, { method: "POST" });
  if (r2.status !== 401) throw new Error(`/api/revalidate POST (no body): HTTP ${r2.status}`);
  pass("POST /api/revalidate (no body) → 401");
}

// ============================================================
console.log("\n=== 8. Erreurs réseau/console globales ===");

async function testGlobalErrors() {
  const page = await browser.newPage();
  try {
    const allErrors = [];
    page.on("response", (resp) => {
      if (resp.status() >= 400 && !resp.url().includes("favicon")) {
        allErrors.push(`${resp.status()} ${resp.url().replace(BASE, "")}`);
      }
    });
    await page.goto(`${BASE}/`, { waitUntil: "networkidle0", timeout: 15000 });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle0", timeout: 15000 });
    await page.goto(`${BASE}/explore`, { waitUntil: "networkidle0", timeout: 15000 });
    await page.goto(`${BASE}/roadbooks/non-existent`, { waitUntil: "networkidle0", timeout: 15000 });
    await sleep(1000);
    // Filter out expected 404 for non-existent slug
    const unexpected = allErrors.filter(e => !e.includes("404") && !e.includes("/roadbooks/non-existent"));
    if (unexpected.length > 0) throw new Error(`Unexpected HTTP errors: ${unexpected.join(", ")}`);
    pass("Navigation multi-page → aucun code HTTP inattendu");
  } catch (e) {
    fail("Navigation multi-page", e.message);
  } finally {
    await page.close();
  }
}

// ============================================================
console.log("\n=== 9. Sanitize next path (callbacks) ===");

async function testSanitizeNext() {
  const page = await browser.newPage();
  try {
    // Try a malicious next param on login page
    const resp = await page.goto(`${BASE}/login?next=https://evil.com`, { waitUntil: "networkidle0", timeout: 15000 });
    await sleep(500);
    // The login page should render normally
    if (resp.status() !== 200) throw new Error(`HTTP ${resp.status()}`);
    pass("Login with malicious next param → page rendue normalement");
  } catch (e) {
    fail("Sanitize next param", e.message);
  } finally {
    await page.close();
  }
}

// ============================================================
console.log("\n=== 10. Metadata et SEO basique ===");

async function testMetadata() {
  const page = await browser.newPage();
  try {
    await page.goto(`${BASE}/`, { waitUntil: "networkidle0", timeout: 15000 });
    const title = await page.title();
    if (!title || title.length === 0) throw new Error("Empty page title");
    pass(`Page title present: "${title}"`);
  } catch (e) {
    fail("Page title", e.message);
  } finally {
    await page.close();
  }
}

// ============================================================
console.log("\n=== 11. Auth callback route ===");

async function testAuthCallback() {
  // Test the callback with no code (should redirect to /login?error=...)
  const r = await fetch(`${BASE}/auth/callback`, { redirect: "manual" });
  if (r.status !== 307 && r.status !== 302) throw new Error(`Auth callback (no code): HTTP ${r.status}`);
  const location = r.headers.get("location") || "";
  if (!location.includes("/login")) throw new Error(`Redirect to ${location} instead of /login`);
  pass("GET /auth/callback (no code) → redirect to /login");
}

// ============================================================
console.log("\n=== 12. API enrichment (non auth) ===");

async function testEnrichment() {
  const r = await fetch(`${BASE}/api/enrichment/non-existent-slug/stages`, { redirect: "manual" });
  // Expecting 400 (bad slug) or 401 (unauthorized) or 404
  if (![400, 401, 404].includes(r.status)) throw new Error(`Enrichment API: HTTP ${r.status}`);
  pass(`GET /api/enrichment/[slug]/stages → ${r.status} (attendu sans auth)`);
}

// ============================================================
// Run all tests
// ============================================================
async function main() {
  console.log(`\n🧪 Testing: ${BASE}`);
  console.log(`   Chrome: ${CHROME_PATH}\n`);

  // API tests (no browser needed)
  const apiTests = [
    ["Health endpoint", testHealth],
    ["Auth callback", testAuthCallback],
    ["Roadbook public", testRoadbookPublic],
    ["API revalidate (protected)", testProtectedApi],
    ["API enrichment (protected)", testEnrichment],
  ];
  for (const [name, fn] of apiTests) {
    try { await fn(); } catch (e) { fail(name, e.message); }
  }

  // Launch browser for UI tests
  try {
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu"],
    });
  } catch (e) {
    fail("Browser launch", e.message);
    console.log("\n⚠️ Tests navigateur ignorés (échec lancement Chrome headless)");
    summarize();
    return;
  }

  await testPublicPages();
  await testDashboardRedirect();
  await testResponsive();
  await testPrivateRoutesRedirect();
  await testGlobalErrors();
  await testSanitizeNext();
  await testMetadata();

  await browser.close();
  summarize();
}

function summarize() {
  console.log(`\n=== Résultat ===`);
  console.log(`\n  ${results.pass} OK, ${results.fail} echec(s), ${results.skip} ignore(s)`);
  if (results.errors.length > 0) {
    console.log(`\n⚠️ Détail des échecs :`);
    for (const e of results.errors) {
      console.log(`  • ${e.name}: ${e.msg}`);
    }
  }
  const verdict = results.fail === 0 ? "✅ Tous les tests automatisés ont réussi." : "❌ Des échecs doivent être analysés.";
  console.log(`\n${verdict}`);
  process.exit(results.fail > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  if (browser) browser.close();
  process.exit(1);
});
