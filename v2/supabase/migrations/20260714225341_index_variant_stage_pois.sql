create index if not exists idx_stage_pois_variant_stage
  on public.stage_pois(variant_id, stage_id)
  where variant_id is not null;
