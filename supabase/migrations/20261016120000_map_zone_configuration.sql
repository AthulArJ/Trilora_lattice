-- Persistent workspace zone configuration. This does not enable telemetry processing.
create table if not exists public.map_zones (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.area_maps(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  zone_type text not null default 'operational' check (zone_type in ('operational','restricted','safety','staff_only')),
  x_min_m double precision not null,
  y_min_m double precision not null,
  x_max_m double precision not null,
  y_max_m double precision not null,
  alert_on_entry boolean not null default false,
  alert_on_exit boolean not null default false,
  occupancy_limit integer check (occupancy_limit is null or occupancy_limit > 0),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (x_max_m > x_min_m and y_max_m > y_min_m),
  unique(map_id, name)
);

create index if not exists map_zones_map_type_idx on public.map_zones(map_id, zone_type);
alter table public.map_zones enable row level security;

drop policy if exists "Authenticated users read map zones" on public.map_zones;
create policy "Authenticated users read map zones" on public.map_zones
  for select to authenticated using (true);
drop policy if exists "Admins manage map zones" on public.map_zones;
create policy "Admins manage map zones" on public.map_zones
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.map_zones to authenticated;
grant all privileges on public.map_zones to service_role;
