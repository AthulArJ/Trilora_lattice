-- Link verification creates an OTP session (even an invitation may receive a
-- generated temporary password). A session alone cannot prove setup completed.
-- After updateUser succeeds the client signs in with the chosen password.
-- Use signed authentication-method claims, never editable user_metadata.
begin;

create or replace function public.workspace_session_ready()
returns boolean language sql stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'amr' @> '[{"method":"password"}]'::jsonb, false)
$$;
revoke all on function public.workspace_session_ready() from public, anon;
grant execute on function public.workspace_session_ready() to authenticated;

-- RESTRICTIVE policies are ANDed with existing role/ownership policies.
-- Keep those policies intact; also cover the tables accessed directly by web.
do $$
declare relation text;
begin
  foreach relation in array array[
    'profiles', 'workers', 'tags', 'anchors', 'tag_assignments', 'area_maps',
    'map_zones', 'positions', 'incidents', 'audit_log', 'shift_rosters',
    'worker_shift_assignments', 'operation_tickets'
  ] loop
    if to_regclass('public.' || relation) is not null then
      execute format('drop policy if exists "Password session required" on public.%I', relation);
      execute format('create policy "Password session required" on public.%I as restrictive for all to authenticated using ((select public.workspace_session_ready())) with check ((select public.workspace_session_ready()))', relation);
    end if;
  end loop;
end $$;

-- The private floor-plan bucket must not bypass the workspace gate.
drop policy if exists "Password session required for area maps" on storage.objects;
create policy "Password session required for area maps" on storage.objects
as restrictive for all to authenticated
using (bucket_id <> 'area-maps' or (select public.workspace_session_ready()))
with check (bucket_id <> 'area-maps' or (select public.workspace_session_ready()));

-- This SECURITY DEFINER helper is also used by publish_area_map, which bypasses
-- table RLS. Enforce the session requirement there as well as its existing role.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select public.workspace_session_ready() and exists (
  select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
) $$;

commit;
