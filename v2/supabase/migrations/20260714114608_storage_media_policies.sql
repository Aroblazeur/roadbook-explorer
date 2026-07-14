-- Sprint 4C1 — Policies Storage fondées sur public.media et public.roadbooks.
-- Les buckets roadbook-images et roadbook-gpx restent privés.
-- Cette migration ne modifie ni objet Storage ni ligne applicative.

drop policy if exists "roadbook_media_public_read" on storage.objects;
drop policy if exists "roadbook_media_owner_read" on storage.objects;
drop policy if exists "roadbook_media_owner_insert" on storage.objects;
drop policy if exists "roadbook_media_owner_update" on storage.objects;
drop policy if exists "roadbook_media_owner_delete" on storage.objects;

create policy "roadbook_media_public_read"
on storage.objects
for select
to anon, authenticated
using (
  storage.objects.bucket_id in ('roadbook-images', 'roadbook-gpx')
  and storage.allow_any_operation(
    array[
      'object.sign',
      'object.sign_many',
      'object.get_authenticated',
      'object.get_authenticated_info'
    ]
  )
  and exists (
    select 1
    from public.media m
    join public.roadbooks r on r.id = m.roadbook_id
    where m.bucket = storage.objects.bucket_id
      and m.path = storage.objects.name
      and r.is_public = true
  )
);

create policy "roadbook_media_owner_read"
on storage.objects
for select
to authenticated
using (
  storage.objects.bucket_id in ('roadbook-images', 'roadbook-gpx')
  and storage.allow_any_operation(
    array[
      'object.sign',
      'object.sign_many',
      'object.get_authenticated',
      'object.get_authenticated_info',
      'object.upload',
      'object.upload_update',
      'object.delete_many'
    ]
  )
  and exists (
    select 1
    from public.media m
    join public.roadbooks r on r.id = m.roadbook_id
    where m.bucket = storage.objects.bucket_id
      and m.path = storage.objects.name
      and r.owner_id = (select auth.uid())
  )
);

create policy "roadbook_media_owner_insert"
on storage.objects
for insert
to authenticated
with check (
  storage.objects.bucket_id in ('roadbook-images', 'roadbook-gpx')
  and exists (
    select 1
    from public.media m
    join public.roadbooks r on r.id = m.roadbook_id
    where m.bucket = storage.objects.bucket_id
      and m.path = storage.objects.name
      and m.uploaded_by = (select auth.uid())
      and r.owner_id = (select auth.uid())
  )
);

create policy "roadbook_media_owner_update"
on storage.objects
for update
to authenticated
using (
  storage.objects.bucket_id in ('roadbook-images', 'roadbook-gpx')
  and exists (
    select 1
    from public.media m
    join public.roadbooks r on r.id = m.roadbook_id
    where m.bucket = storage.objects.bucket_id
      and m.path = storage.objects.name
      and r.owner_id = (select auth.uid())
  )
)
with check (
  storage.objects.bucket_id in ('roadbook-images', 'roadbook-gpx')
  and exists (
    select 1
    from public.media m
    join public.roadbooks r on r.id = m.roadbook_id
    where m.bucket = storage.objects.bucket_id
      and m.path = storage.objects.name
      and r.owner_id = (select auth.uid())
  )
);

create policy "roadbook_media_owner_delete"
on storage.objects
for delete
to authenticated
using (
  storage.objects.bucket_id in ('roadbook-images', 'roadbook-gpx')
  and exists (
    select 1
    from public.media m
    join public.roadbooks r on r.id = m.roadbook_id
    where m.bucket = storage.objects.bucket_id
      and m.path = storage.objects.name
      and r.owner_id = (select auth.uid())
  )
);

-- Rollback manuel :
-- drop policy if exists "roadbook_media_public_read" on storage.objects;
-- drop policy if exists "roadbook_media_owner_read" on storage.objects;
-- drop policy if exists "roadbook_media_owner_insert" on storage.objects;
-- drop policy if exists "roadbook_media_owner_update" on storage.objects;
-- drop policy if exists "roadbook_media_owner_delete" on storage.objects;
