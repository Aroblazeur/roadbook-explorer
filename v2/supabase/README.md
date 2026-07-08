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

Chaque fichier est lié à un roadbook (`roadbook_id` obligatoire) et optionnellement à une étape (`stage_id`).
Un champ `type` (`image`, `gpx`, `document`, `other`) permet de filtrer par catégorie.

| Policy                                      | SELECT        | INSERT                 | UPDATE            | DELETE            |
|---------------------------------------------|---------------|------------------------|-------------------|-------------------|
| Anyone can read media of public roadbooks   | is_public     |                        |                   |                   |
| Owner can read media of own roadbooks       | ✓ uid         |                        |                   |                   |
| Owner can insert media on own roadbooks     |               | ✓ uid + owner roadbook |                   |                   |
| Owner can update media of own roadbooks     |               |                        | ✓ uid ou uploader |                   |
| Owner can delete media of own roadbooks     |               |                        |                   | ✓ uid ou uploader |

## Storage setup

Créer ces buckets dans le dashboard Supabase → **Storage** :

| Bucket            | Public  | Usage                     |
|-------------------|---------|---------------------------|
| `roadbook-images` | Oui     | Photos (couverture, étapes) |
| `roadbook-gpx`    | Non     | Fichiers GPX traces       |

### Convention de chemins

```
roadbook-images/{userId}/{roadbookId}/{uuid}-{filename}
roadbook-gpx/{userId}/{roadbookId}/{stageId?}/{uuid}-{filename}
```

### Politiques RLS des buckets

Pour `roadbook-images` (bucket public) :

```sql
create policy "Anyone can read images"
  on storage.objects for select
  using ( bucket_id = 'roadbook-images' );

create policy "Owner can insert images on own roadbooks"
  on storage.objects for insert
  with check (
    bucket_id = 'roadbook-images'
    and auth.role() = 'authenticated'
  );

create policy "Owner can update/delete own images"
  on storage.objects for update
  using ( bucket_id = 'roadbook-images' and auth.uid() = owner_id );
```

Pour `roadbook-gpx` (bucket privé) :

```sql
create policy "Owner can read own gpx"
  on storage.objects for select
  using ( bucket_id = 'roadbook-gpx' and auth.uid() = owner_id );

create policy "Owner can insert gpx on own roadbooks"
  on storage.objects for insert
  with check (
    bucket_id = 'roadbook-gpx'
    and auth.role() = 'authenticated'
  );

create policy "Owner can update/delete own gpx"
  on storage.objects for update
  using ( bucket_id = 'roadbook-gpx' and auth.uid() = owner_id );
```

### Ce qui va dans la table `media` à l'upload

| Champ         | Valeur                                              |
|---------------|------------------------------------------------------|
| `bucket`      | `roadbook-images` ou `roadbook-gpx`                 |
| `path`        | Chemin complet dans le bucket                       |
| `public_url`  | Résultat de `getPublicUrl()` (pour images)          |
| `roadbook_id` | Roadbook parent (obligatoire)                       |
| `stage_id`    | Étape parent (optionnel, pour GPX d'étape)          |
| `type`        | `image`, `gpx`, `document`, `other`                 |
| `file_name`   | Nom original du fichier                             |
| `mime_type`   | Type MIME détecté                                   |
| `uploaded_by` | `auth.uid()`                                        |

## Trigger `updated_at`

Les tables `profiles`, `roadbooks`, `stages`, `stage_pois`, `stage_variants` mettent automatiquement `updated_at` à jour sur chaque `UPDATE`.
