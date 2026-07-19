alter table public.roadbook_start_points
  add column route_maps jsonb not null default '[]'::jsonb;

alter table public.roadbook_start_points
  add constraint roadbook_start_points_route_maps_array
  check (jsonb_typeof(route_maps) = 'array');
