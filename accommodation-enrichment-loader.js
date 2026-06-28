"use strict";

(function initializeAccommodationEnrichmentLoader(global) {
    const DEFAULT_PATH = "roadbooks/perinexus/data/accommodation-enrichment.json";

    async function loadAccommodationEnrichment({
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
            if (!data || !Array.isArray(data.items)) return new Map();

            return createEnrichmentIndex(data.items);
        } catch (error) {
            return new Map();
        } finally {
            clearTimeout(timeout);
        }
    }

    function createEnrichmentIndex(items) {
        const index = new Map();

        items.forEach(item => {
            if (!item || item.status !== "ok") return;
            const key = normalizeAccommodationUrl(item.url);
            if (!key) return;

            const previous = index.get(key) || { name: "", image: "" };
            index.set(key, {
                name: safeText(item.name) || previous.name,
                image: safeImageUrl(item.image) || previous.image
            });
        });

        return index;
    }

    function normalizeAccommodationUrl(value) {
        if (typeof value !== "string" || !value.trim()) return "";
        try {
            const url = new URL(value.trim());
            if (!["http:", "https:"].includes(url.protocol)) return "";

            url.hash = "";
            url.pathname = url.pathname.replace(/\/+$/g, "") || "/";

            const sortedParameters = [...url.searchParams.entries()]
                .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
                    leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
            url.search = "";
            sortedParameters.forEach(([key, parameterValue]) => url.searchParams.append(key, parameterValue));

            return url.href.replace(/\/$/, "");
        } catch (error) {
            return "";
        }
    }

    function safeImageUrl(value) {
        if (typeof value !== "string" || !value.trim()) return "";
        const candidate = value.trim();

        try {
            const absoluteUrl = new URL(candidate);
            return ["http:", "https:"].includes(absoluteUrl.protocol) ? absoluteUrl.href : "";
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

    function safeText(value) {
        return typeof value === "string" ? value.trim() : "";
    }

    const api = Object.freeze({
        createEnrichmentIndex,
        loadAccommodationEnrichment,
        normalizeAccommodationUrl,
        safeImageUrl
    });

    global.accommodationEnrichmentLoader = api;

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
})(typeof window !== "undefined" ? window : globalThis);
