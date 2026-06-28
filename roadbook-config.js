"use strict";

(function initializeRoadbookConfig(global) {
    const DEFAULT_ROADBOOK_ID = "perinexus";
    const CONFIG_PATH_PREFIX = "roadbooks";

    const requestedId = resolveRequestedRoadbookId(global.location);
    const safeId = sanitizeRoadbookId(requestedId) || DEFAULT_ROADBOOK_ID;
    const context = {
        defaultId: DEFAULT_ROADBOOK_ID,
        requestedId: safeId,
        id: safeId,
        config: null
    };

    global.ROADBOOK_CONFIGS = global.ROADBOOK_CONFIGS || {};
    global.roadbookContext = context;
    global.roadbookConfigReady = loadRoadbookConfig(safeId)
        .catch(error => {
            if (safeId === DEFAULT_ROADBOOK_ID) throw error;
            console.warn(`[Roadbook] Configuration "${safeId}" indisponible, retour à "${DEFAULT_ROADBOOK_ID}".`, error);
            context.id = DEFAULT_ROADBOOK_ID;
            return loadRoadbookConfig(DEFAULT_ROADBOOK_ID);
        });

    function resolveRequestedRoadbookId(location) {
        if (!location) return DEFAULT_ROADBOOK_ID;

        const params = new URLSearchParams(location.search || "");
        const queryValue = params.get("roadbook");
        if (queryValue) return queryValue;

        const hash = String(location.hash || "").replace(/^#/, "").trim();
        if (!hash) return DEFAULT_ROADBOOK_ID;

        const hashParams = new URLSearchParams(hash.includes("=") ? hash : `roadbook=${hash}`);
        return hashParams.get("roadbook") || DEFAULT_ROADBOOK_ID;
    }

    function sanitizeRoadbookId(value) {
        const normalized = String(value || "").trim().toLowerCase();
        return /^[a-z0-9-]+$/.test(normalized) ? normalized : "";
    }

    function loadRoadbookConfig(id) {
        const existing = global.ROADBOOK_CONFIGS?.[id];
        if (existing) return Promise.resolve(setCurrentConfig(id, existing));

        return new Promise((resolve, reject) => {
            const script = document.createElement("script");
            script.src = `${CONFIG_PATH_PREFIX}/${encodeURIComponent(id)}/config.js`;
            script.async = true;
            script.onload = () => {
                const config = global.ROADBOOK_CONFIGS?.[id];
                if (!config) {
                    reject(new Error(`Configuration "${id}" introuvable.`));
                    return;
                }
                resolve(setCurrentConfig(id, config));
            };
            script.onerror = () => reject(new Error(`Impossible de charger ${script.src}`));
            document.head.appendChild(script);
        });
    }

    function setCurrentConfig(id, config) {
        const normalizedConfig = {
            id,
            shortId: id,
            title: "Roadbook vélo",
            sheets: {},
            forms: {},
            options: {},
            ...config
        };

        normalizedConfig.id = sanitizeRoadbookId(normalizedConfig.id || id) || id;
        normalizedConfig.shortId = sanitizeRoadbookId(normalizedConfig.shortId || normalizedConfig.id) || normalizedConfig.id;

        context.id = normalizedConfig.id;
        context.config = normalizedConfig;
        global.currentRoadbookConfig = normalizedConfig;
        return normalizedConfig;
    }
})(typeof window !== "undefined" ? window : globalThis);
