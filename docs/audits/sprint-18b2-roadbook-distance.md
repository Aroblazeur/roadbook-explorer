# Sprint 18B.2 — Normalisation `distance_km` / `distance_total_km`

**Date :** 2026-07-11  
**Branche :** `v2-next-supabase`  
**SHA de base :** `54787fb` (18B.1)  

---

## Décision de modèle

| Propriété | Valeur |
|---|---|
| **Champ canonique** | `distance_km` |
| **Champ historique** | `distance_total_km` (n'a jamais existé en base) |
| **Valeur stockée ou calculée** | Stockée manuellement, recalculable depuis les étapes |
| **Règle de fallback** | Aucun — le champ canonique est le seul existant |
| **Règle d'écriture** | Toujours `distance_km` |
| **Suppression future** | Aucune — `distance_total_km` n'existe pas, rien à supprimer |

## Justification

- La colonne réelle dans Supabase est `distance_km` (3 tables : roadbooks, stages, stage_variants)
- `distance_total_km` n'apparaît que dans 3 lignes du Studio `[id]/page.js` — c'est une coquille
- La colonne `distance_total_km` n'existe dans aucun environnement (ni en base, ni dans schema.sql)
- 40 occurrences de `distance_km` dans le code contre 3 de `distance_total_km`
- Aucune migration DB nécessaire

## Fichier modifié

| Fichier | Modification |
|---|---|
| `v2/src/app/dashboard/roadbooks/[id]/page.js` | 3 corrections : `distance_total_km` → `distance_km` |

### Détail des corrections

1. **Ligne 123 (lecture)** : `data.distance_total_km` → `data.distance_km` — lecture du champ réel en fallback après metadata
2. **Ligne 213 (écriture route)** : `distance_total_km: traceDist` → `distance_km: traceDist` — écriture route
3. **Ligne 783 (écriture auto-calc)** : `updateFields.distance_total_km` → `updateFields.distance_km` — écriture auto-calcul

## Anomalies connexes documentées (hors scope 18B.2)

Les mêmes blocs `updateFields` contiennent aussi `elevation_gain_total_m` (lignes 214, 784) et `elevation_loss_total_m` (lignes 215, 785) qui sont également des colonnes inexistantes (les vrais noms sont `elevation_gain_m`, `elevation_loss_m`). Ces corrections sont reportées à un sprint ultérieur.

## Schéma

**Avant :** `roadbooks` utilise `distance_km numeric(8,2)` (déjà correct)
**Après :** Inchangé — seul le code erroné a été corrigé

## Tests

- `npm run build` ✅ (0 erreur, 0 warning TS)
- Aucun test automatisé existant couvrant cette logique
- Vérification manuelle : plus aucune référence à `distance_total_km` dans `v2/src/`

## Commandes de vérification

```bash
# Vérifier l'absence du mauvais nom dans le code
rg distance_total_km v2/src/

# Vérifier la base (lecture)
node -e "
const { createClient } = require('@supabase/supabase-js');
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
s.from('roadbooks').select('id, distance_km').limit(5).then(r => console.log(r.data));
"
```

## RLS

Aucune modification — les politiques existantes couvrent toutes les colonnes.

## Sprint 18B.3 (prévu)

- Accès aux roadbooks privés / page publique

## Sprint 18B.4 (prévu)

- Protection serveur / middleware

## Sprint 18B.5 (prévu)

- Brouillons persistants
