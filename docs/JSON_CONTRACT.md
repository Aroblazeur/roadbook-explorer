# Contrat JSON canonique RoadBook Explorer

RoadBook Explorer converge vers une architecture **JSON-first** :

```text
un roadbook = un dossier GitHub + roadbooks/<id>/roadbook.json
```

Pendant la transition, les Google Sheets existants restent la source de vérité fonctionnelle. Le fichier JSON canonique doit donc être capable de contenir fidèlement toutes les informations utiles déjà présentes dans les feuilles.

Voir aussi :

- le rapport détaillé : [`JSON_FIRST_MIGRATION_AUDIT.md`](JSON_FIRST_MIGRATION_AUDIT.md) ;
- le rapport de synchronisation Sprint 3A : [`SPRINT3A_SYNC_REPORT.md`](SPRINT3A_SYNC_REPORT.md).

## Emplacement officiel

Chaque roadbook du catalogue doit viser cette structure :

```text
roadbooks/<id>/
├── config.js
├── roadbook.json
├── gpx/
├── photos/
└── data/
    ├── accommodation-enrichment.json
    └── poi-enrichment.json
```

## Structure minimale

```json
{
  "id": "mon-roadbook",
  "title": "Mon Roadbook",
  "description": "Description courte.",
  "metadata": {},
  "summary": {},
  "stages": [],
  "variants": [],
  "accommodation": [],
  "pois": [],
  "notes": [],
  "contributions": [],
  "days": []
}
```

`stages` est la collection source principale. `days` reste présent temporairement pour compatibilité avec l'interface publique existante.

## Mapping Google Sheet → JSON

### Feuille `Configuration`

| Colonne Sheet | JSON |
| --- | --- |
| `titre`, `title`, `nom` | `title` |
| `description`, `resume`, `résumé` | `description` |
| `activite`, `activité`, `activity` | `metadata.activity` |
| `destination`, `lieu`, `region`, `région` | `metadata.destination` |
| `image couverture`, `cover`, `couverture` | `metadata.coverImage` |
| `projet` | `metadata.project`, `metadata.projectStatus` |

### Feuille `etapes principales`

| Colonne Sheet | JSON stage |
| --- | --- |
| `Numero etape` | `stage` |
| `Jour` | `day` |
| `Nom etape`, `Nom etapes` | `stageLabel` |
| `Depart` | `departure` |
| `Arrivee` | `arrival` |
| `Distance (km)` | `distance` |
| `D+ (m)` | `elevationGain` |
| `D− (m)`, `D- (m)` | `elevationLoss` |
| `Photo etape`, `photo de l'étape` | `stagePhoto` |
| `Hébergement` | `accommodation.name` |
| `type hébergement` | `accommodationType` |
| `site web de l'hébergement` | `accommodation.website`, `accommodation.url` |
| `photo hébergement principal` | `accommodation.photo` |
| `Hébergement alternatif` | `accommodation.alternatives[].url` |
| `Nom hébergement alternatif` | `accommodation.alternatives[].name` |
| `photo hébergement alternatif` | `accommodation.alternatives[].photo` |
| `Notes` | `notes`, `noteItems[]` |
| `lien d'integration de map` | `mapEmbedUrl` |
| `GPX` | `gpx` |
| `Point d'intérêt` | `pois[]`, `pointsOfInterest[]`, `interest[]` |
| `Images POI` | `pois[].image` |
| `Lien POI` | `pois[].url` |
| `Région` | `pois[].region` |

Les lignes spéciales `total` et `total des étapes` alimentent `summary.official` et les repères de total, mais ne deviennent jamais des étapes.

### Feuille `Variante et option`

Chaque ligne devient une sous-étape complète. Elle utilise le même modèle qu'une étape principale avec :

| Colonne Sheet | JSON variant/substep |
| --- | --- |
| `Etape principale associée`, `Numero etape`, `Etape` | `parentStage`, `parentStageReference` |
| `Type` | `type` |
| `Nom variante`, `Nom option`, `Nom` | `name` |
| Colonnes communes d'étape | mêmes champs que `stages[]` |

Dans le JSON canonique, les variantes peuvent être stockées :

- dans `stages[].substeps[]` pour le rendu hiérarchique ;
- dans `variants[]` comme collection plate utile aux outils.

### Feuille `Notes voyageurs`

| Colonne Sheet | JSON |
| --- | --- |
| `Étape` | `notes[].stage` |
| `Note` | `notes[].text` et `stage.noteItems[].text` |
| `Photo` | `notes[].photo` et `stage.noteItems[].photo` |

### Feuille `ajout hebergement`

| Colonne Sheet | JSON |
| --- | --- |
| `Étape` | rattachement à l'étape ou sous-étape |
| `URL hébergement` | `accommodation.alternatives[].url` |
| `Nom` | `accommodation.alternatives[].name` |
| `Photo` | `accommodation.alternatives[].photo` |

### Contributions publiques

Les feuilles de contributions restent lues depuis Google Sheets pendant la transition, mais le JSON canonique peut déjà conserver une collection plate :

| Type | JSON |
| --- | --- |
| note voyageur | `contributions[].type = "travelerNote"` |
| hébergement ajouté | `contributions[].type = "addedAccommodation"` |
| étape ciblée | `contributions[].stage` |
| horodatage | `contributions[].createdAt` |
| données métier | `contributions[].payload` |

## Synchronisation transitionnelle

Le script :

```bash
npm run sync:roadbooks
```

importe les Google Sheets configurés et écrit les fichiers :

```text
roadbooks/<id>/roadbook.json
```

Pour cibler un seul roadbook :

```bash
node scripts/sync-roadbook-json.js --roadbook=perinexus
```

Tant que la migration n'est pas terminée, le site public charge les Google Sheets en priorité et conserve le JSON comme fallback générique.
