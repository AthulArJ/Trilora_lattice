-- Starter schema for the LATTICE Blueiot BLE AoA operations pilot.
-- Apply through Supabase migrations after reviewing auth and retention settings.
create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'viewer');
create type public.incident_status as enum ('active', 'acknowledged', 'resolved');
create type public.map_status as enum ('draft', 'published', 'archived');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null default '',
  role public.app_role not null default 'viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only trusted project operators/service_role should manage this table.
-- Add administrator emails here before the user creates their account.
create table public.admin_allowlist (
  email text primary key check (email = lower(trim(email))),
  added_at timestamptz not null default now()
);
alter table public.admin_allowlist enable row level security;

create table public.workers (
  id uuid primary key default gen_random_uuid(),
  employee_code text unique,
  display_name text not null,
  team text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'blueiot',
  device_type text not null default 'badge' check (device_type in ('badge','asset_tag','other')),
  provider_device_id text,
  model text,
  sos_capable boolean not null default false,
  sewio_feed_id text unique,
  hardware_address text unique,
  label text not null,
  battery_percent smallint check (battery_percent between 0 and 100),
  last_seen_at timestamptz,
  device_state text not null default 'unknown' check (device_state in ('online','stale','offline','unknown')),
  telemetry jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index tags_provider_device_id_unique on public.tags(provider, provider_device_id) where provider_device_id is not null;

create table public.tag_assignments (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references public.workers(id),
  tag_id uuid not null references public.tags(id),
  assigned_at timestamptz not null default now(),
  unassigned_at timestamptz,
  assigned_by uuid references public.profiles(id),
  note text,
  check (unassigned_at is null or unassigned_at >= assigned_at)
);
create unique index one_current_assignment_per_tag on public.tag_assignments(tag_id) where unassigned_at is null;
create unique index one_current_tag_per_worker on public.tag_assignments(worker_id) where unassigned_at is null;

create or replace function public.assign_tag_to_worker(
  p_worker_id uuid,
  p_tag_id uuid,
  p_assigned_by uuid,
  p_note text default null
)
returns public.tag_assignments
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.tag_assignments;
begin
  if not exists (select 1 from public.workers where id = p_worker_id and active = true) then
    raise exception 'Active worker not found';
  end if;
  if not exists (select 1 from public.tags where id = p_tag_id) then
    raise exception 'Tag not found';
  end if;

  update public.tag_assignments
  set unassigned_at = now()
  where unassigned_at is null and (worker_id = p_worker_id or tag_id = p_tag_id);

  insert into public.tag_assignments (worker_id, tag_id, assigned_by, note)
  values (p_worker_id, p_tag_id, p_assigned_by, p_note)
  returning * into result;
  return result;
end;
$$;
revoke all on function public.assign_tag_to_worker(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.assign_tag_to_worker(uuid, uuid, uuid, text) to service_role;

create table public.area_maps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version integer not null,
  status public.map_status not null default 'draft',
  asset_path text,
  external_map_reference text,
  sewio_plan_reference text,
  coordinate_system jsonb not null default '{}'::jsonb,
  area_labels jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  published_at timestamptz,
  unique(name, version)
);

create table public.map_zones (
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
create index map_zones_map_type_idx on public.map_zones(map_id, zone_type);

-- Provider-neutral events received from the secured RTLS gateway.
-- These are queued canonical events; projections into positions/incidents are a later processing stage.
create table public.rtls_events (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('blueiot','sewio_uwb')),
  event_id text not null check (length(event_id) between 1 and 200),
  event_type text not null check (event_type in ('position','sos','battery','device_status')),
  provider_device_id text not null check (length(provider_device_id) between 1 and 200),
  observed_at timestamptz not null,
  received_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  processing_status text not null default 'pending' check (processing_status in ('pending','processed','failed')),
  processing_error text,
  processed_at timestamptz,
  unique(provider, event_id)
);
create index rtls_events_received_idx on public.rtls_events(received_at desc);
create index rtls_events_pending_idx on public.rtls_events(received_at) where processing_status = 'pending';

create unique index one_published_map_per_name on public.area_maps(name) where status = 'published';

create table public.anchors (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'blueiot',
  provider_device_id text,
  model text not null default 'BA3000-t',
  label text not null,
  hardware_address text,
  map_id uuid references public.area_maps(id),
  x double precision,
  y double precision,
  z double precision,
  installation_height_m double precision,
  device_state text not null default 'uncommissioned' check (device_state in ('online','stale','offline','unknown','uncommissioned')),
  last_seen_at timestamptz,
  telemetry jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index anchors_provider_device_id_unique on public.anchors(provider, provider_device_id) where provider_device_id is not null;
create unique index anchors_hardware_address_unique on public.anchors(hardware_address) where hardware_address is not null;

create table public.positions (
  id bigint generated always as identity primary key,
  tag_id uuid not null references public.tags(id),
  map_id uuid references public.area_maps(id),
  observed_at timestamptz not null,
  x double precision not null,
  y double precision not null,
  z double precision,
  confidence double precision,
  anchors_used smallint,
  source text not null default 'blueiot_ble_aoa',
  unique(tag_id, observed_at, source)
);
create index positions_tag_time_idx on public.positions(tag_id, observed_at desc);
create index positions_map_time_idx on public.positions(map_id, observed_at desc);
create or replace view public.latest_positions as
select distinct on (tag_id) tag_id, map_id, observed_at, x, y, z, confidence, anchors_used, source
from public.positions
order by tag_id, observed_at desc;
revoke all on public.latest_positions from public, anon, authenticated;
grant select on public.latest_positions to service_role;

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  incident_code text not null unique default ('INC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  tag_id uuid references public.tags(id),
  worker_id uuid references public.workers(id),
  map_id uuid references public.area_maps(id),
  position_id bigint references public.positions(id),
  status public.incident_status not null default 'active',
  triggered_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles(id),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  resolution_note text,
  source_event jsonb not null default '{}'::jsonb,
  check ((status <> 'acknowledged') or acknowledged_at is not null),
  check ((status <> 'resolved') or resolved_at is not null)
);
create index incidents_status_time_idx on public.incidents(status, triggered_at desc);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') $$;

create or replace function public.sync_allowlisted_admin_profile()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set role = 'admin', updated_at = now() where lower(email) = new.email;
    return new;
  end if;
  update public.profiles set role = 'viewer', updated_at = now() where lower(email) = old.email;
  return old;
end;
$$;
create trigger admin_allowlist_profile_sync
after insert or delete on public.admin_allowlist
for each row execute function public.sync_allowlisted_admin_profile();

create or replace function public.handle_auth_user_profile()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, role)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    case when exists (select 1 from public.admin_allowlist a where a.email = lower(new.email)) then 'admin'::public.app_role else 'viewer'::public.app_role end
  )
  on conflict (id) do update set
    email = excluded.email,
    role = excluded.role,
    updated_at = now();
  return new;
