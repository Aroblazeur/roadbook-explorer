"use strict";

(function initializeRoadbookConfig(global) {
    const DEFAULT_ROADBOOK_ID = "perinexus";
    const CONFIG_PATH_PREFIX = "roadbooks";
    const KNOWN_ROADBOOK_IDS = Object.freeze([DEFAULT_ROADBOOK_ID, "alsace-canal-marne-rhin"]);
    const CONTRIBUTION_ENDPOINT =
        "https://script.google.com/macros/s/AKfycbwZrE2tTFMd-rlj2gZ0V5rtHtwktL3aUvilVRahb0eMxBbCR5KLpWFRxpqU-IwIS7nslQ/exec";

    const requested = resolveRequestedRoadbook(global.location);
    const safeId = sanitizeRoadbookId(requested.id) || DEFAULT_ROADBOOK_ID;
    const catalogIds = resolveCatalogIds(global.ROADBOOK_CATALOG_IDS);
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

    function resolveCatalogIds(existingCatalog) {
        const source = Array.isArray(existingCatalog) && existingCatalog.length
            ? existingCatalog
            : KNOWN_ROADBOOK_IDS;
        const sanitized = source
            .map(item => sanitizeRoadbookId(item))
            .filter(Boolean);
        return sanitized.length ? [...new Set(sanitized)] : [DEFAULT_ROADBOOK_ID];
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
                    reject(new Error(`Configuration "${safeId}" introuvable.`));
                    return;
                }
                resolve(resolveConfig(safeId, config, { activate }));
            };
            script.onerror = () => reject(new Error(`Impossible de charger ${script.src}`));
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
            sheets: {},
            options: {},
            ...config
        };

        normalizedConfig.contributionEndpoint = CONTRIBUTION_ENDPOINT;

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
