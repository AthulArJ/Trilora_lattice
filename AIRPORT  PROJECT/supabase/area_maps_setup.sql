-- Apply once to the existing pilot project after schema.sql.
-- Map assets remain in a private bucket; signed-in users may read, admins may manage.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('area-maps', 'area-maps', false, 10485760, array['image/svg+xml','image/png','image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

grant select, insert, update on public.area_maps to authenticated;
grant all privileges on public.area_maps to service_role;
grant select on public.latest_positions to service_role;

drop policy if exists "Signed-in users read area map assets" on storage.objects;
create policy "Signed-in users read area map assets" on storage.objects
for select to authenticated using (bucket_id = 'area-maps');

drop policy if exists "Admins upload area map assets" on storage.objects;
create policy "Admins upload area map assets" on storage.objects
for insert to authenticated with check (bucket_id = 'area-maps' and public.is_admin());

drop policy if exists "Admins update area map assets" on storage.objects;
create policy "Admins update area map assets" on storage.objects
for update to authenticated using (bucket_id = 'area-maps' and public.is_admin())
with check (bucket_id = 'area-maps' and public.is_admin());

drop policy if exists "Admins delete area map assets" on storage.objects;
create policy "Admins delete area map assets" on storage.objects
for delete to authenticated using (bucket_id = 'area-maps' and public.is_admin());

create or replace function public.publish_area_map(p_map_id uuid)
returns public.area_maps
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.area_maps;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  select * into target from public.area_maps where id = p_map_id for update;
  if target.id is null then raise exception 'Map draft not found'; end if;
  if target.status <> 'draft' then raise exception 'Only draft maps can be published'; end if;
  update public.area_maps set status = 'archived' where name = target.name and status = 'published';
  update public.area_maps set status = 'published', published_at = now() where id = p_map_id returning * into target;
  return target;
end;
$$;
revoke all on function public.publish_area_map(uuid) from public, anon;
grant execute on function public.publish_area_map(uuid) to authenticated;
