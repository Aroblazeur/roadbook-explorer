"use strict";

(function registerTemplateRoadbookConfig(global) {
    global.ROADBOOK_CONFIGS = global.ROADBOOK_CONFIGS || {};

    global.ROADBOOK_CONFIGS["my-roadbook"] = Object.freeze({
        id: "my-roadbook",
        shortId: "my-roadbook",
        title: "Mon Roadbook",
        description: "Description de l'itinéraire.",
        googleSheetId: "",
        sheets: Object.freeze({
            stages: Object.freeze({ name: "etapes principales" }),
            substeps: Object.freeze({ name: "Variante et option", gid: "" }),
            travelerNotes: Object.freeze({ name: "Notes voyageurs" }),
            addedAccommodation: Object.freeze({ name: "ajout hebergement" }),
            configuration: Object.freeze({ name: "Configuration" })
        }),
        enrichment: Object.freeze({
            accommodationPath: "roadbooks/my-roadbook/data/accommodation-enrichment.json",
            poiPath: "roadbooks/my-roadbook/data/poi-enrichment.json"
        }),
        fallbackJsonPaths: Object.freeze(["roadbooks/my-roadbook/roadbook.json"]),
        options: Object.freeze({})
    });
})(typeof window !== "undefined" ? window : globalThis);
