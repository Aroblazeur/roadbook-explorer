-- =============================================================================
-- Sprint 18C — roadbooks.updated_at devient la version distante globale
--
-- 1. Modifie set_updated_at() pour utiliser clock_timestamp() au lieu de now()
-- 2. Crée la fonction touch_roadbook() et les triggers de cascade
-- 3. Backfill : met à jour roadbooks.updated_at depuis les tables enfants
-- =============================================================================

-- -----------------------------------------------------------
-- 1. Precision temporelle : clock_timestamp() au lieu de now()
-- -----------------------------------------------------------
-- now()  renvoie la même valeur pendant toute une transaction.
-- clock_timestamp() progresse réellement, garantissant que deux
-- mutations successives produisent des versions distinctes.
-- -----------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = clock_timestamp();
  return new;
end;
$$ language plpgsql;

-- -----------------------------------------------------------
-- 2. Fonction de cascade : roadbooks.updated_at ← enfant
-- -----------------------------------------------------------
-- Appelée par les triggers AFTER INSERT/UPDATE/DELETE des
-- tables enfants. Met à jour roadbooks.updated_at via le
-- trigger set_updated_at() existant (BEFORE UPDATE).
-- -----------------------------------------------------------
create or replace function public.touch_roadbook(p_roadbook_id bigint)
returns void as $$
begin
  if p_roadbook_id is null then
    return;
  end if;
  -- Met à jour n'importe quelle colonne pour déclencher
  -- le BEFORE UPDATE trigger qui set updated_at.
  update public.roadbooks
  set title = title
  where id = p_roadbook_id;
end;
$$ language plpgsql;

-- -----------------------------------------------------------
-- 3. Triggers de cascade
-- -----------------------------------------------------------

-- 3a. Stages — roadbook_id direct
create or replace function public.touch_roadbook_from_stage()
returns trigger as $$
declare
  v_roadbook_id bigint;
begin
  v_roadbook_id := coalesce(new.roadbook_id, old.roadbook_id);
  perform public.touch_roadbook(v_roadbook_id);
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_stages_touch_roadbook on public.stages;
create trigger trg_stages_touch_roadbook
  after insert or update or delete on public.stages
  for each row execute function public.touch_roadbook_from_stage();

-- 3b. Stage POIs — via stages.roadbook_id
create or replace function public.touch_roadbook_from_poi()
returns trigger as $$
declare
  v_stage_id bigint;
  v_roadbook_id bigint;
begin
  v_stage_id := coalesce(new.stage_id, old.stage_id);
  if v_stage_id is null then
    return null;
  end if;
  select roadbook_id into v_roadbook_id
  from public.stages
  where id = v_stage_id;
  perform public.touch_roadbook(v_roadbook_id);
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_pois_touch_roadbook on public.stage_pois;
create trigger trg_pois_touch_roadbook
  after insert or update or delete on public.stage_pois
  for each row execute function public.touch_roadbook_from_poi();

-- 3c. Stage variants — via stages.roadbook_id
create or replace function public.touch_roadbook_from_variant()
returns trigger as $$
declare
  v_stage_id bigint;
  v_roadbook_id bigint;
begin
  v_stage_id := coalesce(new.stage_id, old.stage_id);
  if v_stage_id is null then
    return null;
  end if;
  select roadbook_id into v_roadbook_id
  from public.stages
  where id = v_stage_id;
  perform public.touch_roadbook(v_roadbook_id);
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_variants_touch_roadbook on public.stage_variants;
create trigger trg_variants_touch_roadbook
  after insert or update or delete on public.stage_variants
  for each row execute function public.touch_roadbook_from_variant();

-- 3d. Media — roadbook_id direct
-- Note : media n'a pas de colonne updated_at. Ce trigger est
-- la seule façon de remonter les mutations media vers le parent.
create or replace function public.touch_roadbook_from_media()
returns trigger as $$
declare
  v_roadbook_id bigint;
begin
  v_roadbook_id := coalesce(new.roadbook_id, old.roadbook_id);
  perform public.touch_roadbook(v_roadbook_id);
  return null;
end;
$$ language plpgsql;

drop trigger if exists trg_media_touch_roadbook on public.media;
create trigger trg_media_touch_roadbook
  after insert or update or delete on public.media
  for each row execute function public.touch_roadbook_from_media();

-- -----------------------------------------------------------
-- 4. Backfill : synchroniser roadbooks.updated_at avec les enfants
-- -----------------------------------------------------------
-- La table media n'a pas de colonne updated_at. On utilise
-- created_at comme approximation pour les médias existants.
-- Cela ne posera pas de problème car toute mutation future
-- mettra à jour roadbooks.updated_at correctement.
-- -----------------------------------------------------------
update public.roadbooks r
set updated_at = greatest(
  r.updated_at,
  coalesce((
    select max(s.updated_at) from public.stages s
    where s.roadbook_id = r.id
  ), r.updated_at),
  coalesce((
    select max(sp.updated_at) from public.stage_pois sp
    join public.stages s on s.id = sp.stage_id
    where s.roadbook_id = r.id
  ), r.updated_at),
  coalesce((
    select max(sv.updated_at) from public.stage_variants sv
    join public.stages s on s.id = sv.stage_id
    where s.roadbook_id = r.id
  ), r.updated_at),
  coalesce((
    select max(m.created_at) from public.media m
    where m.roadbook_id = r.id
  ), r.updated_at)
);

-- -----------------------------------------------------------
-- 5. Verification
-- -----------------------------------------------------------
do $$
begin
  -- Verifier que tous les triggers sont presents
  assert exists (
    select 1 from information_schema.triggers
    where trigger_name = 'trg_stages_touch_roadbook'
      and event_object_table = 'stages'
  ), 'trg_stages_touch_roadbook manquant';

  assert exists (
    select 1 from information_schema.triggers
    where trigger_name = 'trg_pois_touch_roadbook'
      and event_object_table = 'stage_pois'
  ), 'trg_pois_touch_roadbook manquant';

  assert exists (
    select 1 from information_schema.triggers
    where trigger_name = 'trg_variants_touch_roadbook'
      and event_object_table = 'stage_variants'
  ), 'trg_variants_touch_roadbook manquant';

  assert exists (
    select 1 from information_schema.triggers
    where trigger_name = 'trg_media_touch_roadbook'
      and event_object_table = 'media'
  ), 'trg_media_touch_roadbook manquant';

  -- Verifier le type de updated_at
  assert exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'roadbooks'
      and column_name = 'updated_at'
      and data_type = 'timestamp with time zone'
  ), 'roadbooks.updated_at doit etre timestamptz';

  -- Verifier que content_version n a pas ete ajoute
  assert not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'roadbooks'
      and column_name = 'content_version'
  ), 'content_version ne doit pas exister';
end;
$$;