end;
$$;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_auth_user_profile();
create trigger on_auth_user_email_updated
after update of email on auth.users
for each row execute function public.handle_auth_user_profile();

-- Backfill auth accounts that existed before this schema was applied.
insert into public.profiles (id, email, display_name, role)
select
  u.id,
  lower(u.email),
  coalesce(u.raw_user_meta_data ->> 'display_name', ''),
  case when exists (select 1 from public.admin_allowlist a where a.email = lower(u.email)) then 'admin'::public.app_role else 'viewer'::public.app_role end
from auth.users u
where u.email is not null
on conflict (id) do update set
  email = excluded.email,
  role = excluded.role,
  updated_at = now();

alter table public.profiles enable row level security;
alter table public.workers enable row level security;
alter table public.tags enable row level security;
alter table public.anchors enable row level security;
alter table public.tag_assignments enable row level security;
alter table public.area_maps enable row level security;
alter table public.map_zones enable row level security;
alter table public.positions enable row level security;
alter table public.incidents enable row level security;
alter table public.audit_log enable row level security;
alter table public.rtls_events enable row level security;

create policy "Users can read own profile" on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy "Admins manage profiles" on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Authenticated users read workers" on public.workers for select to authenticated using (true);
create policy "Admins manage workers" on public.workers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Authenticated users read tags" on public.tags for select to authenticated using (true);
create policy "Admins manage tags" on public.tags for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Authenticated users read anchors" on public.anchors for select to authenticated using (true);
create policy "Admins manage anchors" on public.anchors for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Authenticated users read assignments" on public.tag_assignments for select to authenticated using (true);
create policy "Admins manage assignments" on public.tag_assignments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Authenticated users read maps" on public.area_maps for select to authenticated using (true);
create policy "Admins manage maps" on public.area_maps for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Authenticated users read map zones" on public.map_zones for select to authenticated using (true);
create policy "Admins manage map zones" on public.map_zones for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Authenticated users read positions" on public.positions for select to authenticated using (true);
create policy "Backend inserts positions" on public.positions for insert to service_role with check (true);
create policy "Authenticated users read incidents" on public.incidents for select to authenticated using (true);
create policy "Admins manage incidents" on public.incidents for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Backend inserts incidents" on public.incidents for insert to service_role with check (true);
create policy "Admins read audit log" on public.audit_log for select to authenticated using (public.is_admin());
create policy "Backend inserts audit log" on public.audit_log for insert to service_role with check (true);

