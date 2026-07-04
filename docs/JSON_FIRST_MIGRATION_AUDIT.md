# Audit de migration JSON-first — RoadBook Explorer

Date d'audit : 2026-07-04

## Objectif

Préparer la migration générale de RoadBook Explorer vers le modèle cible :

```text
un roadbook = un dossier GitHub + un fichier roadbooks/<id>/roadbook.json canonique
```

Ce document ne demande pas encore la suppression des Google Sheets. À court terme, les Google Sheets existants restent la source de vérité fonctionnelle. Le JSON canonique doit d'abord devenir assez complet pour contenir fidèlement les données métier actuelles.

## État actuel du catalogue

`roadbooks/catalog.json` liste actuellement :

| Roadbook | Dossier | JSON canonique présent | Google Sheet configuré |
| --- | --- | --- | --- |
| `perinexus` | `roadbooks/perinexus/` | oui | oui |
| `alsace-canal-marne-rhin` | `roadbooks/alsace-canal-marne-rhin/` | oui | oui |
| `voie-bleue` | `roadbooks/voie-bleue/` | oui | oui |

Le moteur commun reste à la racine. Le Studio lit déjà `roadbooks/catalog.json` puis `roadbooks/<id>/roadbook.json`.

## Sources Google Sheet configurées

### `perinexus`

Google Sheet ID : `1jhlhFPZF-oeAaiJ0pLKKagNMMa-SBxJ9HgnB4SMnyPU`

| Clé config | Feuille | Rôle |
| --- | --- | --- |
| `stages` | `etapes principales` | étapes principales + lignes de total |
| `substeps` | `Variante et option` | variantes/options rattachées aux étapes |
| `travelerNotes` | `Notes voyageurs` | contributions notes voyageurs |
| `addedAccommodation` | `Ajout hebergement` | contributions hébergements alternatifs |
| `configuration` | `Configuration` | métadonnées de bibliothèque |

### `alsace-canal-marne-rhin`

Google Sheet ID : `1uAD98fd3HjDHBGxquWZybm7YXdA9wOFad0eiygy4qrA`

| Clé config | Feuille | Rôle |
| --- | --- | --- |
| `stages` | `etapes principales` | étapes principales + lignes de total éventuelles |
| `substeps` | `Variante et option` | variantes/options, actuellement vide |
| `travelerNotes` | `Notes voyageurs` | contributions notes voyageurs, actuellement vide |
| `addedAccommodation` | `ajout hebergement` | contributions hébergements alternatifs, actuellement vide |
| `configuration` | `Configuration` | métadonnées de bibliothèque |

### `voie-bleue`

Google Sheet ID : `16OzEESCJaPNToT-Iy1QHf8JzNbgYtgWIJgG5f6C3iNg`

| Clé config | Feuille | Rôle |
| --- | --- | --- |
| `stages` | `etapes principales` | étapes principales + lignes de total éventuelles |
| `substeps` | `Variante et option` | variantes/options, actuellement vide |
| `travelerNotes` | `Notes voyageurs` | contributions notes voyageurs, actuellement vide |
| `addedAccommodation` | `ajout hebergement` | contributions hébergements alternatifs, actuellement vide |
| `configuration` | `Configuration` | métadonnées de bibliothèque |

## Feuilles et colonnes réellement observées

Les trois roadbooks ont aujourd'hui une structure très proche.

### Feuille `Configuration`

Colonnes observées :

- `titre`
- `Activité`
- `Destination`
- `Description`
- `image de couverture`
- `Projet`

Colonnes consommées par le code :

| Colonne | Statut | Usage actuel | JSON cible |
| --- | --- | --- | --- |
| `titre` / `title` / `nom` | indispensable pour bibliothèque lisible | titre visible | `title` |
| `Activité` | utile optionnelle | carte bibliothèque | `metadata.activity` |
| `Destination` | utile optionnelle | carte bibliothèque | `metadata.destination` |
| `Description` | utile optionnelle | carte bibliothèque | `description` |
| `image de couverture` | utile optionnelle | image de bibliothèque | `metadata.coverImage` |
| `Projet` | utile optionnelle | classement À faire / Déjà faits | `metadata.project`, `metadata.projectStatus` |

### Feuille `etapes principales`

