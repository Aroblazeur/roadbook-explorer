-- Collaborative roadbooks, creator attribution and admin access.

create schema if not exists private;

grant usage on schema private to authenticated, service_role;

create or replace function private.is_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt() -> 'app_metadata' ->> 'role'), '') = 'admin';
$$;

revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated, service_role;

alter table public.roadbooks
  add column if not exists creator_email text;

create table if not exists public.roadbook_contributors (
  roadbook_id bigint not null references public.roadbooks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  added_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (roadbook_id, user_id)
);

create unique index if not exists roadbook_contributors_roadbook_email_idx
  on public.roadbook_contributors (roadbook_id, lower(email));
create index if not exists roadbook_contributors_user_idx
  on public.roadbook_contributors (user_id, roadbook_id);

alter table public.roadbook_contributors enable row level security;

create or replace function private.is_roadbook_owner_or_admin(target_roadbook_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin()
    or exists (
      select 1
      from public.roadbooks r
      where r.id = target_roadbook_id
        and r.owner_id = (select auth.uid())
    );
$$;

create or replace function private.is_roadbook_editor(target_roadbook_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin()
    or exists (
      select 1
      from public.roadbooks r
      where r.id = target_roadbook_id
        and r.owner_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.roadbook_contributors c
      where c.roadbook_id = target_roadbook_id
        and c.user_id = (select auth.uid())
    );
$$;

create or replace function private.is_stage_editor(target_stage_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.stages s
    where s.id = target_stage_id
      and private.is_roadbook_editor(s.roadbook_id)
  );
$$;

revoke all on function private.is_roadbook_owner_or_admin(bigint) from public;
revoke all on function private.is_roadbook_editor(bigint) from public;
revoke all on function private.is_stage_editor(bigint) from public;
grant execute on function private.is_roadbook_owner_or_admin(bigint) to authenticated, service_role;
grant execute on function private.is_roadbook_editor(bigint) to authenticated, service_role;
grant execute on function private.is_stage_editor(bigint) to authenticated, service_role;

update public.roadbooks r
set creator_email = lower(u.email)
from auth.users u
where u.id = r.owner_id
  and r.creator_email is null;

alter table public.roadbooks
  alter column creator_email set not null;

create or replace function private.protect_roadbook_authorship()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_email text;
begin
  if tg_op = 'INSERT' then
    select lower(u.email) into owner_email
    from auth.users u
    where u.id = new.owner_id;
    if owner_email is null then
      raise exception 'Roadbook creator must be an authenticated email user.';
    end if;
    new.creator_email := owner_email;
    return new;
  end if;

  if new.owner_id is distinct from old.owner_id then
    raise exception 'The roadbook creator cannot be changed.';
  end if;
  new.creator_email := old.creator_email;

  if new.is_public is distinct from old.is_public
     and not private.is_roadbook_owner_or_admin(old.id) then
    raise exception 'Only the creator can change roadbook visibility.';
  end if;

  return new;
end;
$$;

revoke all on function private.protect_roadbook_authorship() from public;

drop trigger if exists protect_roadbook_authorship on public.roadbooks;
create trigger protect_roadbook_authorship
  before insert or update on public.roadbooks
  for each row execute function private.protect_roadbook_authorship();

drop policy if exists "Roadbook contributors can view memberships" on public.roadbook_contributors;
create policy "Roadbook contributors can view memberships"
  on public.roadbook_contributors for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_roadbook_owner_or_admin(roadbook_id)
  );

create or replace function public.add_roadbook_contributor(
  target_roadbook_id bigint,
  contributor_email text
)
returns public.roadbook_contributors
language plpgsql
security definer
set search_path = ''
as $$
declare
  contributor auth.users%rowtype;
  owner_id uuid;
  membership public.roadbook_contributors%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required.';
  end if;
  if not private.is_roadbook_owner_or_admin(target_roadbook_id) then
    raise exception 'Only the roadbook creator can add contributors.';
  end if;

  select r.owner_id into owner_id
  from public.roadbooks r
  where r.id = target_roadbook_id;

  select u.* into contributor
  from auth.users u
  where lower(u.email) = lower(trim(contributor_email))
    and u.email_confirmed_at is not null
  limit 1;

  if contributor.id is null then
    raise exception 'No confirmed account matches this email address.';
  end if;
  if contributor.id = owner_id then
    raise exception 'The creator is already an author of this roadbook.';
  end if;

  insert into public.roadbook_contributors (roadbook_id, user_id, email, added_by)
  values (target_roadbook_id, contributor.id, lower(contributor.email), (select auth.uid()))
  on conflict (roadbook_id, user_id) do update
    set email = excluded.email
  returning * into membership;

  return membership;
end;
$$;

create or replace function public.remove_roadbook_contributor(
  target_roadbook_id bigint,
  contributor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_roadbook_owner_or_admin(target_roadbook_id) then
    raise exception 'Only the roadbook creator can remove contributors.';
  end if;

  delete from public.roadbook_contributors
  where roadbook_id = target_roadbook_id
    and user_id = contributor_user_id;
end;
$$;

revoke all on function public.add_roadbook_contributor(bigint, text) from public;
revoke all on function public.remove_roadbook_contributor(bigint, uuid) from public;
grant execute on function public.add_roadbook_contributor(bigint, text) to authenticated;
grant execute on function public.remove_roadbook_contributor(bigint, uuid) to authenticated;

drop policy if exists "Editors can read shared roadbooks" on public.roadbooks;
create policy "Editors can read shared roadbooks"
  on public.roadbooks for select to authenticated
  using (private.is_roadbook_editor(id));

drop policy if exists "Editors can update shared roadbooks" on public.roadbooks;
create policy "Editors can update shared roadbooks"
  on public.roadbooks for update to authenticated
  using (private.is_roadbook_editor(id))
  with check (private.is_roadbook_editor(id));

drop policy if exists "Creator or admin can delete roadbooks" on public.roadbooks;
create policy "Creator or admin can delete roadbooks"
  on public.roadbooks for delete to authenticated
  using (private.is_roadbook_owner_or_admin(id));

drop policy if exists "Editors can read stages" on public.stages;
create policy "Editors can read stages"
  on public.stages for select to authenticated
  using (private.is_roadbook_editor(roadbook_id));
drop policy if exists "Editors can insert stages" on public.stages;
create policy "Editors can insert stages"
  on public.stages for insert to authenticated
  with check (private.is_roadbook_editor(roadbook_id));
drop policy if exists "Editors can update stages" on public.stages;
create policy "Editors can update stages"
  on public.stages for update to authenticated
  using (private.is_roadbook_editor(roadbook_id))
  with check (private.is_roadbook_editor(roadbook_id));
drop policy if exists "Editors can delete stages" on public.stages;
create policy "Editors can delete stages"
  on public.stages for delete to authenticated
  using (private.is_roadbook_editor(roadbook_id));

drop policy if exists "Editors can read pois" on public.stage_pois;
create policy "Editors can read pois"
  on public.stage_pois for select to authenticated
  using (private.is_stage_editor(stage_id));
drop policy if exists "Editors can insert pois" on public.stage_pois;
create policy "Editors can insert pois"
  on public.stage_pois for insert to authenticated
  with check (private.is_stage_editor(stage_id));
drop policy if exists "Editors can update pois" on public.stage_pois;
create policy "Editors can update pois"
  on public.stage_pois for update to authenticated
  using (private.is_stage_editor(stage_id))
  with check (private.is_stage_editor(stage_id));
drop policy if exists "Editors can delete pois" on public.stage_pois;
create policy "Editors can delete pois"
  on public.stage_pois for delete to authenticated
  using (private.is_stage_editor(stage_id));

drop policy if exists "Editors can read variants" on public.stage_variants;
create policy "Editors can read variants"
  on public.stage_variants for select to authenticated
  using (private.is_stage_editor(stage_id));
drop policy if exists "Editors can insert variants" on public.stage_variants;
create policy "Editors can insert variants"
  on public.stage_variants for insert to authenticated
  with check (private.is_stage_editor(stage_id));
drop policy if exists "Editors can update variants" on public.stage_variants;
create policy "Editors can update variants"
  on public.stage_variants for update to authenticated
  using (private.is_stage_editor(stage_id))
  with check (private.is_stage_editor(stage_id));
drop policy if exists "Editors can delete variants" on public.stage_variants;
create policy "Editors can delete variants"
  on public.stage_variants for delete to authenticated
  using (private.is_stage_editor(stage_id));

drop policy if exists "Owner can insert media on own roadbooks" on public.media;
drop policy if exists "Owner can update media of own roadbooks" on public.media;
drop policy if exists "Owner can delete media of own roadbooks" on public.media;
drop policy if exists "Editors can read media" on public.media;
drop policy if exists "Editors can insert media" on public.media;
drop policy if exists "Editors can update media" on public.media;
drop policy if exists "Editors can delete media" on public.media;

create policy "Editors can read media"
  on public.media for select to authenticated
  using (private.is_roadbook_editor(roadbook_id));
create policy "Editors can insert media"
  on public.media for insert to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and private.is_roadbook_editor(roadbook_id)
  );
create policy "Editors can update media"
  on public.media for update to authenticated
  using (private.is_roadbook_editor(roadbook_id))
  with check (private.is_roadbook_editor(roadbook_id));
create policy "Editors can delete media"
  on public.media for delete to authenticated
  using (private.is_roadbook_editor(roadbook_id));

drop policy if exists "roadbook_media_owner_read" on storage.objects;
drop policy if exists "roadbook_media_owner_insert" on storage.objects;
drop policy if exists "roadbook_media_owner_update" on storage.objects;
drop policy if exists "roadbook_media_owner_delete" on storage.objects;

create policy "roadbook_media_owner_read"
on storage.objects for select to authenticated
using (
  bucket_id in ('roadbook-images', 'roadbook-gpx')
  and storage.allow_any_operation(array[
    'object.sign', 'object.sign_many', 'object.get_authenticated',
    'object.get_authenticated_info', 'object.upload',
    'object.upload_update', 'object.delete_many'
  ])
  and exists (
    select 1 from public.media m
    where m.bucket = storage.objects.bucket_id
      and m.path = storage.objects.name
      and private.is_roadbook_editor(m.roadbook_id)
  )
);

create policy "roadbook_media_owner_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id in ('roadbook-images', 'roadbook-gpx')
  and exists (
    select 1 from public.media m
    where m.bucket = storage.objects.bucket_id
      and m.path = storage.objects.name
      and m.uploaded_by = (select auth.uid())
      and private.is_roadbook_editor(m.roadbook_id)
  )
);

create policy "roadbook_media_owner_update"
on storage.objects for update to authenticated
using (
  bucket_id in ('roadbook-images', 'roadbook-gpx')
  and exists (
    select 1 from public.media m
    where m.bucket = storage.objects.bucket_id
      and m.path = storage.objects.name
      and private.is_roadbook_editor(m.roadbook_id)
  )
)
with check (
  bucket_id in ('roadbook-images', 'roadbook-gpx')
  and exists (
    select 1 from public.media m
    where m.bucket = storage.objects.bucket_id
      and m.path = storage.objects.name
      and private.is_roadbook_editor(m.roadbook_id)
  )
);

create policy "roadbook_media_owner_delete"
on storage.objects for delete to authenticated
using (
  bucket_id in ('roadbook-images', 'roadbook-gpx')
  and exists (
    select 1 from public.media m
    where m.bucket = storage.objects.bucket_id
      and m.path = storage.objects.name
      and private.is_roadbook_editor(m.roadbook_id)
  )
);
