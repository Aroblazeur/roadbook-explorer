"use strict";

(function registerVoieBleueRoadbookConfig(global) {
    global.ROADBOOK_CONFIGS = global.ROADBOOK_CONFIGS || {};

    global.ROADBOOK_CONFIGS["voie-bleue"] = Object.freeze({
        id: "voie-bleue",
        shortId: "voie-bleue",
        title: "Voie bleue",
        description: "Du luxemburg a lyon",
        jsonPath: "roadbooks/voie-bleue/roadbook.json",
        googleSheetId: "",
        sheets: Object.freeze({}),
        enrichment: Object.freeze({
            accommodationPath: "roadbooks/voie-bleue/data/accommodation-enrichment.json",
            poiPath: "roadbooks/voie-bleue/data/poi-enrichment.json"
        }),
        fallbackJsonPaths: Object.freeze(["roadbooks/voie-bleue/roadbook.json"]),
        options: Object.freeze({})
    });
})(typeof window !== "undefined" ? window : globalThis);
