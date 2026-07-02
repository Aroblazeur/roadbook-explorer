"use strict";

const CACHE_PREFIX = "roadbook-engine";
const LEGACY_CACHE_PATTERNS = [/-roadbook(?:-|$)/i];
const CACHE_VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const ROADBOOK_ID = sanitizeRoadbookId(new URL(self.location.href).searchParams.get("roadbook")) || "perinexus";
const CACHE_NAME = `${CACHE_PREFIX}-${ROADBOOK_ID}-${CACHE_VERSION}`;
const DATA_CACHE_NAME = `${CACHE_PREFIX}-${ROADBOOK_ID}-data`;
const CATALOG_CACHE_NAME = `${CACHE_PREFIX}-catalog`;
const CATALOG_CACHE_KEY = `${self.location.origin}/roadbooks/catalog.json`;
const CATALOG_METADATA_KEY = `${CATALOG_CACHE_KEY}#meta`;
const CATALOG_STALE_TTL_MS = 5 * 60 * 1000;
const STATIC_DESTINATIONS = new Set(["style", "script", "image", "font", "manifest", "audio", "video"]);
const CORE_ASSETS = [
    "./",
    "index.html",
    "style.css",
    "roadbook-config.js",
    "app.js",
    "data-loader.js",
    "map-viewer.js",
    "accommodation-enrichment-loader.js",
    "poi-enrichment-loader.js",
    "duration-estimator.js",
    `roadbooks/${ROADBOOK_ID}/config.js`,
    "manifest.webmanifest",
    "icons/icon.svg",
];
const DATA_ASSETS = [
    `roadbooks/${ROADBOOK_ID}/roadbook.json`,
    `roadbooks/${ROADBOOK_ID}/data/accommodation-enrichment.json`,
    `roadbooks/${ROADBOOK_ID}/data/poi-enrichment.json`
];
const PRECACHE_GROUPS = [
    { cacheName: CACHE_NAME, assets: CORE_ASSETS, required: true },
    { cacheName: DATA_CACHE_NAME, assets: DATA_ASSETS, required: false }
];

self.addEventListener("message", event => {
    if (event.data && event.data.type === "SKIP_WAITING") {
        self.skipWaiting();
    }
});

self.addEventListener("install", event => {
    event.waitUntil(precacheCoreAssets());
});

self.addEventListener("activate", event => {
    event.waitUntil(cleanupCaches());
});

self.addEventListener("fetch", event => {
    if (event.request.method !== "GET") return;

    const url = new URL(event.request.url);

    if (url.origin === self.location.origin && url.searchParams.has("update-check")) {
        event.respondWith(fetch(event.request));
        return;
    }

    if (isNavigationRequest(event.request) || isHtmlRequest(url)) {
        event.respondWith(networkFirst(event.request, CACHE_NAME));
        return;
    }

    if (isCatalogRequest(url)) {
        event.respondWith(networkFirstCatalog(event.request));
        return;
    }

    if (isNetworkFirstDataRequest(url)) {
        event.respondWith(networkFirst(event.request, DATA_CACHE_NAME));
        return;
    }

    if (isStaticAssetRequest(url, event.request)) {
        event.respondWith(staleWhileRevalidate(event.request, event));
    }
});

function sanitizeRoadbookId(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return /^[a-z0-9-]+$/.test(normalized) ? normalized : "";
}

async function precacheCoreAssets() {
    const results = await Promise.allSettled(
        PRECACHE_GROUPS.map(async ({ cacheName, assets }) => {
            const cache = await caches.open(cacheName);
            await cache.addAll(assets);
        })
    );

    let canActivateImmediately = true;
    results.forEach((result, index) => {
        if (result.status === "rejected") {
            console.warn("[SW] Préchargement partiel échoué :", PRECACHE_GROUPS[index].cacheName, result.reason);
            if (PRECACHE_GROUPS[index].required) {
                canActivateImmediately = false;
            }
        }
    });

    if (canActivateImmediately) {
        self.skipWaiting();
    }
}

