begin;

-- Locking the open service is necessary to serialize table creation with
-- close_service(), but authenticated waiters are intentionally not allowed to
-- update restaurant_services. Keep the row lock behind a narrow private
-- SECURITY DEFINER helper and retain all order writes in the invoker RPC, where
-- the normal orders RLS policies still apply.
create or replace function private.lock_current_service_for_order()
returns public.restaurant_services
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.restaurant_services;
begin
  if not private.is_active_staff() then
    raise exception 'Utente non autorizzato';
  end if;

  select * into result
  from public.restaurant_services
  where closed_at is null
  limit 1
  for update;

  return result;
end;
$$;

revoke all on function private.lock_current_service_for_order()
from public, anon, authenticated;
grant execute on function private.lock_current_service_for_order()
to authenticated;

create or replace function public.get_or_create_active_order(p_table_id uuid)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.orders;
  current_service public.restaurant_services;
begin
  if not private.is_active_staff() then
    raise exception 'Utente non autorizzato';
  end if;

  select * into current_service
  from private.lock_current_service_for_order();

  if current_service.id is null then
    raise exception 'Nessun servizio aperto. Chiedi alla cassa di iniziare il servizio';
  end if;
  if current_service.period = 'recupero'
    or current_service.business_date <> (now() at time zone 'Europe/Rome')::date
  then
    raise exception 'Il servizio precedente deve essere chiuso dalla cassa';
  end if;
  if not exists (
    select 1 from public.restaurant_tables where id = p_table_id and active
  ) then
    raise exception 'Tavolo non disponibile';
  end if;

  select * into result
  from public.orders
  where table_id = p_table_id
    and status in ('draft', 'pending_cashier', 'confirmed', 'in_preparation', 'bill_requested')
  limit 1;

  if result.id is not null and result.service_id is distinct from current_service.id then
    raise exception 'Il tavolo appartiene a un servizio precedente ancora aperto';
  end if;

  if result.id is null then
    begin
      insert into public.orders(table_id, service_id, cover_price_snapshot)
      values (p_table_id, current_service.id, 0)
      returning * into result;

      perform private.log_order_activity(
        result.id,
        'order_created',
        jsonb_build_object('service_id', current_service.id)
      );
    exception when unique_violation then
      select * into result
      from public.orders
      where table_id = p_table_id
        and service_id = current_service.id
        and status in ('draft', 'pending_cashier', 'confirmed', 'in_preparation', 'bill_requested')
      limit 1;
    end;
  end if;

  return result;
end;
$$;

revoke all on function public.get_or_create_active_order(uuid)
from public, anon, authenticated;
grant execute on function public.get_or_create_active_order(uuid)
to authenticated;

commit;
