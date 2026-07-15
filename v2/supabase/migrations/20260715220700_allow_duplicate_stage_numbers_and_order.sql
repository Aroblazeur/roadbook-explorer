alter table public.stages
  drop constraint if exists uq_stage_number;

alter table public.stages
  add column if not exists sort_order integer;

with ranked as (
  select id, row_number() over (partition by roadbook_id order by stage_number, id)::integer as position
  from public.stages
)
update public.stages as stage
set sort_order = ranked.position
from ranked
where ranked.id = stage.id
  and stage.sort_order is null;

alter table public.stages
  alter column sort_order set default 0,
  alter column sort_order set not null;

create index if not exists idx_stages_roadbook_sort_order
  on public.stages (roadbook_id, sort_order, id);
