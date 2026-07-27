-- Keep the audit tables reachable through the default Data API schema while
-- preserving server-only access. RLS stays enabled and browser roles retain
-- no table privileges.
alter table private.menu_translation_runs set schema public;
alter table private.menu_translation_changes set schema public;

alter table public.menu_translation_runs enable row level security;
alter table public.menu_translation_changes enable row level security;

revoke all on table public.menu_translation_runs
from public, anon, authenticated;
revoke all on table public.menu_translation_changes
from public, anon, authenticated;

grant select, insert, update on table public.menu_translation_runs
to service_role;
grant select, insert on table public.menu_translation_changes
to service_role;
grant usage, select on sequence public.menu_translation_changes_id_seq
to service_role;