Colonnes observées :

- `Numero etape`
- `Nom etapes`
- `Jour`
- `Depart`
- `Arrivee`
- `Distance (km)`
- `D+ (m)`
- `D− (m)`
- `Photo etape`
- `Hebergement`
- `type hebergement`
- `site web de l'hebergement`
- `photo hébergement principal`
- `Hebergement altenatif`
- `photo hébergement  alternatif`
- `Nom hébergement alternatif`
- `Notes`
- `lien d'integration de map`
- `GPX`
- `Point d'intérêt`
- `Images POI`
- `lien POI`
- plusieurs colonnes vides finales

Mapping actuel :

| Colonne | Statut | Usage actuel | JSON cible |
| --- | --- | --- | --- |
| `Numero etape` | indispensable | identifiant, ordre, navigation | `stages[].stage` |
| `Nom etapes` | utile optionnelle | libellé d'étape | `stages[].stageLabel` |
| `Jour` | utile optionnelle | libellé navigation | `stages[].day` |
| `Depart` | indispensable | titre, détail, liste | `stages[].departure` |
| `Arrivee` | indispensable | titre, détail, liste | `stages[].arrival` |
| `Distance (km)` | utile optionnelle | statistique, total ; fallback GPX possible | `stages[].distance` |
| `D+ (m)` | utile optionnelle | statistique, durée ; fallback GPX possible | `stages[].elevationGain` |
| `D− (m)` | utile optionnelle | statistique ; fallback GPX possible | `stages[].elevationLoss` |
| `Photo etape` | utile optionnelle | illustration détail étape | `stages[].stagePhoto` |
| `Hebergement` | utile optionnelle mais métier forte | hébergement principal | `stages[].accommodation.name` |
| `type hebergement` | utile optionnelle | icône hébergement | `stages[].accommodationType` |
| `site web de l'hebergement` | utile optionnelle | lien hébergement, enrichissement | `stages[].accommodation.website` |
| `photo hébergement principal` | utile optionnelle | photo prioritaire hébergement | `stages[].accommodation.photo` |
| `Hebergement altenatif` | utile optionnelle | alternatives | `stages[].accommodation.alternatives[].url` |
| `Nom hébergement alternatif` | utile optionnelle | libellés alternatives | `stages[].accommodation.alternatives[].name` |
| `photo hébergement alternatif` | utile optionnelle | photos alternatives | `stages[].accommodation.alternatives[].photo` |
| `Notes` | utile optionnelle | notes internes étape | `stages[].noteItems[]`, `stages[].notes` |
| `lien d'integration de map` | utile optionnelle | iframe carte externe | `stages[].mapEmbedUrl` |
| `GPX` | utile optionnelle, métier forte | téléchargement, métriques, fallback carte | `stages[].gpx` |
| `Point d'intérêt` | utile optionnelle | POI | `stages[].pois[]` |
| `Images POI` | utile optionnelle | images POI | `stages[].pois[].image` |
| `lien POI` | actuellement sous-utilisée | lien source POI | à préserver dans `stages[].pois[].url` |
| colonnes vides finales | purement techniques / obsolètes | aucune | à ignorer |

Lignes spéciales :

- `Numero etape = total` → `summary.official`
- `Numero etape = total des étapes` → repère historique, ne doit pas devenir une étape

### Feuille `Variante et option`

Colonnes observées :

- `Etape principale associé`
- `Jour`
- `Nom variante`
- `Type`
- `Départ`
- `Arrivée`
- `Distance (km)`
- `D+ (m)`
- `D− (m)`
- `Point d'intérêt`
- `image poi`
- `Lien POI`
- `Hebergement`
- `type hébergement`
- `site web de l'hebergement`
- `photo hébergement principal`
- `Hebergement altenatif`
- `photo hébergement  alternatif`
- `Nom hébergement alternatif`
- `Notes`
- `lien d'integration de map`
- `GPX`
- plusieurs colonnes vides finales

Mapping actuel :

