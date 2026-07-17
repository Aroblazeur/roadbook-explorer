-- Drafting a primary stage removes it from the public sequence. Its variants
-- remain published and follow the stage that takes the same logical position.

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
