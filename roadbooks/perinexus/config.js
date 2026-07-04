"use strict";

(function registerPerinexusRoadbookConfig(global) {
    global.ROADBOOK_CONFIGS = global.ROADBOOK_CONFIGS || {};

    global.ROADBOOK_CONFIGS.perinexus = Object.freeze({
        id: "perinexus",
        shortId: "perinexus",
        title: "RoadBook Explorer",
        description: "Roadbook d'itinérance à vélo.",
        googleSheetId: "1jhlhFPZF-oeAaiJ0pLKKagNMMa-SBxJ9HgnB4SMnyPU",
        sheets: Object.freeze({
            stages: Object.freeze({ name: "etapes principales" }),
            substeps: Object.freeze({ name: "Variante et option", gid: "15169789" }),
            travelerNotes: Object.freeze({ name: "Notes voyageurs" }),
            addedAccommodation: Object.freeze({ name: "Ajout hebergement" }),
            configuration: Object.freeze({ name: "Configuration" })
        }),
        enrichment: Object.freeze({
            accommodationPath: "roadbooks/perinexus/data/accommodation-enrichment.json",
            poiPath: "roadbooks/perinexus/data/poi-enrichment.json"
        }),
        fallbackJsonPaths: Object.freeze(["roadbooks/perinexus/roadbook.json"]),
        options: Object.freeze({})
    });
})(typeof window !== "undefined" ? window : globalThis);
