"use strict";

(function registerAlsaceCanalMarneRhinRoadbookConfig(global) {
    global.ROADBOOK_CONFIGS = global.ROADBOOK_CONFIGS || {};

    global.ROADBOOK_CONFIGS["alsace-canal-marne-rhin"] = Object.freeze({
        id: "alsace-canal-marne-rhin",
        shortId: "alsace-canal-marne-rhin",
        title: "Alsace - Canal de la Marne au Rhin",
        description: "Roadbook d'itinérance à vélo le long du canal de la Marne au Rhin en Alsace.",
        googleSheetId: "1uAD98fd3HjDHBGxquWZybm7YXdA9wOFad0eiygy4qrA",
        sheets: Object.freeze({
            stages: Object.freeze({ name: "etapes principales" }),
            substeps: Object.freeze({ name: "Variante et option", gid: "15169789" }),
            travelerNotes: Object.freeze({ name: "Notes voyageurs" }),
            addedAccommodation: Object.freeze({ name: "ajout hebergement" }),
            configuration: Object.freeze({ name: "Configuration" })
        }),
        forms: Object.freeze({
            travelerNotes: Object.freeze({
                url: "",
                stageField: ""
            }),
            addedAccommodation: Object.freeze({
                url: "",
                stageField: ""
            })
        }),
        enrichment: Object.freeze({
            accommodationPath: "roadbooks/alsace-canal-marne-rhin/data/accommodation-enrichment.json",
            poiPath: "roadbooks/alsace-canal-marne-rhin/data/poi-enrichment.json"
        }),
        fallbackJsonPaths: Object.freeze(["roadbooks/alsace-canal-marne-rhin/roadbook.json"]),
        options: Object.freeze({})
    });
})(typeof window !== "undefined" ? window : globalThis);
