-- Atomic lifecycle operations for stages and variants. These functions preserve
-- POIs and media while changing an item's parent/table.

create or replace function public.promote_stage_variant(p_variant_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.stage_variants%rowtype;
  parent public.stages%rowtype;
  new_id bigint;
begin
  select * into v from public.stage_variants where id = p_variant_id for update;
  if not found then raise exception 'Variante introuvable.'; end if;
  select * into parent from public.stages where id = v.stage_id for update;
  if not private.is_roadbook_editor(parent.roadbook_id) then raise exception 'Accès refusé.'; end if;

  update public.stages set sort_order = sort_order + 1
    where roadbook_id = parent.roadbook_id and sort_order > parent.sort_order;
  update public.stages set stage_number = stage_number + 1
    where roadbook_id = parent.roadbook_id and id <> parent.id and stage_number > parent.stage_number;

  insert into public.stages (
    roadbook_id, stage_number, sort_order, title, departure, arrival, distance_km,
    elevation_gain_m, elevation_loss_m, gpx_url, map_embed_url, stage_photo_url,
    day, stage_label, duration, accommodation_name, accommodation_url,
    accommodation_photo, accommodation_type, notes, alternatives, metadata
  ) values (
    parent.roadbook_id, parent.stage_number + 1, parent.sort_order + 1, v.label,
    v.departure, v.arrival, v.distance_km, v.elevation_gain_m, v.elevation_loss_m,
    v.gpx_url, v.map_embed_url, v.stage_photo_url, v.day, v.stage_label, v.duration,
    v.accommodation_name, v.accommodation_url, v.accommodation_photo,
    v.accommodation_type, v.notes, v.alternatives,
    case when v.description is null then v.metadata
      else jsonb_set(v.metadata, '{description}', to_jsonb(v.description)) end
  ) returning id into new_id;

  update public.stage_pois set stage_id = new_id, variant_id = null where variant_id = v.id;
  update public.media
    set stage_id = new_id,
        metadata = case when type = 'gpx'
          then jsonb_set(metadata - 'variant_id', '{scope}', '"stage"'::jsonb)
          else metadata - 'variant_id' end
    where stage_id = v.stage_id and metadata ->> 'variant_id' = v.id::text;
  delete from public.stage_variants where id = v.id;
  return new_id;
end;
$$;

create or replace function public.demote_stage_to_variant(p_stage_id bigint, p_parent_stage_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  source public.stages%rowtype;
  parent public.stages%rowtype;
  new_id bigint;
  next_order integer;
begin
  if p_stage_id = p_parent_stage_id then raise exception 'Une étape ne peut pas être sa propre parente.'; end if;
  select * into source from public.stages where id = p_stage_id for update;
  select * into parent from public.stages where id = p_parent_stage_id for update;
  if source.id is null or parent.id is null or source.roadbook_id <> parent.roadbook_id then raise exception 'Étape parente invalide.'; end if;
  if not private.is_roadbook_editor(source.roadbook_id) then raise exception 'Accès refusé.'; end if;
  if exists (select 1 from public.stage_variants where stage_id = source.id) then
    raise exception 'Déplacez d''abord les variantes de cette étape.';
  end if;
  select coalesce(max(sort_order), 0) + 1 into next_order from public.stage_variants where stage_id = parent.id;

  insert into public.stage_variants (
    stage_id, label, distance_km, gpx_url, description, sort_order, departure,
    arrival, elevation_gain_m, elevation_loss_m, map_embed_url, stage_photo_url,
    day, stage_label, duration, accommodation_name, accommodation_url,
    accommodation_photo, accommodation_type, alternatives, notes, metadata
  ) values (
    parent.id, source.title, source.distance_km, source.gpx_url,
    source.metadata ->> 'description', next_order, source.departure, source.arrival,
    source.elevation_gain_m, source.elevation_loss_m, source.map_embed_url,
    source.stage_photo_url, source.day, source.stage_label, source.duration,
    source.accommodation_name, source.accommodation_url, source.accommodation_photo,
    source.accommodation_type, source.alternatives, source.notes, source.metadata
  ) returning id into new_id;

  update public.stage_pois set stage_id = parent.id, variant_id = new_id where stage_id = source.id;
  update public.media
    set stage_id = parent.id,
        metadata = case when type = 'gpx'
          then jsonb_set(jsonb_set(metadata, '{variant_id}', to_jsonb(new_id)), '{scope}', '"variant"'::jsonb)
          else jsonb_set(metadata, '{variant_id}', to_jsonb(new_id)) end
    where stage_id = source.id;
  delete from public.stages where id = source.id;
  return new_id;
end;
$$;

create or replace function public.move_stage_variant(p_variant_id bigint, p_parent_stage_id bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  source public.stage_variants%rowtype;
  old_parent public.stages%rowtype;
  new_parent public.stages%rowtype;
  new_id bigint;
  next_order integer;
begin
  select * into source from public.stage_variants where id = p_variant_id for update;
  select * into old_parent from public.stages where id = source.stage_id for update;
  select * into new_parent from public.stages where id = p_parent_stage_id for update;
  if source.id is null or new_parent.id is null or old_parent.roadbook_id <> new_parent.roadbook_id then raise exception 'Étape parente invalide.'; end if;
  if not private.is_roadbook_editor(old_parent.roadbook_id) then raise exception 'Accès refusé.'; end if;
  if source.stage_id = new_parent.id then return source.id; end if;
  select coalesce(max(sort_order), 0) + 1 into next_order from public.stage_variants where stage_id = new_parent.id;

  insert into public.stage_variants (
    stage_id, label, distance_km, gpx_url, description, sort_order, departure,
    arrival, elevation_gain_m, elevation_loss_m, map_embed_url, stage_photo_url,
    day, stage_label, duration, accommodation_name, accommodation_url,
    accommodation_photo, accommodation_type, alternatives, notes, metadata
  ) values (
    new_parent.id, source.label, source.distance_km, source.gpx_url, source.description,
    next_order, source.departure, source.arrival, source.elevation_gain_m,
    source.elevation_loss_m, source.map_embed_url, source.stage_photo_url, source.day,
    source.stage_label, source.duration, source.accommodation_name, source.accommodation_url,
    source.accommodation_photo, source.accommodation_type, source.alternatives,
    source.notes, source.metadata
  ) returning id into new_id;

  update public.stage_pois set stage_id = new_parent.id, variant_id = new_id where variant_id = source.id;
  update public.media
    set stage_id = new_parent.id,
        metadata = jsonb_set(metadata, '{variant_id}', to_jsonb(new_id))
    where stage_id = old_parent.id and metadata ->> 'variant_id' = source.id::text;
  delete from public.stage_variants where id = source.id;
  return new_id;
end;
$$;

revoke all on function public.promote_stage_variant(bigint) from public, anon;
revoke all on function public.demote_stage_to_variant(bigint, bigint) from public, anon;
revoke all on function public.move_stage_variant(bigint, bigint) from public, anon;
grant execute on function public.promote_stage_variant(bigint) to authenticated, service_role;
grant execute on function public.demote_stage_to_variant(bigint, bigint) to authenticated, service_role;
grant execute on function public.move_stage_variant(bigint, bigint) to authenticated, service_role;
