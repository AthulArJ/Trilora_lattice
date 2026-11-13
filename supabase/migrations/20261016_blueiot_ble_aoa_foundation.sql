-- Blueiot BLE AoA inventory foundation. Existing Sewio records and history are retained.
alter table public.tags
  add column if not exists provider text not null default 'unknown',
  add column if not exists device_type text not null default 'badge',
  add column if not exists provider_device_id text,
  add column if not exists model text,
  add column if not exists sos_capable boolean not null default false;

alter table public.tags drop constraint if exists tags_device_type_check;
alter table public.tags add constraint tags_device_type_check check (device_type in ('badge','asset_tag','other'));
update public.tags set provider = 'sewio_uwb', device_type = 'other' where sewio_feed_id is not null and provider = 'unknown';
alter table public.tags alter column provider set default 'blueiot';
create unique index if not exists tags_provider_device_id_unique on public.tags(provider, provider_device_id) where provider_device_id is not null;

alter table public.area_maps add column if not exists external_map_reference text;
update public.area_maps set external_map_reference = sewio_plan_reference where external_map_reference is null and sewio_plan_reference is not null;

alter table public.positions alter column source set default 'blueiot_ble_aoa';

create table if not exists public.anchors (
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
create unique index if not exists anchors_provider_device_id_unique on public.anchors(provider, provider_device_id) where provider_device_id is not null;
create unique index if not exists anchors_hardware_address_unique on public.anchors(hardware_address) where hardware_address is not null;

alter table public.anchors enable row level security;
drop policy if exists "Authenticated users read anchors" on public.anchors;
create policy "Authenticated users read anchors" on public.anchors for select to authenticated using (true);
drop policy if exists "Admins manage anchors" on public.anchors;
create policy "Admins manage anchors" on public.anchors for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.anchors to authenticated;
grant all privileges on public.anchors to service_role;