async function cleanupCaches() {
    const keys = await caches.keys();
    await Promise.all(
        keys
            .filter(key =>
                LEGACY_CACHE_PATTERNS.some(pattern => pattern.test(key)) ||
                (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME && key !== DATA_CACHE_NAME && key !== CATALOG_CACHE_NAME)
            )
            .map(key => caches.delete(key))
    );
    await self.clients.claim();
}

function isNavigationRequest(request) {
    return request.mode === "navigate";
}

function isNetworkFirstDataRequest(url) {
    if (isGoogleSheetRequest(url)) return true;

    if (url.origin !== self.location.origin) return false;

    return (
        url.pathname.endsWith("/roadbook.json") ||
        url.pathname.endsWith(".json")
    );
}

function isCatalogRequest(url) {
    return (
        url.origin === self.location.origin &&
        url.pathname.endsWith("/roadbooks/catalog.json")
    );
}

function isHtmlRequest(url) {
    return url.origin === self.location.origin && (
        url.pathname === "/" ||
        url.pathname.endsWith("/index.html")
    );
}

function isGoogleSheetRequest(url) {
    return (
        url.hostname === "docs.google.com" &&
        url.pathname.includes("/spreadsheets/") &&
        url.searchParams.get("tqx") === "out:csv"
    );
}

function isStaticAssetRequest(url, request) {
    if (url.origin !== self.location.origin) return false;
    if (STATIC_DESTINATIONS.has(request.destination)) return true;
    return /\.(?:css|js|mjs|png|jpg|jpeg|webp|gif|svg|ico|woff2?)$/i.test(url.pathname);
}

function isCacheableResponse(response) {
    return Boolean(response) && (response.ok || response.type === "opaque");
}

async function networkFirst(request, cacheName) {
    const cache = await caches.open(cacheName);

    try {
        const response = await fetch(request);
        if (isCacheableResponse(response)) {
            await cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;

        if (request.mode === "navigate") {
            const fallback = await cache.match("index.html");
            if (fallback) return fallback;
        }

        throw error;
    }
}

async function staleWhileRevalidate(request, event) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    const networkPromise = fetch(request)
        .then(async response => {
            if (isCacheableResponse(response)) {
                await cache.put(request, response.clone());
            }
            return response;
        })
        .catch(error => {
            console.warn("[SW] Mise à jour en arrière-plan échouée :", request.url, error);
            return null;
        });

    event.waitUntil(networkPromise.then(() => undefined));

    if (cached) return cached;

    const response = await networkPromise;
    return response || Response.error();
}

async function networkFirstCatalog(request) {
    const cache = await caches.open(CATALOG_CACHE_NAME);
    try {
        const response = await fetch(request, { cache: "reload" });
        if (isCacheableResponse(response)) {
            await cache.put(CATALOG_CACHE_KEY, response.clone());
            await cache.put(
                CATALOG_METADATA_KEY,
                new Response(
                    JSON.stringify({ updatedAt: Date.now() }),
                    { headers: { "content-type": "application/json" } }
                )
            );
        }
        return response;
    } catch (error) {
        const [cachedResponse, metadataResponse] = await Promise.all([
            cache.match(CATALOG_CACHE_KEY),
            cache.match(CATALOG_METADATA_KEY)
        ]);
        const isFresh = await isCatalogFallbackFresh(metadataResponse);
        if (cachedResponse && isFresh) {
            return cachedResponse;
        }
        throw error;
    }
}

async function isCatalogFallbackFresh(metadataResponse) {
    if (!metadataResponse) return false;
    try {
        const metadata = await metadataResponse.json();
        const updatedAt = Number(metadata?.updatedAt);
        if (!Number.isFinite(updatedAt)) return false;
        return Date.now() - updatedAt <= CATALOG_STALE_TTL_MS;
    } catch {
        return false;
    }
}
