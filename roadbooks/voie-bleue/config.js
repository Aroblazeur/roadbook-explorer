"use strict";

(function registerTemplateRoadbookConfig(global) {
    global.ROADBOOK_CONFIGS = global.ROADBOOK_CONFIGS || {};

    global.ROADBOOK_CONFIGS["voie-bleue"] = Object.freeze({
        id: "voie-bleue",
        shortId: "voie-bleue",
        title: "Voie bleue",
        description: "Roadbook d'itinérance.",
        googleSheetId: "16OzEESCJaPNToT-Iy1QHf8JzNbgYtgWIJgG5f6C3iNg",
        sheets: Object.freeze({
            stages: Object.freeze({ name: "etapes principales" }),
            substeps: Object.freeze({ name: "Variante et option", gid: "" }),
            travelerNotes: Object.freeze({ name: "Notes voyageurs" }),
            addedAccommodation: Object.freeze({ name: "ajout hebergement" }),
            configuration: Object.freeze({ name: "Configuration" })
        }),
        enrichment: Object.freeze({
            accommodationPath: "roadbooks/voie-bleue/data/accommodation-enrichment.json",
            poiPath: "roadbooks/voie-bleue/data/poi-enrichment.json"
        }),
        fallbackJsonPaths: Object.freeze(["roadbooks/voie-bleue/roadbook.json"]),
        options: Object.freeze({})
    });
})(typeof window !== "undefined" ? window : globalThis);
