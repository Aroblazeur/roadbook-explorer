# RoadBook Explorer

Application web SPA/PWA réutilisable pour créer, publier et consulter des roadbooks d’itinérance.

RoadBook Explorer n’est plus limité au vélo : il peut servir pour préparer et partager des itinéraires de **bikepacking**, de **randonnée avec bivouac**, de **trek**, de **road trip** ou tout autre voyage découpé en étapes. Le principe reste le même : une bibliothèque de roadbooks, une fiche par voyage, des étapes détaillées, des traces GPX, des hébergements, des points d’intérêt, des notes voyageurs et des contributions publiques.

La cible d'architecture est **JSON-first** : chaque voyage possède son dossier et son fichier canonique `roadbooks/<id>/roadbook.json`.

Pendant la transition, les Google Sheets existants restent la source de vérité fonctionnelle. Les fichiers JSON sont synchronisés depuis les Sheets afin de préparer la bascule progressive du Studio et du site public.

## Usages couverts

RoadBook Explorer peut documenter plusieurs types d’itinérances :

- **vélo / bikepacking** : étapes cyclables, variantes, traces GPX, campings, hébergements et points d’eau ;
- **randonnée / trek / bivouac** : étapes à pied, zones de bivouac, refuges, points d’eau, passages délicats et notes terrain ;
- **road trip** : journées de route, arrêts, hébergements, lieux à visiter et alternatives ;
- **voyages mixtes** : combinaisons vélo, marche, train, voiture ou bateau selon les étapes.

Le vocabulaire du projet conserve parfois des noms historiques liés au vélo, mais le moteur et le Studio doivent rester pensés comme un outil générique de roadbook d’aventure.

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

Exemples de titres possibles selon l’usage :

```bash
npm run create-roadbook -- --id=gr20-bivouac --title="GR20 en bivouac" --description="Roadbook randonnée et bivouac." --sheet-id=ID_DU_GOOGLE_SHEET
npm run create-roadbook -- --id=alpes-road-trip --title="Road trip dans les Alpes" --description="Roadbook de voyage en voiture." --sheet-id=ID_DU_GOOGLE_SHEET
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

## Publier depuis le Studio

Le Studio garde l'export manuel, mais peut aussi déclencher une publication automatisée via GitHub Actions.

Workflow :

1. ouvrir `studio.html` ;
2. créer ou modifier un roadbook ;
3. cliquer sur `Publier sur GitHub` ;
4. fournir un token GitHub personnel si la session n'en possède pas encore ;
5. le Studio appelle l'API GitHub `workflow_dispatch` pour lancer `.github/workflows/publish-roadbook.yml`.

Le workflow `.github/workflows/publish-roadbook.yml` décode le payload, écrit :

```text
roadbooks/<id>/roadbook.json
roadbooks/<id>/config.js
roadbooks/catalog.json
```

puis commit directement sur `main` avec `GITHUB_TOKEN`. Aucun token GitHub n'est stocké dans le JavaScript public du Studio ; le token personnel fourni par l'utilisateur reste uniquement dans la session du navigateur.

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
