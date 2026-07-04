# Sprint 3A — Synchronisation générique des roadbooks vers le JSON canonique

Date : 2026-07-04

## Objectif

Créer la première étape concrète de migration JSON-first :

- conserver Google Sheets comme source de vérité fonctionnelle ;
- générer des `roadbook.json` cohérents depuis les Sheets actuels ;
- produire un format aligné avec `docs/JSON_FIRST_MIGRATION_AUDIT.md` et `docs/JSON_CONTRACT.md` ;
- ne pas traiter uniquement `perinexus`.

## Mécanisme utilisé

Le script générique :

```bash
npm run sync:roadbooks
```

lit :

- `roadbooks/catalog.json` ;
- `roadbooks/<id>/config.js` ;
- les feuilles Google Sheets configurées pour chaque roadbook.

Puis il écrit :

```text
roadbooks/<id>/roadbook.json
```

Le pipeline réutilise le loader existant afin de conserver le même mapping que le site public pendant la transition.

## Roadbooks synchronisés

| Roadbook | Google Sheet | Étapes | Variantes | Vues navigables | Notes | Contributions |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `perinexus` | `1jhlhFPZF-oeAaiJ0pLKKagNMMa-SBxJ9HgnB4SMnyPU` | 10 | 3 | 13 | 1 | 2 |
| `alsace-canal-marne-rhin` | `1uAD98fd3HjDHBGxquWZybm7YXdA9wOFad0eiygy4qrA` | 2 | 0 | 2 | 0 | 0 |
| `voie-bleue` | `16OzEESCJaPNToT-Iy1QHf8JzNbgYtgWIJgG5f6C3iNg` | 6 | 0 | 6 | 0 | 0 |

## Fichiers JSON mis à jour

- `roadbooks/perinexus/roadbook.json`
- `roadbooks/alsace-canal-marne-rhin/roadbook.json`
- `roadbooks/voie-bleue/roadbook.json`

## Feuilles intégrées

Pour chaque roadbook du catalogue, la synchronisation lit les feuilles configurées :

| Feuille | Rôle | Statut Sprint 3A |
| --- | --- | --- |
| `Configuration` | titre, description, activité, destination, couverture, statut projet | intégré dans `title`, `description`, `metadata` |
| `etapes principales` | étapes principales, résumé, GPX, POI, hébergements, notes | intégré dans `stages[]`, `summary`, `days[]` |
| `Variante et option` | sous-étapes / variantes | intégré dans `stages[].substeps[]` et `variants[]` |
| `Notes voyageurs` | contributions notes | intégré dans `noteItems[]`, `notes[]`, `contributions[]` |
| `ajout hebergement` / `Ajout hebergement` | contributions hébergements | intégré dans `accommodation.alternatives[]`, `accommodation[]`, `contributions[]` |

## Colonnes effectivement intégrées

### Informations générales

- `titre`
- `Activité`
- `Destination`
- `Description`
- `image de couverture`
- `Projet`

### Étapes principales

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
- `photo hébergement alternatif`
- `Nom hébergement alternatif`
- `Notes`
- `lien d'integration de map`
- `GPX`
- `Point d'intérêt`
- `Images POI`
- `lien POI`

### Variantes / options

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
- `photo hébergement alternatif`
- `Nom hébergement alternatif`
- `Notes`
- `lien d'integration de map`
- `GPX`

### Contributions publiques

`Notes voyageurs` :

- `Horodateur`
- `étape`
- `Note`
- `Photo`

`ajout hebergement` :

- `Horodateur`
- `étape`
- `URL`
- `Nom`
- `photo`

## Améliorations Sprint 3A

- `Lien POI` est maintenant conservé dans `pois[].url` lorsque la cellule contient une URL exploitable.
- Les notes voyageurs conservent maintenant :
  - `createdAt`
  - `source: "travelerNote"`
- Les hébergements ajoutés conservent maintenant :
  - `createdAt`
  - `source: "addedAccommodation"`
- Une collection canonique `contributions[]` est générée pour préparer les futures contributions JSON-first.
- Le template JSON inclut maintenant `contributions: []`.

## Compatibilité avec le contrat canonique

Les JSON générés contiennent :

- `id`
- `title`
- `description`
- `metadata`
- `summary`
- `stages`
- `variants`
- `accommodation`
- `pois`
- `notes`
- `contributions`
- `days`

`days` reste présent temporairement pour compatibilité avec le site public actuel.

## Compatibilité Studio

Le Studio peut désormais s'appuyer sur des JSON plus fiables qu'avant :

- tous les roadbooks du catalogue ont un `roadbook.json` ;
- les étapes sont disponibles dans `stages[]` ;
- les variantes sont disponibles dans `stages[].substeps[]` et `variants[]` ;
- les champs non édités par le Studio restent présents dans le JSON.

Limite actuelle : le Studio n'édite pas encore tout le modèle canonique. Il sait éditer les champs de base, mais pas encore toute la profondeur métier :

- hébergements complets ;
- POI ;
- GPX / cartes ;
- notes ;
- contributions ;
- métadonnées avancées.

## Zones non migrées ou ambiguës

- Les feuilles actuelles ne contiennent pas de colonnes observées pour restaurants, commerces, points d'eau ou warnings. Les tableaux `restaurants`, `shops`, `water`, `warning` restent donc vides.
- Les contributions publiques ciblent encore uniquement un numéro d'étape. Le rattachement fin à une sous-étape devra être défini avant une migration complète.
- Certaines colonnes Sheet ont des noms historiques ou fautifs (`Hebergement altenatif`, `Nom etapes`). Le loader reste tolérant.
- Les colonnes vides finales observées dans les Sheets ne sont pas migrées.
- Les URLs POI ne sont conservées que lorsqu'elles existent réellement comme valeur CSV exploitable.
- Les JSON contiennent encore des champs de compatibilité (`days`, `legacyAccommodation`, `alternativeAccommodation`, `elevation`) nécessaires au site public actuel.

## Conclusion

Sprint 3A atteint son objectif :

- les Google Sheets restent la source de vérité ;
- les roadbooks existants du catalogue sont synchronisés vers un JSON canonique exploitable ;
- le pipeline est générique ;
- le modèle produit prépare la bascule future du Studio et du site public sans casser l'existant.