-- Data API grants: RLS policies filter rows but do not grant SQL privileges.
grant usage on schema public to authenticated, service_role;
grant select on public.profiles, public.workers, public.tags, public.anchors, public.tag_assignments,
  public.area_maps, public.map_zones, public.positions, public.incidents, public.audit_log to authenticated;
grant all privileges on public.admin_allowlist, public.profiles, public.workers,
  public.tags, public.anchors, public.tag_assignments, public.area_maps, public.map_zones, public.positions,
  public.incidents, public.audit_log, public.rtls_events to service_role;
grant select on public.latest_positions to service_role;
grant usage, select on all sequences in schema public to service_role;

create or replace function public.process_rtls_event(p_event_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.rtls_events;
  v_tag_id uuid;
  v_worker_id uuid;
  v_map_id uuid;
  v_position_id bigint;
  v_x double precision;
  v_y double precision;
  v_z double precision;
  v_confidence double precision;
  v_anchors_used smallint;
  v_battery smallint;
  v_x_min double precision;
  v_x_max double precision;
  v_y_min double precision;
  v_y_max double precision;
  v_bounds jsonb;
  v_source text;
  v_error text;
  v_map_matches integer;
begin
  select * into v_event from public.rtls_events where id = p_event_id for update;
  if not found then return jsonb_build_object('status', 'not_found', 'event_id', p_event_id); end if;
  if v_event.processing_status = 'processed' then return jsonb_build_object('status', 'duplicate', 'event_id', p_event_id); end if;
  if v_event.processing_status = 'failed' then return jsonb_build_object('status', 'failed', 'event_id', p_event_id, 'error', v_event.processing_error); end if;

  select id into v_tag_id from public.tags
    where provider = v_event.provider and provider_device_id = v_event.provider_device_id;
  if v_tag_id is null then
    update public.rtls_events set processing_status = 'failed', processing_error = 'No registered tag matches this provider and device_id', processed_at = now() where id = p_event_id;
    return jsonb_build_object('status', 'failed', 'event_id', p_event_id, 'error', 'device_not_registered');
  end if;
  v_source := case v_event.provider when 'blueiot' then 'blueiot_ble_aoa' else 'sewio_uwb' end;
  v_battery := case when v_event.payload ? 'battery_percent' then (v_event.payload->>'battery_percent')::smallint else null end;

  if v_event.event_type = 'position' then
    if v_event.payload->>'map_reference' is null or length(trim(v_event.payload->>'map_reference')) = 0 then
      update public.rtls_events set processing_status = 'failed', processing_error = 'Position event has no map_reference', processed_at = now() where id = p_event_id;
      return jsonb_build_object('status', 'failed', 'event_id', p_event_id, 'error', 'map_reference_required');
    end if;
    select count(*) into v_map_matches from public.area_maps
      where external_map_reference = v_event.payload->>'map_reference' and status = 'published';
    if v_map_matches = 0 then
      update public.rtls_events set processing_status = 'failed', processing_error = 'No published map matches map_reference', processed_at = now() where id = p_event_id;
      return jsonb_build_object('status', 'failed', 'event_id', p_event_id, 'error', 'published_map_not_found');
    end if;
    if v_map_matches > 1 then
      update public.rtls_events set processing_status = 'failed', processing_error = 'map_reference matches more than one published map', processed_at = now() where id = p_event_id;
      return jsonb_build_object('status', 'failed', 'event_id', p_event_id, 'error', 'ambiguous_published_map');
    end if;
    select id, coordinate_system into v_map_id, v_bounds from public.area_maps
      where external_map_reference = v_event.payload->>'map_reference' and status = 'published';
    v_x := (v_event.payload->>'x')::double precision;
    v_y := (v_event.payload->>'y')::double precision;
    v_z := case when v_event.payload ? 'z' then (v_event.payload->>'z')::double precision else null end;
    v_confidence := case when v_event.payload ? 'confidence' then (v_event.payload->>'confidence')::double precision else null end;
    v_anchors_used := case when v_event.payload ? 'anchors_used' then (v_event.payload->>'anchors_used')::smallint else null end;
    if v_bounds->>'units' is distinct from 'm' then
      update public.rtls_events set processing_status = 'failed', processing_error = 'Published map coordinate units are not metres', processed_at = now() where id = p_event_id;
      return jsonb_build_object('status', 'failed', 'event_id', p_event_id, 'error', 'map_units_not_metres');
    end if;
    v_x_min := (v_bounds->>'xMin')::double precision; v_x_max := (v_bounds->>'xMax')::double precision;
    v_y_min := (v_bounds->>'yMin')::double precision; v_y_max := (v_bounds->>'yMax')::double precision;
    if v_x_min is null or v_x_max is null or v_y_min is null or v_y_max is null or v_x_max <= v_x_min or v_y_max <= v_y_min
      or v_x < v_x_min or v_x > v_x_max or v_y < v_y_min or v_y > v_y_max then
      update public.rtls_events set processing_status = 'failed', processing_error = 'Coordinates are invalid or outside the published map bounds', processed_at = now() where id = p_event_id;
      return jsonb_build_object('status', 'failed', 'event_id', p_event_id, 'error', 'coordinates_outside_map');
    end if;
    insert into public.positions(tag_id, map_id, observed_at, x, y, z, confidence, anchors_used, source)
      values (v_tag_id, v_map_id, v_event.observed_at, v_x, v_y, v_z, v_confidence, v_anchors_used, v_source)
      on conflict (tag_id, observed_at, source) do nothing returning id into v_position_id;
    if v_position_id is null then
      select id into v_position_id from public.positions where tag_id = v_tag_id and observed_at = v_event.observed_at and source = v_source;
    end if;
    update public.tags set last_seen_at = v_event.observed_at, device_state = 'online',
      battery_percent = coalesce(v_battery, battery_percent),
      telemetry = telemetry || jsonb_build_object('last_event_type', 'position', 'last_provider', v_event.provider), updated_at = now()
      where id = v_tag_id and (last_seen_at is null or last_seen_at <= v_event.observed_at);
  elsif v_event.event_type = 'sos' then
    select ta.worker_id into v_worker_id from public.tag_assignments ta
      where ta.tag_id = v_tag_id and ta.assigned_at <= v_event.observed_at and (ta.unassigned_at is null or ta.unassigned_at > v_event.observed_at)
      order by ta.assigned_at desc limit 1;
    select p.id, p.map_id into v_position_id, v_map_id from public.positions p
      where p.tag_id = v_tag_id and p.observed_at <= v_event.observed_at order by p.observed_at desc limit 1;
    insert into public.incidents(tag_id, worker_id, map_id, position_id, triggered_at, source_event)
      values (v_tag_id, v_worker_id, v_map_id, v_position_id, v_event.observed_at,
        jsonb_build_object('provider', v_event.provider, 'event_id', v_event.event_id, 'event_type', 'sos', 'ingest', 'rtls_gateway'));
    update public.tags set last_seen_at = greatest(coalesce(last_seen_at, v_event.observed_at), v_event.observed_at),
      device_state = 'online', battery_percent = coalesce(v_battery, battery_percent), updated_at = now()
      where id = v_tag_id;
  elsif v_event.event_type = 'battery' then
    update public.tags set battery_percent = v_battery, last_seen_at = greatest(coalesce(last_seen_at, v_event.observed_at), v_event.observed_at),
      device_state = case when device_state in ('unknown','offline') then 'online' else device_state end,
      telemetry = telemetry || jsonb_build_object('last_event_type', 'battery', 'last_provider', v_event.provider), updated_at = now()
      where id = v_tag_id;
  elsif v_event.event_type = 'device_status' then
    update public.tags set device_state = v_event.payload->>'device_state',
      battery_percent = coalesce(v_battery, battery_percent),
      last_seen_at = greatest(coalesce(last_seen_at, v_event.observed_at), v_event.observed_at),
      telemetry = telemetry || jsonb_build_object('last_event_type', 'device_status', 'last_provider', v_event.provider), updated_at = now()
      where id = v_tag_id;
  end if;

  update public.rtls_events set processing_status = 'processed', processing_error = null, processed_at = now() where id = p_event_id;
  return jsonb_build_object('status', 'processed', 'event_id', p_event_id, 'event_type', v_event.event_type, 'tag_id', v_tag_id, 'map_id', v_map_id, 'position_id', v_position_id);
exception when others then
  get stacked diagnostics v_error = message_text;
  update public.rtls_events set processing_status = 'failed', processing_error = left(v_error, 500), processed_at = now() where id = p_event_id;
  return jsonb_build_object('status', 'failed', 'event_id', p_event_id, 'error', left(v_error, 500));
end;
$$;

create or replace function public.process_pending_rtls_events(p_limit integer default 25)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  for v_id in
    select id from public.rtls_events where processing_status = 'pending'
    order by received_at, id limit greatest(1, least(coalesce(p_limit, 25), 100)) for update skip locked
  loop
    v_result := public.process_rtls_event(v_id);
    v_results := v_results || jsonb_build_array(v_result);
  end loop;
  return jsonb_build_object('count', jsonb_array_length(v_results), 'events', v_results);
end;
$$;

revoke all on function public.process_rtls_event(bigint) from public, anon, authenticated;
revoke all on function public.process_pending_rtls_events(integer) from public, anon, authenticated;
grant execute on function public.process_rtls_event(bigint) to service_role;
grant execute on function public.process_pending_rtls_events(integer) to service_role;
