# Supabase — Schéma Roadbook Explorer V2

## Appliquer le schéma

1. Aller dans le dashboard Supabase → **SQL Editor**
2. Coller le contenu de `schema.sql`
3. Cliquer **Run** (ou exécuter requête par requête)

Les commandes sont idempotentes (`create if not exists`).

## Tables créées

| Table            | Description                              |
|------------------|------------------------------------------|
| `profiles`       | Extension de auth.users                  |
| `roadbooks`      | Roadbooks / voyages                      |
| `stages`         | Étapes d'un roadbook                     |
| `stage_pois`     | Points d'intérêt d'une étape             |
| `stage_variants` | Variantes / boucles d'une étape          |
| `media`          | Fichiers uploadés (photos, GPX, docs)    |

## Relations

```
profiles  1────N  roadbooks
roadbooks 1────N  stages
stages    1────N  stage_pois
stages    1────N  stage_variants
profiles  1────N  media
```

## Row Level Security

Toutes les tables ont RLS activée.

### Profils

| Policy                          | SELECT | INSERT | UPDATE | DELETE |
|---------------------------------|--------|--------|--------|--------|
| Users can view own profile      | ✓ uid  |        |        |        |
| Users can insert own profile    |        | ✓ uid  |        |        |
| Users can update own profile    |        |        | ✓ uid  |        |

### Roadbooks

| Policy                               | SELECT     | INSERT | UPDATE | DELETE |
|--------------------------------------|------------|--------|--------|--------|
| Anyone can read public roadbooks     | is_public  |        |        |        |
| Owner can read own roadbooks         | ✓ uid      |        |        |        |
| Owner can insert roadbooks           |            | ✓ uid  |        |        |
| Owner can update roadbooks           |            |        | ✓ uid  |        |
| Owner can delete roadbooks           |            |        |        | ✓ uid  |

### Stages, Stage POIs, Stage Variants

Les droits sont **hérités** du roadbook parent via une sous-requête :

| Policy                                          | SELECT         | INSERT | UPDATE | DELETE |
|-------------------------------------------------|----------------|--------|--------|--------|
| Anyone can read of public roadbooks             | is_public      |        |        |        |
| Owner can read of own roadbooks                 | ✓ uid          |        |        |        |
| Owner can insert / update / delete              |                | ✓ uid  | ✓ uid  | ✓ uid  |

### Media

La table `media` a une colonne `roadbook_id` optionnelle qui lie le fichier à un roadbook.
Les droits sont **hérités** du roadbook parent quand `roadbook_id` est renseigné.

| Policy                                      | SELECT                    | INSERT                    | UPDATE             | DELETE             |
|---------------------------------------------|---------------------------|---------------------------|--------------------|--------------------|
| Anyone can read media of public roadbooks   | is_public ou roadbook null|                           |                    |                    |
| Owner can read media of own roadbooks       | ✓ uid                     |                           |                    |                    |
| Owner can insert media on own roadbooks     |                           | ✓ auth + owner roadbook   |                    |                    |
| Owner can update media of own roadbooks     |                           |                           | ✓ uid ou uploader  |                    |
| Owner can delete media of own roadbooks     |                           |                           |                    | ✓ uid ou uploader  |

## Trigger `updated_at`

Les tables `profiles`, `roadbooks`, `stages`, `stage_pois`, `stage_variants` mettent automatiquement `updated_at` à jour sur chaque `UPDATE`.
