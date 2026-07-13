-- The production hardening migration was applied before these grants were
-- appended to its checked-in file. Keep the repair in a new migration so an
-- already-migrated database receives the permissions required by the
-- server-only print RPCs.
grant usage on schema private to service_role;
grant select on public.orders, public.restaurant_services to service_role;
grant select, update on public.print_jobs to service_role;
grant execute on function private.log_order_activity(uuid, text, jsonb)
to service_role;
