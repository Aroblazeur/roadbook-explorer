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
            addedAccommodation: Object.freeze({ name: "ajout hebergement" })
        }),
        forms: Object.freeze({
            travelerNotes: Object.freeze({
                url: "https://docs.google.com/forms/d/e/1FAIpQLSd_m6lL7ctB7sxz8VOx2Bm7fzNYBUCmXjAZ30YUkV1EK2pmbA/viewform",
                stageField: "entry.521193530"
            }),
            addedAccommodation: Object.freeze({
                url: "https://docs.google.com/forms/d/e/1FAIpQLSccYxccGvTR1Ih3PBdWDO2Z1kI_qrlM2VnDCmkUYDDpQLormA/viewform",
                stageField: "entry.819202802"
            })
        }),
        enrichment: Object.freeze({
            accommodationPath: "data/accommodation-enrichment.json",
            poiPath: "data/poi-enrichment.json"
        }),
        fallbackJsonPaths: Object.freeze(["roadbook.json"]),
        options: Object.freeze({})
    });
})(typeof window !== "undefined" ? window : globalThis);
