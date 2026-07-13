begin;

create table public.service_close_reports (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null unique
    references public.restaurant_services(id) on delete restrict,
  business_date date not null,
  period public.service_period not null,
  opened_at timestamptz not null,
  closed_at timestamptz not null,
  forced_close boolean not null default false,
  summary_rows jsonb not null default '[]'::jsonb
    check (jsonb_typeof(summary_rows) = 'array'),
  dine_in_count integer not null default 0 check (dine_in_count >= 0),
  takeaway_count integer not null default 0 check (takeaway_count >= 0),
  cover_count integer not null default 0 check (cover_count >= 0),
  dine_in_total numeric(12, 2) not null default 0 check (dine_in_total >= 0),
  takeaway_total numeric(12, 2) not null default 0 check (takeaway_total >= 0),
  service_total numeric(12, 2) not null default 0 check (service_total >= 0),
  print_status text not null default 'pending'
    check (print_status in ('pending', 'submitted', 'failed', 'uncertain')),
  printnode_job_id bigint check (printnode_job_id is null or printnode_job_id > 0),
  print_attempt_count integer not null default 0 check (print_attempt_count >= 0),
  auto_idempotency_key text not null unique,
  last_print_error text,
  last_printed_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (service_total = dine_in_total + takeaway_total)
);

create index service_close_reports_closed_at_idx
  on public.service_close_reports(closed_at desc);
create index service_close_reports_created_by_idx
  on public.service_close_reports(created_by);

create trigger service_close_reports_touch
before update on public.service_close_reports
for each row execute function private.touch_updated_at();

alter table public.service_close_reports enable row level security;

revoke all on table public.service_close_reports from public, anon, authenticated;
grant select, insert, update on table public.service_close_reports to service_role;

commit;
