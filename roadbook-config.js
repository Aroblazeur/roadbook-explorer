"use strict";

(function initializeRoadbookConfig(global) {
    const DEFAULT_ROADBOOK_ID = "perinexus";
    const CONFIG_PATH_PREFIX = "roadbooks";
    const CATALOG_PATH = `${CONFIG_PATH_PREFIX}/catalog.json`;
    const CATALOG_CACHE_BUSTER = resolveCatalogCacheBuster(global);
    const EXCLUDED_CATALOG_IDS = new Set(["template"]);
    const KNOWN_ROADBOOK_IDS = Object.freeze([DEFAULT_ROADBOOK_ID]);
    const CONTRIBUTION_ENDPOINT =
        "https://script.google.com/macros/s/AKfycby9vh9snguG8M8khWWkqi2e4mrsmKsKKVNkMrIogb7BanHnoYN9v7DoP-Z08Yh7EPHK_A/exec";
    const CONTRIBUTION_FEED = Object.freeze({
        endpoint: CONTRIBUTION_ENDPOINT
    });

    const requested = resolveRequestedRoadbook(global.location);
    const safeId = sanitizeRoadbookId(requested.id) || DEFAULT_ROADBOOK_ID;
    let catalogIds = resolveCatalogIds(global.ROADBOOK_CATALOG_IDS);
    let catalogLoadPromise = null;
    const context = {
        defaultId: DEFAULT_ROADBOOK_ID,
        requestedId: safeId,
        hasExplicitRoadbook: requested.explicit,
        id: safeId,
        config: null
    };

    global.ROADBOOK_CONFIGS = global.ROADBOOK_CONFIGS || {};
    global.ROADBOOK_CATALOG_IDS = [...catalogIds];
    global.listRoadbookIds = () => [...catalogIds];
    global.loadRoadbookCatalogIds = (options = {}) => loadCatalogIds(options);
    global.loadRoadbookConfigById = (id, options = {}) => loadRoadbookConfig(id, options);
    global.roadbookContext = context;
    global.roadbookConfigReady = requested.explicit
        ? loadRoadbookConfig(safeId, { activate: true }).catch(error => {
            if (safeId === DEFAULT_ROADBOOK_ID) throw error;
            console.warn(`[Roadbook] Configuration "${safeId}" indisponible, retour à "${DEFAULT_ROADBOOK_ID}".`, error);
            context.id = DEFAULT_ROADBOOK_ID;
            return loadRoadbookConfig(DEFAULT_ROADBOOK_ID, { activate: true });
        })
        : Promise.resolve(null);

    function loadCatalogIds(options = {}) {
        const { forceReload = false } = options;
        if (catalogLoadPromise && !forceReload) return catalogLoadPromise;

        const fetchOptions = { cache: forceReload ? "reload" : "no-store" };
        const catalogRequestUrl = buildCatalogRequestUrl({ forceReload });
        catalogLoadPromise = fetch(catalogRequestUrl, fetchOptions)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.json();
            })
            .then(payload => {
                const ids = resolveCatalogIds(payload?.roadbooks);
                catalogIds = ids.length ? ids : [DEFAULT_ROADBOOK_ID];
                global.ROADBOOK_CATALOG_IDS = [...catalogIds];
                return [...catalogIds];
            })
            .catch(error => {
                const reason = error?.message || "erreur inconnue";
                console.warn(`[Roadbook] Catalogue indisponible (${CATALOG_PATH}) : ${reason}. Fallback sur "${DEFAULT_ROADBOOK_ID}".`);
                catalogIds = [DEFAULT_ROADBOOK_ID];
                global.ROADBOOK_CATALOG_IDS = [...catalogIds];
                return [...catalogIds];
            });

        return catalogLoadPromise;
    }

    function resolveCatalogIds(existingCatalog) {
        const source = Array.isArray(existingCatalog) && existingCatalog.length
            ? existingCatalog
            : KNOWN_ROADBOOK_IDS;
        const sanitized = source
            .map(item => sanitizeRoadbookId(item))
            .filter(isCatalogIdVisible);
        const deduplicated = [...new Set(sanitized)];
        if (!deduplicated.includes(DEFAULT_ROADBOOK_ID)) {
            deduplicated.unshift(DEFAULT_ROADBOOK_ID);
        }
        return deduplicated.length ? deduplicated : [DEFAULT_ROADBOOK_ID];
    }

    function resolveCatalogCacheBuster(scope) {
        const token = String(scope?.__ROADBOOK_APP_VERSION__ || "").trim();
        return token || "";
    }

    function buildCatalogRequestUrl(options = {}) {
        const { forceReload = false } = options;
        const params = new URLSearchParams();
        if (CATALOG_CACHE_BUSTER) params.set("v", CATALOG_CACHE_BUSTER);
        if (forceReload) {
            params.set("update-check", "1");
            params.set("t", String(Date.now()));
        }
        const url = new URL(CATALOG_PATH, global.location.href);
        params.forEach((value, key) => url.searchParams.set(key, value));
        return url.toString();
    }

    function isCatalogIdVisible(id) {
        if (!id) return false;
        if (id === DEFAULT_ROADBOOK_ID) return true;
        return !EXCLUDED_CATALOG_IDS.has(id);
    }

    function resolveRequestedRoadbook(location) {
        if (!location) {
            return {
                id: DEFAULT_ROADBOOK_ID,
                explicit: false
            };
        }

        const params = new URLSearchParams(location.search || "");
        const queryValue = params.get("roadbook");
        if (queryValue) {
            return {
                id: queryValue,
                explicit: true
            };
        }

        const hash = String(location.hash || "").replace(/^#/, "").trim();
        if (!hash) {
            return {
                id: DEFAULT_ROADBOOK_ID,
                explicit: false
            };
        }

        const hashParams = new URLSearchParams(hash.includes("=") ? hash : `roadbook=${hash}`);
        const hashValue = hashParams.get("roadbook");
        return {
            id: hashValue || DEFAULT_ROADBOOK_ID,
            explicit: Boolean(hashValue)
        };
    }

    function sanitizeRoadbookId(value) {
        const normalized = String(value || "").trim().toLowerCase();
        return /^[a-z0-9-]+$/.test(normalized) ? normalized : "";
    }

    function loadRoadbookConfig(id, options = {}) {
        const { activate = true } = options;
        const safeId = sanitizeRoadbookId(id);
        if (!safeId) return Promise.reject(new Error(`Identifiant roadbook invalide : "${id}".`));

        const existing = global.ROADBOOK_CONFIGS?.[safeId];
        if (existing) return Promise.resolve(resolveConfig(safeId, existing, { activate }));

        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = `${CONFIG_PATH_PREFIX}/${encodeURIComponent(safeId)}/config.js`;
            script.async = true;
            script.onload = () => {
                const config = global.ROADBOOK_CONFIGS?.[safeId];
                if (!config) {
                    const error = new Error(`Configuration "${safeId}" introuvable après le chargement de ${script.src}.`);
                    console.warn(`[Roadbook] ${error.message}`);
                    reject(error);
                    return;
                }
                resolve(resolveConfig(safeId, config, { activate }));
            };
            script.onerror = () => {
                const error = new Error(`Impossible de charger ${script.src}`);
                console.warn(`[Roadbook] ${error.message}`);
                reject(error);
            };
            document.head.appendChild(script);
        });
    }

    function resolveConfig(id, config, options = {}) {
        const { activate = true } = options;
        const normalizedConfig = {
            id,
            shortId: id,
            title: "RoadBook Explorer",
            contributionEndpoint: CONTRIBUTION_ENDPOINT,
            contributionFeed: CONTRIBUTION_FEED,
            sheets: {},
            options: {},
            ...config
        };

        normalizedConfig.contributionEndpoint = CONTRIBUTION_ENDPOINT;
        normalizedConfig.contributionFeed = CONTRIBUTION_FEED;

        normalizedConfig.id = sanitizeRoadbookId(normalizedConfig.id || id) || id;
        normalizedConfig.shortId = sanitizeRoadbookId(normalizedConfig.shortId || normalizedConfig.id) || normalizedConfig.id;

        if (activate) {
            context.id = normalizedConfig.id;
            context.config = normalizedConfig;
            global.currentRoadbookConfig = normalizedConfig;
        }
        return normalizedConfig;
    }
})(typeof window !== "undefined" ? window : globalThis);
