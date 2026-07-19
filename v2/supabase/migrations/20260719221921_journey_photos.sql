alter table public.roadbook_start_points
  add column photos jsonb not null default '[]'::jsonb;

alter table public.roadbook_start_points
  add constraint roadbook_start_points_photos_array
  check (jsonb_typeof(photos) = 'array');
