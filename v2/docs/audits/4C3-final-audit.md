# Sprint 4C3 — Audit GPX final

Date : 14/07/2026
Commit : 6a2e7e5fcdf582c798bee3c6d03637e23aed2c7c
Base : Supabase production (wuberwxheznzntdyqwyj)

---

## Résumé

| Métrique | Valeur |
|----------|--------|
| Total médias GPX | 20 |
| Canoniques | 0 |
| Legacy-compatibles | 19 |
| Ambigus | 1 |
| Invalides | 0 |
| Doublons | 0 |
| Incohérences référentielles | 0 |
| Objets Storage manquants | 0 |

## Répartition par roadbook

| Roadbook | Total | C | L | A | I |
|----------|-------|---|---|---|---|
| pirenexus (perinexus) | 11 | 0 | 10 | 1 | 0 |
| Voie bleue | 7 | 0 | 7 | 0 | 0 |
| Alsace canal Marne-Rhin | 2 | 0 | 2 | 0 | 0 |
| drava | 0 | 0 | 0 | 0 | 0 |
| AUDIT 18A — Test complet | 0 | 0 | 0 | 0 | 0 |
| AUDIT 18A — Brouillon privé | 0 | 0 | 0 | 0 | 0 |

## Répartition par scope

| Scope | Nombre |
|-------|--------|
| stage | 18 |
| variant | 1 |
| roadbook | 1 |

## Répartition par rôle

| Rôle | Nombre |
|------|--------|
| official | 20 |

Tous les GPX existants sont des GPX officiels (legacy `gpx-stage`, `gpx-official` ou `gpx-variant`). Aucun GPX `custom` n'existe dans les données historiques.

## Médias migrables (19)

Tous les médias legacy-compatibles peuvent être migrés automatiquement via `buildCanonicalGpxMediaInput()` :

- **Alsace** (2) : media.id=27, 28 — legacy `gpx-stage` scope=stage role=official
- **Perinexus** (10) : media.id=30–40 — legacy `gpx-stage` scope=stage role=official
- **Voie bleue** (7) : media.id=43–49 — legacy `gpx-stage` (44–49) et `gpx-official` (43) scope=roadbook role=official

Chacun possède un `stage_id` valide pointant vers une étape existante, et leur objet Storage est présent.

## Médias bloquants (1)

### media.id = 41 — Variante Perinexus

| Champ | Valeur |
|-------|--------|
| Roadbook | pirenexus (id=3) |
| Classification | `ambiguous` |
| Raison | `legacy-variant-target-is-incomplete` |
| Source | `legacy-role` (role=`gpx-variant`) |
| Stage ID | `null` |
| Variant ID | `null` |
| Path | `roadbooks/perinexus/gpx/Variante 3 cap de creus.gpx` |
| Storage | présent |

**Problème** : Ce média utilise le rôle legacy `gpx-variant` mais ne possède ni `stage_id` ni `variant_id` dans ses métadonnées. La classification retourne `ambiguous` car la cible (quelle étape, quelle variante) est indéterminable automatiquement.

**Contexte** : Le nom « Variante 3 cap de creus » suggère un rapport avec le Cap de Creus, mais sans `stage_id` on ne peut pas associer ce GPX à une étape précise automatiquement.

**Action requise** : Décision humaine pour déterminer :
1. À quelle étape du roadbook Perinexus ce variant se rattache
2. Quel identifiant de variante lui attribuer (ou s'il s'agit d'une variante libre)

## Vérification Storage

- Bucket `roadbook-gpx` : présent
- Objets attendus : 20
- Objets trouvés : 20
- Objets manquants : 0

Tous les chemins `path` de la table `media` correspondent à des objets existants dans le bucket.

## Vérification référentielle

- Roadbooks référencés : 3 (alsace=5, perinexus=3, voie-bleue=4)
- Stages référencés : 22 (tous existants, appartiennent au bon roadbook)
- Variantes : pas de table dédiée (stockées dans `stages.alternatives`)
- Aucune incohérence détectée

## Compteurs Supabase

| Entité | Valeur |
|--------|--------|
| Roadbooks | 6 |
| Stages | 22 |
| Médias GPX | 20 |
| Objets Storage | 20 |
| Buckets privés | 2 (roadbook-images, roadbook-gpx) |
| Policies Storage | 5 (inchangées) |

## Décision

**NO GO 4C4**

Le sprint 4C4 (migration automatique des GPX legacy) ne peut pas être lancé tant que le cas `media.id=41` n'est pas résolu.

**Raison** : 1 média ambigu (`media.id=41`, legacy `gpx-variant` sans `stage_id`). Sans décision humaine sur la cible de ce variant, la migration automatique produirait un enregistrement invalide ou échouerait.

**Condition pour passer en GO** : Décision humaine sur `media.id=41` — déterminer l'étape et l'identifiant de variante cibles. Une fois cette information disponible, les 19 autres médias pourront être migrés automatiquement sans autre intervention.

**Note** : Les 19 médias legacy-compatibles sont entièrement prêts pour la migration automatique (stage_id valides, Storage présent, identifiants métier uniques, pas de doublons).
