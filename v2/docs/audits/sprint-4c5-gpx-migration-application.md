# Sprint 4C5 — Application de la migration GPX

Date : 14/07/2026
Commit source : `926561d0bf8074808d80fe3bc5a1e47b498745aa`
Outil : `scripts/apply-gpx-migration.mjs`
Tests : `scripts/test-sprint-4c5.mjs` (35 tests, 0 échecs)

---

## État initial

| Métrique | Valeur |
|----------|--------|
| Médias GPX | 20 |
| Canoniques | 0 |
| Legacy-compatibles | 19 |
| Ambigus | 1 (id=41) |
| Invalides | 0 |
| Doublons | 0 |

## Plan 4C4 utilisé

Fichier : `reports/gpx-migration-plan.json`
Hash : `1729a68fe3b1ddd6e607ba7d176113f1fa7678bed3181be20f65ff81ff04a87d`
Opérations : 19
Exclus : media.id=41

Comparaison avant application : ✅ Identique

## Sauvegarde de rollback

Fichier : `reports/gpx-migration-rollback.json`
Hash : `37b9418af4a18ef8c579f992f43bc0c185435a7032e361e4084301c5be41159d`
Snapshots : 19
media.id=41 : absent ✅
Doublons : 0 ✅

## Procédure d'application

```
node scripts/apply-gpx-migration.mjs --apply --confirm=APPLY-19-CANONICAL-GPX --plan=./reports/gpx-migration-plan.json
```

## Résultat par opération

| Seq | mediaId | Roadbook | Classification avant | Classification après | Statut |
|-----|---------|----------|--------------------|--------------------|--------|
| 1 | 30 | pirenexus | stage/gpx-stage (legacy) | stage/official (canonical) | ✅ |
| 2 | 31 | pirenexus | stage/gpx-stage (legacy) | stage/official (canonical) | ✅ |
| 3 | 33 | pirenexus | stage/gpx-stage (legacy) | stage/official (canonical) | ✅ |
| 4 | 34 | pirenexus | stage/gpx-stage (legacy) | stage/official (canonical) | ✅ |
| 5 | 35 | pirenexus | stage/gpx-stage (legacy) | stage/official (canonical) | ✅ |
| 6 | 36 | pirenexus | stage/gpx-stage (legacy) | stage/official (canonical) | ✅ |
| 7 | 37 | pirenexus | stage/gpx-stage (legacy) | stage/official (canonical) | ✅ |
| 8 | 38 | pirenexus | stage/gpx-stage (legacy) | stage/official (canonical) | ✅ |
| 9 | 39 | pirenexus | stage/gpx-stage (legacy) | stage/official (canonical) | ✅ |
| 10 | 40 | pirenexus | stage/gpx-stage (legacy) | stage/official (canonical) | ✅ |
| 11 | 43 | Voie bleue | roadbook/gpx-official (legacy) | roadbook/official (canonical) | ✅ |
| 12 | 44 | Voie bleue | stage/gpx-stage (legacy) | stage/official (canonical) | ✅ |
| 13 | 45 | Voie bleue | stage/gpx-stage (legacy) | stage/official (canonical) | ✅ |
| 14 | 46 | Voie bleue | stage/gpx-stage (legacy) | stage/official (canonical) | ✅ |
| 15 | 47 | Voie bleue | stage/gpx-stage (legacy) | stage/official (canonical) | ✅ |
| 16 | 48 | Voie bleue | stage/gpx-stage (legacy) | stage/official (canonical) | ✅ |
| 17 | 49 | Voie bleue | stage/gpx-stage (legacy) | stage/official (canonical) | ✅ |
| 18 | 27 | Alsace | stage/gpx-stage (legacy) | stage/official (canonical) | ✅ |
| 19 | 28 | Alsace | stage/gpx-stage (legacy) | stage/official (canonical) | ✅ |

## Incidents

Aucun incident.

## Rollback effectué

Non nécessaire.

## Audit final

| Métrique | Avant | Après |
|----------|-------|-------|
| Total médias GPX | 20 | 20 |
| Canoniques | 0 | **19** |
| Legacy compatibles | 19 | **0** |
| Ambigus | 1 | **1** (id=41) |
| Invalides | 0 | 0 |
| Doublons | 0 | 0 |
| Objets Storage | 20 | 20 |

## État de media.id=41

- Statut : `ambiguous`
- Raison : `legacy-variant-target-is-incomplete`
- Inchangé : ✅

## Compteurs Supabase avant/après

Seules les 19 lignes éligibles ont été modifiées (champs `stage_id` et `metadata`).
Aucune ligne supprimée. Aucune ligne insérée. Aucun objet Storage modifié.

## Sécurité

✅ Aucune migration SQL
✅ Aucun schéma modifié
✅ Aucune policy modifiée
✅ Aucun objet Storage modifié
✅ Aucune ligne autre que les 19 ciblées modifiée
✅ Aucun secret journalisé
✅ Aucune URL signée journalisée
✅ media.id=41 inchangé

## Décision finale

**GO — Migration réussie. 19 médias GPX canoniques, media.id=41 préservé, rollback disponible.**

---
*Document généré automatiquement après application contrôlée du plan 4C4.*
