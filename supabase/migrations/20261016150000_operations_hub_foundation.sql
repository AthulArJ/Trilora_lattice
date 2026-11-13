-- Structured workforce, shift coverage, and operational issue tracking for the CIAL Operations Hub.
-- Historical workers remain visible as unclassified until an administrator categorizes them.
alter table public.workers
  add column if not exists workforce_category text not null default 'unclassified',
  add column if not exists employer_name text;

alter table public.workers drop constraint if exists workers_workforce_category_check;
alter table public.workers add constraint workers_workforce_category_check
  check (workforce_category in ('airport_staff','contractor','airline_crew','security','ground_handling','facilities','airport_official','emergency_response','other','unclassified'));
create index if not exists workers_workforce_category_active_idx on public.workers(workforce_category) where active = true;

create table if not exists public.shift_rosters (
  id uuid primary key default gen_random_uuid(),
  shift_date date not null,
  shift_name text not null check (length(trim(shift_name)) between 1 and 80),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'published' check (status in ('draft','published','closed')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique(shift_date, shift_name)
);
create index if not exists shift_rosters_date_idx on public.shift_rosters(shift_date, starts_at);

create table if not exists public.worker_shift_assignments (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shift_rosters(id) on delete cascade,
  worker_id uuid not null references public.workers(id) on delete cascade,
  status text not null default 'scheduled' check (status in ('scheduled','present','absent','leave','completed')),
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  unique(shift_id, worker_id),
  check (checked_out_at is null or checked_in_at is not null)
);
create index if not exists worker_shift_assignments_worker_idx on public.worker_shift_assignments(worker_id, shift_id);

create table if not exists public.operation_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_code text not null unique default ('OPS-' || to_char(now() at time zone 'UTC','YYMMDD') || '-' || upper(substr(gen_random_uuid()::text,1,6))),
  title text not null check (length(trim(title)) between 3 and 160),
  description text not null check (length(trim(description)) between 3 and 3000),
  category text not null check (category in ('safety','facilities','equipment','security','service','other')),
  priority text not null default 'normal' check (priority in ('low','normal','high','critical')),
  status text not null default 'open' check (status in ('open','in_progress','blocked','resolved','closed')),
  location_label text,
  map_id uuid references public.area_maps(id),
  zone_id uuid references public.map_zones(id) on delete set null,
  assigned_team text,
  assigned_to uuid references public.profiles(id),
  raised_by uuid references public.profiles(id),
  due_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists operation_tickets_status_priority_idx on public.operation_tickets(status, priority, created_at desc);
create index if not exists operation_tickets_created_idx on public.operation_tickets(created_at desc);

alter table public.shift_rosters enable row level security;
alter table public.worker_shift_assignments enable row level security;
alter table public.operation_tickets enable row level security;

drop policy if exists "Authenticated users read shift rosters" on public.shift_rosters;
create policy "Authenticated users read shift rosters" on public.shift_rosters for select to authenticated using (true);
drop policy if exists "Admins manage shift rosters" on public.shift_rosters;
create policy "Admins manage shift rosters" on public.shift_rosters for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Authenticated users read shift assignments" on public.worker_shift_assignments;
create policy "Authenticated users read shift assignments" on public.worker_shift_assignments for select to authenticated using (true);
drop policy if exists "Admins manage shift assignments" on public.worker_shift_assignments;
create policy "Admins manage shift assignments" on public.worker_shift_assignments for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "Authenticated users read operation tickets" on public.operation_tickets;
create policy "Authenticated users read operation tickets" on public.operation_tickets for select to authenticated using (true);
drop policy if exists "Authenticated users raise operation tickets" on public.operation_tickets;
create policy "Authenticated users raise operation tickets" on public.operation_tickets for insert to authenticated with check (raised_by = auth.uid());
drop policy if exists "Admins manage operation tickets" on public.operation_tickets;
create policy "Admins manage operation tickets" on public.operation_tickets for update to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.shift_rosters, public.worker_shift_assignments, public.operation_tickets to authenticated;
grant insert on public.operation_tickets to authenticated;
grant update on public.operation_tickets to authenticated;
grant all privileges on public.shift_rosters, public.worker_shift_assignments, public.operation_tickets to service_role;
