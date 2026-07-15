create table public.roadbook_start_points (
  roadbook_id bigint primary key references public.roadbooks(id) on delete cascade,
  departure_city text,
  arrival_city text,
  waypoints jsonb not null default '[]'::jsonb check (jsonb_typeof(waypoints) = 'array'),
  transport_mode text,
  description text,
  distance_km numeric(8, 2) check (distance_km is null or distance_km >= 0),
  duration text,
  google_maps_url text,
  accommodations jsonb not null default '[]'::jsonb check (jsonb_typeof(accommodations) = 'array'),
  pois jsonb not null default '[]'::jsonb check (jsonb_typeof(pois) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.roadbook_start_points enable row level security;

revoke all on table public.roadbook_start_points from anon, authenticated;
grant select on table public.roadbook_start_points to anon;
grant select, insert, update, delete on table public.roadbook_start_points to authenticated;

create policy roadbook_start_points_anon_read_public
on public.roadbook_start_points for select to anon
using (exists (select 1 from public.roadbooks rb where rb.id = roadbook_id and rb.is_public));

create policy roadbook_start_points_authenticated_read
on public.roadbook_start_points for select to authenticated
using (private.can_read_roadbook(roadbook_id));

create policy roadbook_start_points_authenticated_insert
on public.roadbook_start_points for insert to authenticated
with check (private.is_roadbook_editor(roadbook_id));

create policy roadbook_start_points_authenticated_update
on public.roadbook_start_points for update to authenticated
using (private.is_roadbook_editor(roadbook_id))
with check (private.is_roadbook_editor(roadbook_id));

create policy roadbook_start_points_authenticated_delete
on public.roadbook_start_points for delete to authenticated
using (private.is_roadbook_editor(roadbook_id));

create trigger roadbook_start_points_set_updated_at
before update on public.roadbook_start_points
for each row execute function public.set_updated_at();

create or replace function private.touch_parent_roadbook_from_start_point()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.touch_roadbook(coalesce(new.roadbook_id, old.roadbook_id));
  return coalesce(new, old);
end;
$$;

revoke all on function private.touch_parent_roadbook_from_start_point() from public, anon, authenticated;

create trigger roadbook_start_points_touch_parent
after insert or update or delete on public.roadbook_start_points
for each row execute function private.touch_parent_roadbook_from_start_point();
