# Roadbook Engine

Application web SPA/PWA réutilisable pour afficher plusieurs roadbooks de voyage à vélo à partir de Google Sheets.

Le moteur commun reste à la racine du projet. Chaque voyage possède uniquement sa configuration dans `roadbooks/<id>/config.js`.

## Lancer le projet

Depuis la racine :

```bash
npx serve .
```

Ou avec n’importe quel serveur statique local. Ouvrir ensuite :

- `http://localhost:3000/` pour le roadbook par défaut ;
- `http://localhost:3000/?roadbook=perinexus` pour charger explicitement Pirenexus ;
- `http://localhost:3000/?roadbook=perinexus&stage=3` pour ouvrir une étape précise ;
- `http://localhost:3000/?roadbook=perinexus&stage=3&substage=1` pour ouvrir une sous-étape.

## Ajouter un roadbook

Créer un dossier :

```text
roadbooks/<identifiant>/
└── config.js
```

Exemple minimal :

```js
"use strict";

(function registerRoadbookConfig(global) {
    global.ROADBOOK_CONFIGS = global.ROADBOOK_CONFIGS || {};

    global.ROADBOOK_CONFIGS.drava = Object.freeze({
        id: "drava",
        shortId: "drava",
        title: "Drava à vélo",
        googleSheetId: "ID_DU_GOOGLE_SHEET",
        sheets: Object.freeze({
            stages: Object.freeze({ name: "etapes principales" }),
            substeps: Object.freeze({ name: "Variante et option" }),
            travelerNotes: Object.freeze({ name: "Notes voyageurs" }),
            addedAccommodation: Object.freeze({ name: "ajout hebergement" })
        }),
        forms: Object.freeze({
            travelerNotes: Object.freeze({
                url: "https://docs.google.com/forms/...",
                stageField: "entry.xxxxx"
            }),
            addedAccommodation: Object.freeze({
                url: "https://docs.google.com/forms/...",
                stageField: "entry.yyyyy"
            })
        }),
        enrichment: Object.freeze({
            accommodationPath: "data/accommodation-enrichment.json",
            poiPath: "data/poi-enrichment.json"
        }),
        fallbackJsonPaths: Object.freeze(["roadbook.json"])
    });
})(typeof window !== "undefined" ? window : globalThis);
```

Le roadbook demandé est sélectionné avec `?roadbook=<identifiant>`. Sans paramètre, `perinexus` est utilisé par défaut.

## Structure

```text
index.html
roadbook-config.js
data-loader.js
app.js
style.css
service-worker.js
roadbooks/
└── perinexus/
    └── config.js
```

## Notes PWA

Le service worker conserve un seul moteur, mais sépare les caches par identifiant de roadbook afin d’éviter les mélanges de données entre voyages.
