# Sprint 18B.1 — Alignement du schéma stage_variants

**Date :** 2026-07-11  
**Branche :** `v2-next-supabase`  
**SHA de base :** `f58cc8e`

---

## Résumé

Le schéma de la table `stage_variants` dans la base Supabase distante manquait 6 colonnes définies dans `schema.sql` et utilisées par le code Studio et Explorer. Ce sprint ajoute ces colonnes, assure la rétrocompatibilité des données importées, et aligne le code de duplication.

## Colonnes manquantes ajoutées

| Colonne | Type | Default | Utilisation |
|---|---|---|---|
| `departure` | `text` | — | Lieu de départ de la variante |
| `arrival` | `text` | — | Lieu d'arrivée de la variante |
| `elevation_gain_m` | `integer` | — | Dénivelé positif cumulé |
| `elevation_loss_m` | `integer` | — | Dénivelé négatif cumulé |
| `map_embed_url` | `text` | — | URL d'intégration carte |
| `notes` | `jsonb` | `'[]'` | Notes structurées |

## Fichiers modifiés

| Fichier | Modification |
|---|---|
| `v2/supabase/migrations/20260711-001-add-variant-columns.sql` | **Nouveau** — Migration idempotente (add column + backfill) |
| `v2/scripts/run-migration-18b1.mjs` | **Nouveau** — Runner de migration (tente RPC, fallback manuel) |
| `v2/scripts/verify-migration-18b1.mjs` | **Nouveau** — Script de vérification post-migration |
| `docs/audits/sprint-18b1-stage-variants-schema.md` | **Nouveau** — Présent rapport |
| `v2/src/app/dashboard/roadbooks/[id]/page.js` | **Modifié** — Duplication des variantes : copie des 6 nouvelles colonnes avec fallback `metadata.*` |

## Stratégie de migration

1. **Idempotence** : Chaque `ALTER TABLE ... ADD COLUMN` utilise `IF NOT EXISTS`
2. **Backfill** : Les colonnes sont remplies à partir de `metadata` jsonb pour les lignes existantes (données V1 importées)
3. **Fallback dans le code** : Studio et Explorer lisent `COALESCE(colonne, vmeta.*)` pour les cas où la colonne est encore NULL
4. **Duplication** : Copie les colonnes directement avec fallback `metadata.*` pour les anciennes lignes

## Code aligné

### Studio — `page.js` (ligne 354)
Le formulaire de création de variante écrit déjà dans les 6 colonnes.

### Studio — `page.js` (lignes 1082-1084) — DUPLICATION
```diff
+ departure: v.departure ?? v.metadata?.departure ?? null,
+ arrival: v.arrival ?? v.metadata?.arrival ?? null,
+ elevation_gain_m: v.elevation_gain_m ?? v.metadata?.elevation_gain_m ?? null,
+ elevation_loss_m: v.elevation_loss_m ?? v.metadata?.elevation_loss_m ?? null,
+ map_embed_url: v.map_embed_url ?? v.metadata?.map_embed_url ?? null,
+ notes: v.notes ?? v.metadata?.notes ?? [],
```

### Explorer — `[slug]/page.js` (lignes 262-265)
Lit les 6 colonnes avec fallback `vmeta.*`. Déjà correct.

### Import V1 — `import-v1-roadbook.js` (lignes 471-483)
Stocke en `metadata`. Seront backfillées par la migration.

## Build

```bash
npm run build  # ✅ Compilation réussie, 0 erreur TS
```

## Schéma cible (16 colonnes)

```
id, stage_id, label, distance_km, gpx_url, description, sort_order,
metadata, created_at, updated_at,
departure, arrival, elevation_gain_m, elevation_loss_m,
map_embed_url, notes
```

## Non traités (hors scope 18B.1)

- `distance_km` vs `distance_total_km` : pas de correction
- Draft : pas de persistence en draft
- Middleware : pas de protection de routes
- Page privée `/roadbooks/[slug]` : erreur pour non-propriétaire

## Pré-requis

Avant de valider le sprint, la migration SQL doit être exécutée dans le SQL Editor Supabase :

```
Dashboard → https://supabase.com/dashboard/project/wuberwxheznzntdyqwyj/sql/new
```

Contenu : `v2/supabase/migrations/20260711-001-add-variant-columns.sql`

Puis lancer la vérification :
```bash
node scripts/verify-migration-18b1.mjs
```