| Colonne | Statut | Usage actuel | JSON cible |
| --- | --- | --- | --- |
| `Etape principale associé` | indispensable pour sous-étape | rattachement parent | `substeps[].parentStage`, `variants[].parentStage` |
| `Jour` | utile optionnelle | navigation | `substeps[].day` |
| `Nom variante` | indispensable ou fortement recommandée | nom sous-étape | `substeps[].name` |
| `Type` | indispensable pour lisibilité | Variante, Option, Raccourci... | `substeps[].type` |
| `Départ` | utile optionnelle | titre/détail sous-étape | `substeps[].departure` |
| `Arrivée` | utile optionnelle | titre/détail sous-étape | `substeps[].arrival` |
| `Distance (km)` | utile optionnelle | stats sous-étape | `substeps[].distance` |
| `D+ (m)` | utile optionnelle | stats/durée | `substeps[].elevationGain` |
| `D− (m)` | utile optionnelle | stats | `substeps[].elevationLoss` |
| `Point d'intérêt` | utile optionnelle | POI de sous-étape | `substeps[].pois[]` |
| `image poi` | utile optionnelle | image POI | `substeps[].pois[].image` |
| `Lien POI` | actuellement sous-utilisée | lien source POI | à préserver dans `substeps[].pois[].url` |
| colonnes hébergement | utiles optionnelles | mêmes composants que étape | `substeps[].accommodation.*` |
| `Notes` | utile optionnelle | notes internes | `substeps[].noteItems[]` |
| `lien d'integration de map` | utile optionnelle | iframe carte externe | `substeps[].mapEmbedUrl` |
| `GPX` | utile optionnelle | GPX sous-étape | `substeps[].gpx` |
| colonnes vides finales | purement techniques / obsolètes | aucune | à ignorer |

### Feuille `Notes voyageurs`

Colonnes observées :

- `Horodateur`
- `étape`
- `Note`
- `Photo`

Mapping actuel :

| Colonne | Statut | Usage actuel | JSON cible |
| --- | --- | --- | --- |
| `Horodateur` | technique utile | date de contribution, non affichée actuellement | `contributions[].createdAt` ou `notes[].createdAt` |
| `étape` | indispensable | rattachement | `notes[].stage` |
| `Note` | indispensable | texte affiché | `notes[].text` |
| `Photo` | utile optionnelle | photo sous la note | `notes[].photo` |

### Feuille `ajout hebergement` / `Ajout hebergement`

Colonnes observées :

- `Horodateur`
- `étape`
- `URL`
- `Nom`
- `photo`

Mapping actuel :

| Colonne | Statut | Usage actuel | JSON cible |
| --- | --- | --- | --- |
| `Horodateur` | technique utile | date de contribution | `contributions[].createdAt` |
| `étape` | indispensable | rattachement | `contributions[].stage` |
| `URL` | indispensable pour ajout | hébergement alternatif | `contributions[].payload.url` puis `accommodation.alternatives[].url` |
| `Nom` | utile optionnelle | nom enrichi / manuel | `contributions[].payload.name` |
| `photo` | utile optionnelle | photo hébergement | `contributions[].payload.photo` |

## Colonnes par catégorie

### Indispensables

- `Numero etape`
- `Depart`
- `Arrivee`
- `Etape principale associé` pour les sous-étapes
- `Nom variante` ou à défaut un libellé générable
- `Type` pour les sous-étapes
- `étape` + `Note` dans `Notes voyageurs`
- `étape` + `URL` dans `ajout hebergement`

### Utiles mais optionnelles

- `Nom etapes`
- `Jour`
- `Distance (km)`
- `D+ (m)`
- `D− (m)`
- `Photo etape`
- `Hebergement`
- `type hebergement`
- `site web de l'hebergement`
- `photo hébergement principal`
- `Hebergement altenatif`
- `Nom hébergement alternatif`
- `photo hébergement alternatif`
- `Notes`
- `lien d'integration de map`
- `GPX`
- `Point d'intérêt`
- `Images POI`
- `Lien POI`
- `image de couverture`
- `Projet`

### Redondantes

- `Hebergement altenatif` + `Nom hébergement alternatif` + `photo hébergement alternatif` : ce trio doit devenir une liste structurée `accommodation.alternatives[]`.
- `pois`, `pointsOfInterest`, `interest` dans le JSON actuel : trois alias pour le même contenu. À long terme, choisir `pois`.
- `days` dans le JSON actuel : collection navigable dérivée de `stages + substeps`, utile temporairement pour compatibilité mais redondante à terme.
- `alternativeAccommodation` et `legacyAccommodation` : champs de compatibilité avec l'ancien rendu, dérivables depuis `accommodation`.
- `elevation` : ancien alias de `elevationGain`.

