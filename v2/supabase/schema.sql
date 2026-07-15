-- =============================================================================
-- Roadbook Explorer V2 — Schéma Supabase
-- Coller ce fichier dans le SQL Editor du dashboard Supabase.
-- =============================================================================

-- -----------------------------------------------------------
-- 1. Extensions
-- -----------------------------------------------------------
create extension if not exists "uuid-ossp";

-- -----------------------------------------------------------
-- 2. Profiles (étend auth.users)
-- -----------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Un utilisateur peut lire son propre profil
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

-- Un utilisateur peut créer son propre profil
create policy "Users can insert own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Un utilisateur peut modifier son propre profil
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- -----------------------------------------------------------
-- 3. Auto-profile trigger (insère une ligne dans public.profiles à chaque inscription)
-- -----------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

do $$
begin
  if not exists (
    select 1 from information_schema.triggers
    where trigger_name = 'on_auth_user_created'
      and event_object_schema = 'auth'
      and event_object_table = 'users'
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end;
$$;

-- -----------------------------------------------------------
-- 4. Roadbooks
-- -----------------------------------------------------------
create table if not exists public.roadbooks (
  id              bigint generated always as identity primary key,
  slug            text not null unique,
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  title           text not null,
  description     text,
  is_public       boolean not null default false,
  cover_image_url text,
  cover_media_id  bigint,
  distance_km     numeric(8,2),
  elevation_gain_m integer,
  elevation_loss_m integer,
  gpx_url         text,
  map_embed_url   text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_roadbooks_slug on public.roadbooks(slug);
create index if not exists idx_roadbooks_owner on public.roadbooks(owner_id);

alter table public.roadbooks enable row level security;

-- Lecture : public si is_public, sinon owner seulement
create policy "Anyone can read public roadbooks"
  on public.roadbooks for select
  using (is_public = true);

create policy "Owner can read own roadbooks"
  on public.roadbooks for select
  using (auth.uid() = owner_id);

-- Écriture : owner seulement
create policy "Owner can insert roadbooks"
  on public.roadbooks for insert
  with check (auth.uid() = owner_id);

create policy "Owner can update roadbooks"
  on public.roadbooks for update
  using (auth.uid() = owner_id);

create policy "Owner can delete roadbooks"
  on public.roadbooks for delete
  using (auth.uid() = owner_id);

-- -----------------------------------------------------------
-- 5. Stages
-- -----------------------------------------------------------
create table if not exists public.stages (
  id                   bigint generated always as identity primary key,
  roadbook_id          bigint not null references public.roadbooks(id) on delete cascade,
  stage_number         smallint not null,
  sort_order           integer not null default 0,
  title                text,
  departure            text,
  arrival              text,
  distance_km          numeric(8,2),
  elevation_gain_m     integer,
  elevation_loss_m     integer,
  gpx_url              text,
  map_embed_url        text,
  stage_photo_url      text,
  day                  text,
  stage_label          text,
  duration             text,
  accommodation_name   text,
  accommodation_url    text,
  accommodation_photo  text,
  accommodation_type   text,
  notes                jsonb not null default '[]'::jsonb,
  alternatives         jsonb not null default '[]'::jsonb,
  is_substep           boolean not null default false,
  parent_stage_number  smallint,
  metadata             jsonb not null default '{}'::jsonb,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_stages_roadbook on public.stages(roadbook_id);
create index if not exists idx_stages_roadbook_sort_order on public.stages(roadbook_id, sort_order, id);

alter table public.stages enable row level security;

-- Lecture : basée sur les droits du roadbook parent
create policy "Anyone can read stages of public roadbooks"
  on public.stages for select
  using (
    exists (
      select 1 from public.roadbooks r
      where r.id = roadbook_id and r.is_public = true
    )
  );

create policy "Owner can read stages of own roadbooks"
  on public.stages for select
  using (
    exists (
      select 1 from public.roadbooks r
      where r.id = roadbook_id and r.owner_id = auth.uid()
    )
  );

-- Écriture : owner du roadbook parent
create policy "Owner can insert stages"
  on public.stages for insert
  with check (
    exists (
      select 1 from public.roadbooks r
      where r.id = roadbook_id and r.owner_id = auth.uid()
    )
  );

create policy "Owner can update stages"
  on public.stages for update
  using (
    exists (
      select 1 from public.roadbooks r
      where r.id = roadbook_id and r.owner_id = auth.uid()
    )
  );

create policy "Owner can delete stages"
  on public.stages for delete
  using (
    exists (
      select 1 from public.roadbooks r
      where r.id = roadbook_id and r.owner_id = auth.uid()
    )
  );

-- -----------------------------------------------------------
-- 6. Stage POIs
-- -----------------------------------------------------------
create table if not exists public.stage_pois (
  id          bigint generated always as identity primary key,
  stage_id    bigint not null references public.stages(id) on delete cascade,
  variant_id  bigint,
  name        text not null,
  lat         numeric(10,7),
  lng         numeric(10,7),
  poi_type    text,
  description text,
  photo_url   text,
  link_url    text,
  region      text,
  sort_order  smallint not null default 0,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_pois_stage on public.stage_pois(stage_id);
create index if not exists idx_pois_variant on public.stage_pois(variant_id) where variant_id is not null;

alter table public.stage_pois enable row level security;

-- Policies : mêmes droits que le stage → roadbook parent
create policy "Anyone can read pois of public roadbooks"
  on public.stage_pois for select
  using (
    exists (
      select 1 from public.stages s
      join public.roadbooks r on r.id = s.roadbook_id
      where s.id = stage_id and r.is_public = true
    )
  );

create policy "Owner can read pois of own roadbooks"
  on public.stage_pois for select
  using (
    exists (
      select 1 from public.stages s
      join public.roadbooks r on r.id = s.roadbook_id
      where s.id = stage_id and r.owner_id = auth.uid()
    )
  );

create policy "Owner can insert pois"
  on public.stage_pois for insert
  with check (
    exists (
      select 1 from public.stages s
      join public.roadbooks r on r.id = s.roadbook_id
      where s.id = stage_id and r.owner_id = auth.uid()
    )
  );

create policy "Owner can update pois"
  on public.stage_pois for update
  using (
    exists (
      select 1 from public.stages s
      join public.roadbooks r on r.id = s.roadbook_id
      where s.id = stage_id and r.owner_id = auth.uid()
    )
  );

create policy "Owner can delete pois"
  on public.stage_pois for delete
  using (
    exists (
      select 1 from public.stages s
      join public.roadbooks r on r.id = s.roadbook_id
      where s.id = stage_id and r.owner_id = auth.uid()
    )
  );

-- -----------------------------------------------------------
-- 7. Stage variants (boucles, variantes — remplace parentStage)
-- -----------------------------------------------------------
create table if not exists public.stage_variants (
  id          bigint generated always as identity primary key,
  stage_id    bigint not null references public.stages(id) on delete cascade,
  label       text not null,
  distance_km numeric(8,2),
  gpx_url     text,
  description text,
  sort_order  smallint not null default 0,
  departure   text,
  arrival     text,
  elevation_gain_m integer,
  elevation_loss_m integer,
  map_embed_url text,
  stage_photo_url text,
  day text,
  stage_label text,
  duration text,
  accommodation_name text,
  accommodation_url text,
  accommodation_photo text,
  accommodation_type text,
  alternatives jsonb not null default '[]'::jsonb,
  notes       jsonb not null default '[]'::jsonb,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_variants_stage on public.stage_variants(stage_id);

alter table public.stage_variants
  add constraint stage_variants_id_stage_id_key unique (id, stage_id);

alter table public.stage_pois
  add constraint stage_pois_variant_stage_fkey
  foreign key (variant_id, stage_id)
  references public.stage_variants (id, stage_id)
  on delete cascade;

create index if not exists idx_stage_pois_variant_stage
  on public.stage_pois(variant_id, stage_id)
  where variant_id is not null;

-- Ajout des colonnes manquantes pour les variantes existantes (idempotent)
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stage_variants' and column_name = 'departure') then
    alter table public.stage_variants add column departure text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stage_variants' and column_name = 'arrival') then
    alter table public.stage_variants add column arrival text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stage_variants' and column_name = 'elevation_gain_m') then
    alter table public.stage_variants add column elevation_gain_m integer;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stage_variants' and column_name = 'elevation_loss_m') then
    alter table public.stage_variants add column elevation_loss_m integer;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stage_variants' and column_name = 'map_embed_url') then
    alter table public.stage_variants add column map_embed_url text;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'stage_variants' and column_name = 'notes') then
    alter table public.stage_variants add column notes jsonb not null default '[]'::jsonb;
  end if;
end;
$$;

alter table public.stage_variants enable row level security;

-- Policies : mêmes droits que le stage → roadbook parent
create policy "Anyone can read variants of public roadbooks"
  on public.stage_variants for select
  using (
    exists (
      select 1 from public.stages s
      join public.roadbooks r on r.id = s.roadbook_id
      where s.id = stage_id and r.is_public = true
    )
  );

create policy "Owner can read variants of own roadbooks"
  on public.stage_variants for select
  using (
    exists (
      select 1 from public.stages s
      join public.roadbooks r on r.id = s.roadbook_id
      where s.id = stage_id and r.owner_id = auth.uid()
    )
  );

create policy "Owner can insert variants"
  on public.stage_variants for insert
  with check (
    exists (
      select 1 from public.stages s
      join public.roadbooks r on r.id = s.roadbook_id
      where s.id = stage_id and r.owner_id = auth.uid()
    )
  );

create policy "Owner can update variants"
  on public.stage_variants for update
  using (
    exists (
      select 1 from public.stages s
      join public.roadbooks r on r.id = s.roadbook_id
      where s.id = stage_id and r.owner_id = auth.uid()
    )
  );

create policy "Owner can delete variants"
  on public.stage_variants for delete
  using (
    exists (
      select 1 from public.stages s
      join public.roadbooks r on r.id = s.roadbook_id
      where s.id = stage_id and r.owner_id = auth.uid()
    )
  );

-- -----------------------------------------------------------
-- 8. Media
-- -----------------------------------------------------------
create table if not exists public.media (
  id          bigint generated always as identity primary key,
  bucket      text not null,
  path        text not null,
  public_url  text,
  roadbook_id bigint not null references public.roadbooks(id) on delete cascade,
  stage_id    bigint references public.stages(id) on delete cascade,
  type        text not null default 'other'
              check (type in ('image','gpx','document','other')),
  file_name   text,
  mime_type   text,
  uploaded_by uuid not null references public.profiles(id) on delete set null,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),

  constraint uq_media_path unique (bucket, path)
);

create index if not exists idx_media_uploader on public.media(uploaded_by);
create index if not exists idx_media_roadbook on public.media(roadbook_id);
create index if not exists idx_media_stage on public.media(stage_id);
create index if not exists idx_media_type on public.media(type);

alter table public.media enable row level security;

-- Lecture : visible si le roadbook parent est public, ou si on en est le owner
create policy "Anyone can read media of public roadbooks"
  on public.media for select
  using (
    exists (
      select 1 from public.roadbooks r
      where r.id = roadbook_id and r.is_public = true
    )
  );

create policy "Owner can read media of own roadbooks"
  on public.media for select
  using (
    exists (
      select 1 from public.roadbooks r
      where r.id = roadbook_id and r.owner_id = auth.uid()
    )
  );

-- Upload : l'utilisateur doit être le owner du roadbook lié
create policy "Owner can insert media on own roadbooks"
  on public.media for insert
  with check (
    auth.uid() = uploaded_by
    and exists (
      select 1 from public.roadbooks r
      where r.id = roadbook_id and r.owner_id = auth.uid()
    )
  );

-- Modification/suppression : owner du roadbook parent ou uploader
create policy "Owner can update media of own roadbooks"
  on public.media for update
  using (
    auth.uid() = uploaded_by
    or exists (
      select 1 from public.roadbooks r
      where r.id = roadbook_id and r.owner_id = auth.uid()
    )
  );

create policy "Owner can delete media of own roadbooks"
  on public.media for delete
  using (
    auth.uid() = uploaded_by
    or exists (
      select 1 from public.roadbooks r
      where r.id = roadbook_id and r.owner_id = auth.uid()
    )
  );

-- Add FK constraint for roadbooks.cover_media_id -> media.id
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'roadbooks_cover_media_id_fkey'
      and table_schema = 'public'
      and table_name = 'roadbooks'
  ) then
    alter table public.roadbooks
      add constraint roadbooks_cover_media_id_fkey
      foreign key (cover_media_id)
      references public.media(id)
      on delete set null;
  end if;
end;
$$;

-- -----------------------------------------------------------
-- 9. Helper : trigger updated_at
-- -----------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger trg_roadbooks_updated_at
  before update on public.roadbooks
  for each row execute function public.set_updated_at();

create trigger trg_stages_updated_at
  before update on public.stages
  for each row execute function public.set_updated_at();

create trigger trg_stage_pois_updated_at
  before update on public.stage_pois
  for each row execute function public.set_updated_at();

create trigger trg_stage_variants_updated_at
  before update on public.stage_variants
  for each row execute function public.set_updated_at();
