# Sprint 18B.2.1 — Normalisation des dénivelés totaux

**Date :** 2026-07-11  
**Branche :** `v2-next-supabase`  
**SHA de base :** `5b59c21` (18B.2)  

---

## Décision de modèle

| Propriété | Valeur |
|---|---|
| **Champ canonique D+** | `elevation_gain_m` |
| **Champ canonique D−** | `elevation_loss_m` |
| **Champ historique** | `elevation_gain_total_m` / `elevation_loss_total_m` (n'ont jamais existé en base) |
| **Valeur stockée ou calculée** | Stockée manuellement, recalculable depuis les étapes |
| **Règle d'écriture** | Toujours `elevation_gain_m` / `elevation_loss_m` |
| **Suppression future** | Aucune — les anciens noms n'existent pas en base |

## Inventaire

| Emplacement | Champ utilisé | Problème |
|---|---|---|
| `schema.sql` roadbooks L84-85 | `elevation_gain_m`, `elevation_loss_m` | ✅ Correct |
| `schema.sql` stages L131-132 | `elevation_gain_m`, `elevation_loss_m` | ✅ Correct |
| `schema.sql` stage_variants L293-294 | `elevation_gain_m`, `elevation_loss_m` | ✅ Correct |
| Studio L124 — lecture fallback | `elevation_gain_total_m` | ❌ Corrigé |
| Studio L125 — lecture fallback | `elevation_loss_total_m` | ❌ Corrigé |
| Studio L214 — écriture route | `elevation_gain_total_m` | ❌ Corrigé |
| Studio L215 — écriture route | `elevation_loss_total_m` | ❌ Corrigé |
| Studio L784 — écriture auto-calc | `elevation_gain_total_m` | ❌ Corrigé |
| Studio L785 — écriture auto-calc | `elevation_loss_total_m` | ❌ Corrigé |
| Tous les autres (45+) | `elevation_gain_m` / `elevation_loss_m` | ✅ Correct |

## Fichier modifié

| Fichier | Modification |
|---|---|
| `v2/src/app/dashboard/roadbooks/[id]/page.js` | 6 corrections |
| `v2/scripts/verify-migration-18b2-1.mjs` | Nouveau script |

### Détail des corrections (page.js)

- L124 : `data.elevation_gain_total_m` → `data.elevation_gain_m`
- L125 : `data.elevation_loss_total_m` → `data.elevation_loss_m`
- L214 : `elevation_gain_total_m:` → `elevation_gain_m:`
- L215 : `elevation_loss_total_m:` → `elevation_loss_m:`
- L784 : `updateFields.elevation_gain_total_m` → `updateFields.elevation_gain_m`
- L785 : `updateFields.elevation_loss_total_m` → `updateFields.elevation_loss_m`

## Build

```bash
npm run build  # ✅ 0 erreur, 0 warning TS
```

## Commandes de vérification

```bash
cd v2 && node scripts/verify-migration-18b2-1.mjs
```
