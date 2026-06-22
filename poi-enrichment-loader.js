"use strict";

(function initializePoiEnrichmentLoader(global) {
    const DEFAULT_PATH = "data/poi-enrichment.json";

    async function loadPoiEnrichment({
        path = DEFAULT_PATH,
        fetchImpl = global.fetch,
        timeoutMs = 3_000
    } = {}) {
        if (typeof fetchImpl !== "function") return new Map();

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetchImpl(path, {
                headers: { Accept: "application/json" },
                signal: controller.signal
            });
            if (!response.ok) return new Map();

            const data = JSON.parse(await response.text());
            return Array.isArray(data?.items) ? createPoiEnrichmentIndex(data.items) : new Map();
        } catch (error) {
            return new Map();
        } finally {
            clearTimeout(timeout);
        }
    }

    function createPoiEnrichmentIndex(items) {
        const index = new Map();
        items.forEach(item => {
            if (!item || item.status !== "ok") return;
            const key = normalizePoiName(item.name);
            if (!key) return;

            index.set(key, {
                name: safeText(item.name),
                image: safeImageUrl(item.image),
                description: safeDescription(item.description),
                coordinates: safeCoordinates(item.coordinates)
            });
        });
        return index;
    }

    function normalizePoiName(value) {
        return safeText(value)
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[’']/g, " ")
            .replace(/[^\p{L}\p{N}]+/gu, " ")
            .trim()
            .toLowerCase();
    }

    function safeImageUrl(value) {
        if (typeof value !== "string" || !value.trim() || /wikipedia/i.test(value)) return "";
        const candidate = value.trim();
        try {
            const url = new URL(candidate);
            return ["http:", "https:"].includes(url.protocol) ? url.href : "";
        } catch (error) {
            const localPath = candidate.split(/[?#]/)[0];
            const unsafePath =
                !localPath ||
                candidate.startsWith("//") ||
                candidate.includes("\\") ||
                /^[a-z][a-z0-9+.-]*:/i.test(candidate) ||
                localPath.split("/").includes("..");
            return unsafePath ? "" : candidate;
        }
    }

    function safeDescription(value) {
        const description = safeText(value);
        return /https?:\/\//i.test(description) || /wikipedia/i.test(description) ? "" : description;
    }

    function safeCoordinates(value) {
        if (!value || typeof value !== "object") return null;
        const lat = Number(value.lat);
        const lng = Number(value.lng);
        return Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
               Number.isFinite(lng) && lng >= -180 && lng <= 180
            ? { lat, lng }
            : null;
    }

    function safeText(value) {
        return typeof value === "string" ? value.trim() : "";
    }

    const api = Object.freeze({
        createPoiEnrichmentIndex,
        loadPoiEnrichment,
        normalizePoiName,
        safeImageUrl
    });

    global.poiEnrichmentLoader = api;

    if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
