-- Every author can see the complete author list for a roadbook they edit.

drop policy if exists "Roadbook contributors can view memberships"
  on public.roadbook_contributors;

create policy "Roadbook contributors can view memberships"
  on public.roadbook_contributors for select
  to authenticated
  using (private.is_roadbook_editor(roadbook_id));
