-- The day belongs to the logical stage position. When a following stage takes
-- the drafted stage's number, exchange their day values so neither is lost.

create or replace function public.set_stage_draft(p_stage_id bigint, p_draft boolean)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  source public.stages%rowtype;
  replacement public.stages%rowtype;
  variant_row record;
begin
  select * into source from public.stages where id = p_stage_id for update;
  if source.id is null then raise exception 'Étape introuvable.'; end if;
  if not private.is_roadbook_editor(source.roadbook_id) then raise exception 'Accès refusé.'; end if;

  if p_draft then
    select * into replacement
    from public.stages candidate
    where candidate.roadbook_id = source.roadbook_id
      and candidate.id <> source.id
      and coalesce(candidate.metadata ->> 'status', '') <> 'draft'
      and coalesce((candidate.metadata ->> 'isDraft')::boolean, false) = false
    order by
      case when candidate.sort_order > source.sort_order then 0 else 1 end,
      case when candidate.sort_order > source.sort_order then candidate.sort_order end asc,
      candidate.sort_order desc,
      candidate.id
    limit 1
    for update;

    if replacement.id is null and exists (select 1 from public.stage_variants where stage_id = source.id) then
      raise exception 'Impossible de conserver les variantes sans autre étape publiée.';
    end if;

    if replacement.id is not null then
      if replacement.sort_order > source.sort_order and nullif(btrim(source.day), '') is not null then
        update public.stages set day = source.day where id = replacement.id;
        update public.stages set day = replacement.day where id = source.id;
      end if;

      for variant_row in select id from public.stage_variants where stage_id = source.id order by sort_order, id
      loop
        perform public.move_stage_variant(variant_row.id, replacement.id);
      end loop;
    end if;

    update public.stages
    set metadata = jsonb_set(metadata - 'isDraft', '{status}', '"draft"'::jsonb)
    where id = source.id;
  else
    update public.stages
    set metadata = metadata - 'status' - 'isDraft'
    where id = source.id;
  end if;

  with ranked as (
    select id,
      row_number() over (
        order by
          case when metadata ->> 'status' = 'draft' or coalesce((metadata ->> 'isDraft')::boolean, false) then 1 else 0 end,
          sort_order,
          id
      ) as position
    from public.stages
    where roadbook_id = source.roadbook_id
  )
  update public.stages stage
  set sort_order = ranked.position::integer,
      stage_number = ranked.position::smallint
  from ranked
  where stage.id = ranked.id;

  return replacement.id;
end;
$$;

revoke all on function public.set_stage_draft(bigint, boolean) from public, anon;
grant execute on function public.set_stage_draft(bigint, boolean) to authenticated, service_role;

-- Repair drafts created before day-slot preservation was introduced. At that
-- time the draft and its replacement still shared the former stage number.
with day_pairs as materialized (
  select draft.id as draft_id,
    active.id as active_id,
    draft.day as draft_day,
    active.day as active_day
  from public.stages draft
  join lateral (
    select candidate.id, candidate.day
    from public.stages candidate
    where candidate.roadbook_id = draft.roadbook_id
      and candidate.id <> draft.id
      and candidate.stage_number = draft.stage_number
      and coalesce(candidate.metadata ->> 'status', '') <> 'draft'
    order by candidate.sort_order, candidate.id
    limit 1
  ) active on true
  where draft.metadata ->> 'status' = 'draft'
    and nullif(btrim(draft.day), '') is not null
    and coalesce((draft.metadata ->> 'daySlotTransferred')::boolean, false) = false
), repaired_drafts as (
  update public.stages draft
  set day = pairs.active_day,
      metadata = jsonb_set(draft.metadata, '{daySlotTransferred}', 'true'::jsonb)
  from day_pairs pairs
  where draft.id = pairs.draft_id
  returning draft.id
)
update public.stages active
set day = pairs.draft_day
from day_pairs pairs
where active.id = pairs.active_id
  and exists (select 1 from repaired_drafts repaired where repaired.id = pairs.draft_id);
