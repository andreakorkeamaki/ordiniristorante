create table private.menu_translation_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  found_fields integer not null default 0 check (found_fields >= 0),
  updated_fields integer not null default 0 check (updated_fields >= 0),
  skipped_fields integer not null default 0 check (skipped_fields >= 0),
  remaining_fields integer not null default 0 check (remaining_fields >= 0),
  translated_categories integer not null default 0
    check (translated_categories >= 0),
  translated_items integer not null default 0 check (translated_items >= 0),
  translated_extras integer not null default 0 check (translated_extras >= 0),
  translated_settings integer not null default 0
    check (translated_settings >= 0),
  field_counts jsonb not null default '{}'::jsonb
    check (jsonb_typeof(field_counts) = 'object'),
  model text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  total_tokens integer check (total_tokens is null or total_tokens >= 0),
  error_message text
);

create table private.menu_translation_changes (
  id bigint generated always as identity primary key,
  run_id uuid not null references private.menu_translation_runs(id)
    on delete cascade,
  entity text not null check (entity in ('category', 'item', 'extra', 'settings')),
  source_table text not null check (
    source_table in (
      'menu_categories',
      'menu_items',
      'menu_extras',
      'restaurant_settings'
    )
  ),
  record_id uuid not null,
  source_field text not null,
  target_field text not null check (
    target_field in (
      'name_en',
      'description_en',
      'ingredients_en',
      'allergen_notice_en'
    )
  ),
  italian_text text not null,
  english_text text not null,
  created_at timestamptz not null default now()
);

create index menu_translation_runs_started_at_idx
on private.menu_translation_runs(started_at desc);

create index menu_translation_changes_run_id_idx
on private.menu_translation_changes(run_id, id);

alter table private.menu_translation_runs enable row level security;
alter table private.menu_translation_changes enable row level security;

grant usage on schema private to service_role;
revoke all on table private.menu_translation_runs from public, anon, authenticated;
revoke all on table private.menu_translation_changes from public, anon, authenticated;
grant select, insert, update on table private.menu_translation_runs to service_role;
grant select, insert on table private.menu_translation_changes to service_role;
grant usage, select on sequence private.menu_translation_changes_id_seq
to service_role;
