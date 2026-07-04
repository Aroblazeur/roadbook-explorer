# Roadbook Engine

Application web SPA/PWA réutilisable pour afficher plusieurs roadbooks de voyage à vélo.

La cible d'architecture est **JSON-first** : chaque voyage possède son dossier et son fichier canonique `roadbooks/<id>/roadbook.json`.

Pendant la transition, les Google Sheets existants restent la source de vérité fonctionnelle. Les fichiers JSON sont synchronisés depuis les Sheets afin de préparer la bascule progressive du Studio et du site public.

## Lancer le projet

Depuis la racine :

```bash
npx serve .
```

Ou avec n’importe quel serveur statique local. Ouvrir ensuite :

- `http://localhost:3000/` pour afficher la bibliothèque de roadbooks ;
- `http://localhost:3000/?roadbook=perinexus` pour charger explicitement Pirenexus ;
- `http://localhost:3000/?roadbook=perinexus&stage=3` pour ouvrir une étape précise ;
- `http://localhost:3000/?roadbook=perinexus&stage=3&substage=1` pour ouvrir une sous-étape.

## Ajouter un roadbook

Le plus simple est d'utiliser le script de scaffolding :

```bash
npm run create-roadbook -- --id=drava --title="Drava à vélo" --description="Roadbook d'itinérance." --sheet-id=ID_DU_GOOGLE_SHEET
```

Le script copie le template canonique `roadbooks/_template/`, puis personnalise `config.js` et `roadbook.json`.

Si vous devez le faire manuellement, copiez d'abord le template complet :

```text
cp -r roadbooks/_template roadbooks/<identifiant>
```

Puis adaptez au minimum `config.js`. Exemple :

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
            addedAccommodation: Object.freeze({ name: "ajout hebergement" }),
            configuration: Object.freeze({ name: "Configuration" })
        }),
        enrichment: Object.freeze({
            accommodationPath: "roadbooks/drava/data/accommodation-enrichment.json",
            poiPath: "roadbooks/drava/data/poi-enrichment.json"
        }),
        fallbackJsonPaths: Object.freeze(["roadbooks/drava/roadbook.json"]),
        options: Object.freeze({})
    });
})(typeof window !== "undefined" ? window : globalThis);
```

Le roadbook demandé est sélectionné avec `?roadbook=<identifiant>`. Sans paramètre, la bibliothèque générale des roadbooks est affichée.

Les contributions utilisateur passent par l’endpoint global Apps Script configuré dans `roadbook-config.js`. Il n’y a pas de Google Form à créer par roadbook.

## Synchroniser les Sheets vers les JSON

Pendant la transition, utilisez :

```bash
npm run sync:roadbooks
```

Cette commande lit les roadbooks listés dans `roadbooks/catalog.json`, importe leurs Google Sheets configurés, puis écrit :

```text
roadbooks/<id>/roadbook.json
```

Pour synchroniser un seul roadbook :

```bash
node scripts/sync-roadbook-json.js --roadbook=perinexus
```

Le contrat JSON officiel et le mapping Google Sheet → JSON sont documentés dans [`docs/JSON_CONTRACT.md`](docs/JSON_CONTRACT.md).

## Synchronisation moteur ↔ templates

`roadbooks/_template/` est la source canonique pour la structure attendue d'un roadbook.

À chaque évolution du modèle Google Sheet ou de l'architecture d'un roadbook, vérifier et mettre à jour ensemble :

- le moteur (`data-loader.js`) ;
- le template Google Sheet ;
- `roadbooks/_template/` ;
- `roadbooks/template/README.md` si une règle métier change ;
- le présent README si l'exemple minimal ou le flux de création évolue.

## Structure

```text
index.html
roadbook-config.js
data-loader.js
app.js
style.css
service-worker.js
roadbooks/
└── <id>/
    ├── config.js
    ├── roadbook.json
    ├── gpx/
    ├── photos/
    └── data/
        ├── accommodation-enrichment.json
        └── poi-enrichment.json
```

## Notes PWA

Le service worker conserve un seul moteur, mais sépare les caches par identifiant de roadbook afin d’éviter les mélanges de données entre voyages.
