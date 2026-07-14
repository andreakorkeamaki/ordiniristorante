alter table public.restaurant_settings
  add column sort_active_tables_first boolean not null default true;
