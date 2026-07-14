begin;

alter table public.service_close_reports
  drop constraint if exists service_close_reports_print_status_check;

alter table public.service_close_reports
  add constraint service_close_reports_print_status_check
  check (print_status in ('pending', 'submitted', 'failed', 'uncertain', 'skipped'));

commit;
