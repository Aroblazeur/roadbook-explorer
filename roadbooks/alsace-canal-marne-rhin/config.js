"use strict";

(function registerAlsaceCanalMarneRhinRoadbookConfig(global) {
    global.ROADBOOK_CONFIGS = global.ROADBOOK_CONFIGS || {};

    global.ROADBOOK_CONFIGS["alsace-canal-marne-rhin"] = Object.freeze({
        id: "alsace-canal-marne-rhin",
        shortId: "alsace-canal-marne-rhin",
        title: "Alsace via canal de la marne au rhin",
        description: "itinerance personalisé en 12 jours",
        jsonPath: "roadbooks/alsace-canal-marne-rhin/roadbook.json",
        googleSheetId: "",
        sheets: Object.freeze({}),
        enrichment: Object.freeze({
            poiPath: "roadbooks/alsace-canal-marne-rhin/data/poi-enrichment.json"
        }),
        fallbackJsonPaths: Object.freeze(["roadbooks/alsace-canal-marne-rhin/roadbook.json"]),
        options: Object.freeze({})
    });
})(typeof window !== "undefined" ? window : globalThis);