### Obsolètes ou à corriger

- Colonnes vides finales dans les feuilles `etapes principales` et `Variante et option`.
- Orthographe `Hebergement altenatif` : garder la compatibilité, mais normaliser vers `Hébergement alternatif` dans un futur modèle Sheet ou vers `accommodation.alternatives[]` en JSON.
- `Nom etapes` devrait devenir `Nom étape` si les Sheets restent utilisés.

### Purement techniques

- `Horodateur`
- `projectStatus`
- `generatedAt`
- `source`
- `googleSheetId`
- `id`, `itemType`, `isSubstep`, `hierarchyLevel`, `parentStageReference`
- `days`, tant que le moteur public en dépend

## Mapping générique Sheet → JSON canonique

### Niveau roadbook

```json
{
  "id": "voie-bleue",
  "title": "Voie bleue",
  "description": "Roadbook d'itinérance.",
  "metadata": {
    "activity": "Velo",
    "destination": "Moselle Saone",
    "project": "A faire",
    "projectStatus": "todo",
    "coverImage": "roadbooks/voie-bleue/data/Couverture.jpg",
    "source": "google-sheets",
    "googleSheetId": "..."
  }
}
```

### Résumé

```json
{
  "summary": {
    "official": {
      "distance": 340,
      "elevationGain": 3362,
      "elevationLoss": 1180,
      "mapEmbedUrl": "https://...",
      "gpx": "trace-complete.gpx",
      "link": "https://..."
    },
    "stagesTotal": {
      "distance": 360.6,
      "elevationGain": 6100,
      "elevationLoss": 6052
    },
    "stagesTotalMarker": null
  }
}
```

`summary.stagesTotal` doit pouvoir être recalculé depuis les étapes si la ligne Sheet est vide.

### Étape principale

```json
{
  "id": "stage-1",
  "type": "principale",
  "stage": 1,
  "day": "Jour 1",
  "stageLabel": "Nom de l'étape",
  "departure": "Départ",
  "arrival": "Arrivée",
  "distance": 42.5,
  "elevationGain": 620,
  "elevationLoss": 540,
  "duration": "",
  "gpx": "etape1.gpx",
  "mapEmbedUrl": "https://...",
  "stagePhoto": "roadbooks/<id>/data/etape1.jpg",
  "accommodationType": "camping",
  "accommodation": {
    "name": "Camping exemple",
    "website": "https://...",
    "photo": "https://...",
    "alternatives": [
      {
        "name": "Alternative",
        "url": "https://...",
        "photo": "https://..."
      }
    ]
  },
  "pois": [
    {
      "name": "Point d'intérêt",
      "image": "https://...",
      "url": "https://...",
      "region": ""
    }
  ],
  "noteItems": [
    {
      "text": "Note interne ou voyageur",
      "photo": "https://..."
    }
  ],
  "warning": [],
  "restaurants": [],
  "shops": [],
  "water": [],
  "substeps": []
}
```

### Sous-étape / variante

Une variante doit utiliser le même modèle qu'une étape, avec des champs de rattachement :

```json
{
  "id": "substep-3-variante-plages",
  "type": "Variante",
  "isSubstep": true,
  "parentStage": 3,
  "stage": 3,
  "name": "Plages Cap de Creus",
  "departure": "Départ variante",
  "arrival": "Arrivée variante",
  "distance": 18,
  "elevationGain": 320,
  "elevationLoss": 250,
  "gpx": "variante-cap-creus.gpx",
  "mapEmbedUrl": "",
  "accommodation": {},
  "pois": [],
  "noteItems": []
}
```

### Contributions publiques

Le JSON cible doit prévoir une zone indépendante pour les futures écritures Apps Script / Studio :

