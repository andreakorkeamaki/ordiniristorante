begin;

create type public.service_period as enum ('pranzo', 'cena', 'recupero');

create table public.restaurant_services (
  id uuid primary key default gen_random_uuid(),
  business_date date not null default ((now() at time zone 'Europe/Rome')::date),
  period public.service_period not null,
  opened_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  closed_by uuid references public.profiles(id) on delete restrict,
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restaurant_services_closed_after_opened_check
    check (closed_at is null or closed_at >= opened_at),
  constraint restaurant_services_closed_by_check
    check ((closed_at is null) = (closed_by is null))
);

create unique index restaurant_services_one_open_idx
  on public.restaurant_services ((true))
  where closed_at is null;

create index restaurant_services_history_idx
  on public.restaurant_services (business_date desc, opened_at desc);

create trigger restaurant_services_touch
before update on public.restaurant_services
for each row execute function private.touch_updated_at();

alter table public.orders
  add column service_id uuid references public.restaurant_services(id) on delete restrict;

create index orders_service_status_idx
  on public.orders (service_id, status, created_at);

-- This is a structural backfill, so it must not run the normal order-edit
-- trigger. Migrations do not have an authenticated user and prepare_order()
-- would otherwise replace updated_by with null.
alter table public.orders disable trigger orders_prepare;

do $$
declare
  legacy_service_id uuid;
  legacy_date date;
  legacy_opener uuid;
begin
  select
    min(created_at at time zone 'Europe/Rome')::date,
    (array_agg(created_by order by created_at))[1]
  into legacy_date, legacy_opener
  from public.orders
  where status in (
    'draft',
    'pending_cashier',
    'confirmed',
    'in_preparation',
    'bill_requested'
  );

  if legacy_opener is not null then
    insert into public.restaurant_services (
      business_date,
      period,
      opened_by,
      opened_at
    )
    values (
      legacy_date,
      'recupero',
      legacy_opener,
      coalesce(
        (
          select min(created_at)
          from public.orders
          where status in (
            'draft',
            'pending_cashier',
            'confirmed',
            'in_preparation',
            'bill_requested'
          )
        ),
        now()
      )
    )
    returning id into legacy_service_id;

    update public.orders
    set service_id = legacy_service_id
    where status in (
      'draft',
      'pending_cashier',
      'confirmed',
      'in_preparation',
      'bill_requested'
    );
  end if;
end;
$$;

alter table public.orders enable trigger orders_prepare;

alter table public.restaurant_services enable row level security;

create policy restaurant_services_staff_select
on public.restaurant_services
for select
to authenticated
using (private.is_active_staff());

create policy restaurant_services_cashier_insert
on public.restaurant_services
for insert
to authenticated
with check (
  private.current_role() in ('cashier', 'admin')
  and opened_by = (select auth.uid())
  and closed_at is null
  and closed_by is null
);

create policy restaurant_services_cashier_update
on public.restaurant_services
for update
to authenticated
using (private.current_role() in ('cashier', 'admin'))
with check (private.current_role() in ('cashier', 'admin'));

grant select on public.restaurant_services to authenticated;
grant insert (
  business_date,
  period,
  opened_by,
  opened_at
) on public.restaurant_services to authenticated;
grant update (
  closed_by,
  closed_at,
  updated_at
) on public.restaurant_services to authenticated;

create or replace function public.get_current_service()
returns public.restaurant_services
language sql
stable
security invoker
set search_path = ''
as $$
  select service
  from public.restaurant_services as service
  where service.closed_at is null
  limit 1;
$$;

create or replace function public.start_service(
  p_period public.service_period
)
returns public.restaurant_services
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.restaurant_services;
begin
  if private.current_role() not in ('cashier', 'admin') then
    raise exception 'Solo cassa o amministratore possono iniziare un servizio';
  end if;

  if p_period = 'recupero' then
    raise exception 'Il servizio di recupero è riservato alle comande precedenti';
  end if;

  insert into public.restaurant_services (
    business_date,
    period,
    opened_by
  )
  values (
    (now() at time zone 'Europe/Rome')::date,
    p_period,
    (select auth.uid())
  )
  returning * into result;

  return result;
exception
  when unique_violation then
    raise exception 'Esiste già un servizio aperto';
end;
$$;

create or replace function public.close_service(
  p_service_id uuid,
  p_force boolean default false
)
returns public.restaurant_services
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_service public.restaurant_services;
  open_orders integer;
  result public.restaurant_services;
  active_order record;
