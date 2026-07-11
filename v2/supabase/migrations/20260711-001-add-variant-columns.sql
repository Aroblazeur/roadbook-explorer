-- =============================================================================
-- Migration: Add missing columns to stage_variants
-- Date: 2026-07-11
-- Sprint: 18B.1
-- Context: The initial CREATE TABLE for stage_variants was applied without
--          departure, arrival, elevation_gain_m, elevation_loss_m,
--          map_embed_url, and notes columns. The schema.sql file defines them
--          correctly, but the migration block inside schema.sql was never
--          executed against the Supabase project.
--
-- This migration:
--   - Adds the 6 missing columns if they do not exist (idempotent)
--   - Backfills data from metadata jsonb for existing rows
--   - Is safe to run multiple times
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Step 1: Add missing columns (idempotent)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stage_variants'
      and column_name = 'departure'
  ) then
    alter table public.stage_variants add column departure text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stage_variants'
      and column_name = 'arrival'
  ) then
    alter table public.stage_variants add column arrival text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stage_variants'
      and column_name = 'elevation_gain_m'
  ) then
    alter table public.stage_variants add column elevation_gain_m integer;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stage_variants'
      and column_name = 'elevation_loss_m'
  ) then
    alter table public.stage_variants add column elevation_loss_m integer;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stage_variants'
      and column_name = 'map_embed_url'
  ) then
    alter table public.stage_variants add column map_embed_url text;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stage_variants'
      and column_name = 'notes'
  ) then
    alter table public.stage_variants add column notes jsonb not null default '[]'::jsonb;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Step 2: Backfill from metadata (safe for existing imported data)
-- ---------------------------------------------------------------------------
-- The V1 import script (import-v1-roadbook.js) stored variant departure,
-- arrival, elevation, map embed URL, and notes in the metadata jsonb column
-- because the dedicated columns did not exist at import time.
-- This step copies those values into the proper columns.
-- Existing column values take precedence over metadata values.
-- ---------------------------------------------------------------------------
update public.stage_variants
set
  departure      = coalesce(departure, metadata ->> 'departure'),
  arrival        = coalesce(arrival, metadata ->> 'arrival'),
  elevation_gain_m = coalesce(elevation_gain_m, (metadata ->> 'elevation_gain_m')::integer),
  elevation_loss_m = coalesce(elevation_loss_m, (metadata ->> 'elevation_loss_m')::integer),
  map_embed_url  = coalesce(map_embed_url, metadata ->> 'map_embed_url'),
  notes          = coalesce(notes, case
    when metadata ? 'notes' then metadata -> 'notes'
    else '[]'::jsonb
  end)
where
  departure is null
  or arrival is null
  or elevation_gain_m is null
  or elevation_loss_m is null
  or map_embed_url is null
  or notes is null
  or notes = '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- Step 3: Verify result
-- ---------------------------------------------------------------------------
-- Run after migration to confirm columns exist:
--
-- select
--   column_name,
--   data_type,
--   is_nullable,
--   column_default
-- from information_schema.columns
-- where table_name = 'stage_variants'
-- order by ordinal_position;