```json
{
  "contributions": [
    {
      "id": "traveler-note-...",
      "type": "travelerNote",
      "stage": 4,
      "createdAt": "2026-07-04T12:00:00.000Z",
      "payload": {
        "text": "Note voyageur",
        "photo": "https://..."
      },
      "status": "published"
    },
    {
      "id": "added-accommodation-...",
      "type": "addedAccommodation",
      "stage": 4,
      "createdAt": "2026-07-04T12:00:00.000Z",
      "payload": {
        "url": "https://...",
        "name": "Nom",
        "photo": "https://..."
      },
      "status": "published"
    }
  ]
}
```

Pendant la transition, ces contributions continuent d'être lues depuis `Notes voyageurs` et `ajout hebergement`.

## État actuel du Studio

Le Studio lit :

- `roadbooks/catalog.json`
- `roadbooks/<id>/roadbook.json`

Il édite actuellement :

- titre ;
- description ;
- étapes ;
- variantes simples ;
- départ / arrivée ;
- distance ;
- D+ ;
- D− ;
- description.

Il exporte un JSON local par téléchargement, sans écrire sur GitHub.

## Adaptations nécessaires dans le Studio

Priorité haute :

1. Préserver tous les champs non édités lors de l'export, sans les simplifier.
2. Afficher et éditer `metadata` : activité, destination, projet, couverture.
3. Afficher et éditer les champs complets d'étape : GPX, carte intégrée, photo, notes, POI, warnings.
4. Afficher et éditer les hébergements principaux et alternatifs.
5. Utiliser `stages[].substeps[]` comme modèle principal des variantes, `variants[]` restant une vue plate dérivable.
6. Recalculer `days` à l'export tant que le site public en dépend.

Priorité moyenne :

1. Ajouter une validation de schéma avant téléchargement.
2. Signaler les champs techniques non éditables.
3. Ajouter un mode import depuis Google Sheets dans le Studio, basé sur `scripts/sync-roadbook-json.js` ou une future API.
4. Préparer l'écriture GitHub ou Apps Script d'un JSON complet.

Priorité basse :

1. Améliorer l'UX d'édition des POI, notes, restaurants, commerces et eau.
2. Ajouter des assistants pour créer une étape depuis un GPX.

## Adaptations nécessaires côté moteur public

1. Conserver temporairement l'ordre actuel : Google Sheets d'abord, JSON fallback.
2. Stabiliser le normaliseur JSON pour qu'il accepte le modèle canonique sans pertes.
3. Réduire progressivement la dépendance à `days`, `legacyAccommodation`, `alternativeAccommodation`, `elevation`.
4. Une fois le JSON canonique validé pour tous les roadbooks, inverser l'ordre : JSON d'abord, Sheets fallback/import.
5. Enfin, retirer Sheets du chemin de lecture public quand le Studio sait écrire le JSON canonique.

## Risques et ambiguïtés avant implémentation complète

1. `Lien POI` est présent dans les Sheets mais n'est pas encore pleinement préservé dans le rendu actuel.
2. Les champs restaurants, commerces, eau et warnings existent dans le modèle interne mais ne correspondent pas encore à des colonnes Sheet observées.
3. Les contributions publiques ciblent aujourd'hui un numéro d'étape ; il faudra préciser comment rattacher une contribution à une sous-étape.
4. `days` est encore nécessaire au site public, mais devrait devenir une vue dérivée.
5. Certaines colonnes ont des fautes ou variantes d'orthographe ; le loader doit rester tolérant pendant la transition.
6. Les photos peuvent venir de `data/`, `photos/` ou d'URL externes ; il faut figer une convention officielle.
7. Les JSON synchronisés contiennent encore des champs de compatibilité. Ils sont utiles maintenant, mais devront être séparés du modèle métier final.
8. La suppression de Google Sheets ne doit pas arriver avant que le Studio puisse éditer et sauvegarder tous les champs métier listés ici.

## Décisions recommandées

1. Garder Google Sheets source de vérité jusqu'à ce que le Studio couvre tout le modèle.
2. Continuer à synchroniser `roadbooks/<id>/roadbook.json` avec `npm run sync:roadbooks`.
3. Faire de `docs/JSON_CONTRACT.md` le contrat court et de ce document le rapport d'audit détaillé.
4. Étendre le Studio par petites étapes : métadonnées, hébergements, POI, notes, GPX/cartes, contributions.
5. Ne pas supprimer `days` tant que le moteur public n'a pas été refactorisé pour dériver la navigation depuis `stages`.
