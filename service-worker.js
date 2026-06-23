"use strict";

const CACHE_NAME = "perinexus-roadbook-computed-roadbook-totals-20260623";
const VERSION = "computed-roadbook-totals-20260623";

const CORE_ASSETS = [
    "./",
    "index.html",
    "style.css",
    `app.js?v=${VERSION}`,
    `data-loader.js?v=${VERSION}`,
    `map-viewer.js?v=${VERSION}`,
    `accommodation-enrichment-loader.js?v=${VERSION}`,
    `poi-enrichment-loader.js?v=${VERSION}`,
    `duration-estimator.js?v=${VERSION}`,
    "manifest.webmanifest",
    "icons/icon.svg",
    "data/accommodation-enrichment.json",
    "data/poi-enrichment.json"
];

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(CORE_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", event => {
    const url = new URL(event.request.url);

    // Ne pas interférer avec Google Sheets ou Mapy
    if (
        url.hostname === "google.com" ||
        url.hostname.endsWith(".google.com") ||
        url.hostname === "googleapis.com" ||
        url.hostname.endsWith(".googleapis.com") ||
        url.hostname === "mapy.com" ||
        url.hostname.endsWith(".mapy.com")
    ) {
        return;
    }

    // Cache-first pour les ressources locales
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                return fetch(event.request).then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    }
                    return response;
                }).catch(err => {
                    console.warn("[SW] Fetch échoué :", event.request.url, err);
                    return Response.error();
                });
            })
        );
    }
});