begin
  if private.current_role() not in ('cashier', 'admin') then
    raise exception 'Solo cassa o amministratore possono chiudere un servizio';
  end if;

  select *
  into target_service
  from public.restaurant_services
  where id = p_service_id
  for update;

  if target_service.id is null then
    raise exception 'Servizio non disponibile';
  end if;

  if target_service.closed_at is not null then
    return target_service;
  end if;

  select count(*)::integer
  into open_orders
  from public.orders
  where service_id = p_service_id
    and status in (
      'draft',
      'pending_cashier',
      'confirmed',
      'in_preparation',
      'bill_requested'
    );

  if open_orders > 0 and not p_force then
    raise exception 'Ci sono ancora % tavoli aperti', open_orders;
  end if;

  for active_order in
    select id
    from public.orders
    where service_id = p_service_id
      and status in (
        'draft',
        'pending_cashier',
        'confirmed',
        'in_preparation',
        'bill_requested'
      )
  loop
    perform private.log_order_activity(
      active_order.id,
      'service_closed',
      jsonb_build_object('service_id', p_service_id)
    );
  end loop;

  update public.print_jobs
  set status = 'cancelled',
      error_message = 'Job interrotto dalla chiusura del servizio'
  where order_id in (
    select id
    from public.orders
    where service_id = p_service_id
  )
    and status in ('pending', 'printing');

  update public.orders
  set status = case
        when status = 'draft' then 'cancelled'::public.order_status
        else 'closed'::public.order_status
      end,
      closed_at = now()
  where service_id = p_service_id
    and status in (
      'draft',
      'pending_cashier',
      'confirmed',
      'in_preparation',
      'bill_requested'
    );

  update public.restaurant_services
  set closed_at = now(),
      closed_by = (select auth.uid())
  where id = p_service_id
    and closed_at is null
  returning * into result;

  if result.id is null then
    return target_service;
  end if;

  return result;
end;
$$;

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

  select *
  into current_service
  from public.restaurant_services
  where closed_at is null
  limit 1;

  if current_service.id is null then
    raise exception 'Nessun servizio aperto. Chiedi alla cassa di iniziare il servizio';
  end if;

  select *
  into result
  from public.orders
  where table_id = p_table_id
    and status in (
      'draft',
      'pending_cashier',
      'confirmed',
      'in_preparation',
      'bill_requested'
    )
  limit 1;

  if current_service.period = 'recupero'
    or current_service.business_date <> (now() at time zone 'Europe/Rome')::date
  then
    raise exception 'Il servizio precedente deve essere chiuso dalla cassa';
  end if;

  if result.id is not null
    and result.service_id is distinct from current_service.id
  then
    raise exception 'Il tavolo appartiene a un servizio precedente ancora aperto';
  end if;

  if result.id is null then
    begin
      insert into public.orders (
        table_id,
        service_id,
        cover_price_snapshot
      )
      values (
        p_table_id,
        current_service.id,
        0
      )
      returning * into result;

      perform private.log_order_activity(
        result.id,
        'order_created',
        jsonb_build_object('service_id', current_service.id)
      );
    exception
      when unique_violation then
        select *
        into result
        from public.orders
        where table_id = p_table_id
          and service_id = current_service.id
          and status in (
            'draft',
            'pending_cashier',
            'confirmed',
            'in_preparation',
            'bill_requested'
          )
        limit 1;
    end;
  end if;

  return result;
end;
$$;

create or replace function public.send_order_to_cashier(p_order_id uuid)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.orders;
  order_covers integer;
  all_you_can_eat_quantity integer;
begin
  if not exists (
    select 1
    from public.orders as target_order
    join public.restaurant_services as service
      on service.id = target_order.service_id
    where target_order.id = p_order_id
      and target_order.status = 'draft'
      and service.closed_at is null
      and service.period <> 'recupero'
      and service.business_date = (now() at time zone 'Europe/Rome')::date
  ) then
    raise exception 'Ordine non disponibile nel servizio corrente';
  end if;

  if not exists (
    select 1
    from public.order_items
    where order_id = p_order_id
  ) then
    raise exception 'La comanda è vuota';
  end if;

  select cover_count
  into order_covers
  from public.orders
  where id = p_order_id
    and status = 'draft';

  if order_covers is null then
    raise exception 'Ordine già inviato o non disponibile';
  end if;

  select coalesce(sum(quantity), 0)::integer
  into all_you_can_eat_quantity
  from public.order_items
  where order_id = p_order_id
    and item_name_snapshot like 'All You Can Eat%';

  if all_you_can_eat_quantity > 0
    and all_you_can_eat_quantity <> order_covers
  then
    raise exception 'Le formule All You Can Eat (%) e i coperti (%) devono coincidere',
      all_you_can_eat_quantity,
      order_covers;
  end if;

  update public.orders
  set status = 'pending_cashier',
      sent_to_cashier_at = now()
  where id = p_order_id
    and status = 'draft'
  returning * into result;

  if result.id is null then
    raise exception 'Ordine già inviato o non disponibile';
  end if;

  perform private.log_order_activity(p_order_id, 'sent_to_cashier');
  return result;
end;
$$;

revoke all on function public.get_current_service() from public;
revoke all on function public.start_service(public.service_period) from public;
revoke all on function public.close_service(uuid, boolean) from public;

grant execute on function public.get_current_service() to authenticated;
grant execute on function public.start_service(public.service_period) to authenticated;
grant execute on function public.close_service(uuid, boolean) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'restaurant_services'
  ) then
    alter publication supabase_realtime add table public.restaurant_services;
  end if;
end;
$$;

commit;
