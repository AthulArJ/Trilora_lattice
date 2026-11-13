-- Canonical, provider-neutral telemetry queue. This does not create live positions
-- or incidents; event projection is intentionally a later processing stage.
create table if not exists public.rtls_events (
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

create index if not exists rtls_events_received_idx on public.rtls_events(received_at desc);
create index if not exists rtls_events_pending_idx on public.rtls_events(received_at) where processing_status = 'pending';
alter table public.rtls_events enable row level security;
revoke all on public.rtls_events from public, anon, authenticated;
grant all privileges on public.rtls_events to service_role;
grant usage, select on sequence public.rtls_events_id_seq to service_role;
