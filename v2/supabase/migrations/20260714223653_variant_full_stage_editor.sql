alter table public.stage_variants
  add column if not exists stage_photo_url text,
  add column if not exists day text,
  add column if not exists stage_label text,
  add column if not exists duration text,
  add column if not exists accommodation_name text,
  add column if not exists accommodation_url text,
  add column if not exists accommodation_photo text,
  add column if not exists accommodation_type text,
  add column if not exists alternatives jsonb not null default '[]'::jsonb;

alter table public.stage_pois
  add column if not exists variant_id bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'stage_variants_id_stage_id_key'
      and conrelid = 'public.stage_variants'::regclass
  ) then
    alter table public.stage_variants
      add constraint stage_variants_id_stage_id_key unique (id, stage_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'stage_pois_variant_stage_fkey'
      and conrelid = 'public.stage_pois'::regclass
  ) then
    alter table public.stage_pois
      add constraint stage_pois_variant_stage_fkey
      foreign key (variant_id, stage_id)
      references public.stage_variants (id, stage_id)
      on delete cascade;
  end if;
end;
$$;

create index if not exists idx_pois_variant
  on public.stage_pois (variant_id)
  where variant_id is not null;

update public.stage_variants
set
  stage_photo_url = coalesce(stage_photo_url, nullif(metadata ->> 'stagePhoto', '')),
  accommodation_name = coalesce(accommodation_name, nullif(metadata #>> '{accommodation,name}', ''), nullif(metadata ->> 'legacyAccommodation', '')),
  accommodation_url = coalesce(accommodation_url, nullif(metadata #>> '{accommodation,url}', '')),
  accommodation_photo = coalesce(accommodation_photo, nullif(metadata #>> '{accommodation,photo}', '')),
  accommodation_type = coalesce(accommodation_type, nullif(metadata #>> '{accommodation,type}', '')),
  alternatives = case
    when alternatives = '[]'::jsonb and jsonb_typeof(metadata #> '{accommodation,alternatives}') = 'array'
      then metadata #> '{accommodation,alternatives}'
    else alternatives
  end;

update public.stage_pois as poi
set variant_id = (
  select variant.id
  from public.stage_variants as variant
  where variant.stage_id = poi.stage_id
    and variant.label = poi.metadata ->> 'fromVariant'
  order by abs(extract(epoch from (variant.created_at - poi.created_at))), variant.id
  limit 1
)
where poi.variant_id is null
  and nullif(poi.metadata ->> 'fromVariant', '') is not null
  and exists (
    select 1
    from public.stage_variants as variant
    where variant.stage_id = poi.stage_id
      and variant.label = poi.metadata ->> 'fromVariant'
  );
