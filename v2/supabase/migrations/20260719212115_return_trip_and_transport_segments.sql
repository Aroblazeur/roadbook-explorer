alter table public.roadbook_start_points
  add column transport_segments jsonb not null default '[]'::jsonb,
  add column return_trip jsonb not null default '{}'::jsonb;

alter table public.roadbook_start_points
  add constraint roadbook_start_points_transport_segments_array
    check (jsonb_typeof(transport_segments) = 'array'),
  add constraint roadbook_start_points_return_trip_object
    check (jsonb_typeof(return_trip) = 'object');

update public.roadbook_start_points
set transport_segments = jsonb_build_array(jsonb_build_object(
  'departure_city', coalesce(departure_city, ''),
  'arrival_city', coalesce(arrival_city, ''),
  'waypoints', waypoints,
  'transport_mode', coalesce(transport_mode, 'car'),
  'distance_km', distance_km,
  'duration', coalesce(duration, ''),
  'google_maps_url', google_maps_url
))
where transport_segments = '[]'::jsonb
  and (departure_city is not null or arrival_city is not null or distance_km is not null or duration is not null or google_maps_url is not null);
