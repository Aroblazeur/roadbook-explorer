-- Membership changes must go through the owner-checked RPC functions.

revoke all on table public.roadbook_contributors from anon;
revoke insert, update, delete, truncate, references, trigger
  on table public.roadbook_contributors from authenticated;
grant select on table public.roadbook_contributors to authenticated;
grant all on table public.roadbook_contributors to service_role;
