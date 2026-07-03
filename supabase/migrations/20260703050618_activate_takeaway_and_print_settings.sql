begin;

create type public.order_type as enum ('dine_in', 'takeaway');

alter table public.restaurant_settings
  add column dine_in_print_copies integer not null default 3,
  add column takeaway_print_copies integer not null default 1,
  add constraint restaurant_settings_dine_in_print_copies_check
    check (dine_in_print_copies between 1 and 3),
  add constraint restaurant_settings_takeaway_print_copies_check
    check (takeaway_print_copies between 1 and 3);

update public.restaurant_settings
set dine_in_print_copies = least(3, greatest(1, default_print_copies));

alter table public.print_jobs
  drop constraint if exists print_jobs_three_copies_check,
  add constraint print_jobs_copies_check check (copies between 1 and 3);

alter table public.orders
  add column order_type public.order_type not null default 'dine_in',
  add column takeaway_name text,
  add column takeaway_pickup_at timestamptz,
  alter column table_id drop not null;

alter table public.orders
  add constraint orders_service_mode_check check (
    (
      order_type = 'dine_in'
      and table_id is not null
      and takeaway_name is null
      and takeaway_pickup_at is null
    )
    or (
      order_type = 'takeaway'
      and table_id is null
      and char_length(trim(takeaway_name)) between 1 and 80
      and takeaway_pickup_at is not null
      and cover_count = 0
      and cover_price_snapshot = 0
      and cover_total = 0
    )
  );

drop index public.orders_one_active_per_table_idx;
create unique index orders_one_active_per_table_idx
  on public.orders(table_id)
  where order_type = 'dine_in'
    and status in (
      'draft',
      'pending_cashier',
      'confirmed',
      'in_preparation',
      'bill_requested'
    );

create index orders_active_takeaway_idx
  on public.orders(service_id, takeaway_pickup_at, created_at)
  where order_type = 'takeaway'
    and status in (
      'draft',
      'pending_cashier',
      'confirmed',
      'in_preparation',
      'bill_requested'
    );

create or replace function private.prepare_order()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  configured_cover numeric(10, 2);
begin
  if tg_op = 'INSERT' then
    if new.order_type = 'takeaway' then
      new.table_id = null;
      new.cover_count = 0;
      new.cover_price_snapshot = 0;
      new.cover_total = 0;
      new.total = new.subtotal;
      new.takeaway_name = trim(new.takeaway_name);
    else
      select cover_charge into configured_cover
      from public.restaurant_settings
      order by created_at
      limit 1;
      new.cover_price_snapshot = coalesce(configured_cover, 1.90);
      new.takeaway_name = null;
      new.takeaway_pickup_at = null;
    end if;

    new.created_by = (select auth.uid());
    new.version = 1;
  else
    new.order_number = old.order_number;
    new.table_id = old.table_id;
    new.order_type = old.order_type;
    new.takeaway_name = old.takeaway_name;
    new.takeaway_pickup_at = old.takeaway_pickup_at;
    new.cover_price_snapshot = old.cover_price_snapshot;
    new.created_by = old.created_by;
    new.created_at = old.created_at;

    if new.order_type = 'takeaway' then
      new.cover_count = 0;
      new.cover_price_snapshot = 0;
      new.cover_total = 0;
      new.total = new.subtotal;
    end if;

    if new.status <> old.status and private.current_role() = 'waiter' then
      if not (
        (old.status = 'draft' and new.status = 'pending_cashier')
        or (old.status = 'in_preparation' and new.status = 'bill_requested')
      ) then
        raise exception 'Transizione di stato non consentita al cameriere';
      end if;
    end if;
  end if;

  new.updated_by = (select auth.uid());
  new.updated_at = now();
  if tg_op = 'UPDATE' then
    new.version = old.version + 1;
  end if;
  return new;
end;
$$;

create or replace function public.create_takeaway_order(
  p_customer_name text,
  p_pickup_at timestamptz
)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_service public.restaurant_services;
  result public.orders;
  normalized_name text;
begin
  if not private.is_active_staff() then
    raise exception 'Utente non autorizzato';
  end if;

  normalized_name := trim(coalesce(p_customer_name, ''));
  if char_length(normalized_name) < 1 or char_length(normalized_name) > 80 then
    raise exception 'Inserisci un nome cliente valido';
  end if;
  if p_pickup_at is null then
    raise exception 'Inserisci l''ora di ritiro';
  end if;

  select *
  into current_service
  from public.restaurant_services
  where closed_at is null
  limit 1;

  if current_service.id is null then
    raise exception 'Nessun servizio aperto. Chiedi alla cassa di iniziare il servizio';
  end if;
  if current_service.period = 'recupero'
    or current_service.business_date <> (now() at time zone 'Europe/Rome')::date
  then
    raise exception 'Il servizio precedente deve essere chiuso dalla cassa';
  end if;

  insert into public.orders (
    table_id,
    service_id,
    order_type,
    takeaway_name,
    takeaway_pickup_at,
    cover_count,
    cover_price_snapshot
  )
  values (
    null,
    current_service.id,
    'takeaway',
    normalized_name,
    p_pickup_at,
    0,
    0
  )
  returning * into result;

  perform private.log_order_activity(
    result.id,
    'takeaway_created',
    jsonb_build_object(
      'service_id', current_service.id,
      'customer_name', normalized_name,
      'pickup_at', p_pickup_at
    )
  );

  return result;
end;
$$;

create or replace function public.remove_order_item_extra(p_extra_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent_order uuid;
  removed_extra uuid;
begin
  select item.order_id
  into parent_order
  from public.order_item_extras as extra
  join public.order_items as item on item.id = extra.order_item_id
  where extra.id = p_extra_id;

  delete from public.order_item_extras
  where id = p_extra_id
  returning id into removed_extra;

  if removed_extra is null then
    raise exception 'Extra non disponibile';
  end if;

  perform private.log_order_activity(
    parent_order,
    'extra_removed',
    jsonb_build_object('extra_id', p_extra_id)
  );
end;
$$;

create or replace function private.enqueue_print_job(
  p_order_id uuid,
  p_job_type public.print_job_type,
  p_created_by uuid
)
returns public.print_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.print_jobs;
  target_order_type public.order_type;
  configured_copies integer;
begin
  select
    target_order.order_type,
    case
      when target_order.order_type = 'takeaway'
        then settings.takeaway_print_copies
      else settings.dine_in_print_copies
    end
  into target_order_type, configured_copies
  from public.orders as target_order
  left join lateral (
    select *
    from public.restaurant_settings
    order by created_at
    limit 1
  ) as settings on true
  where target_order.id = p_order_id;

  configured_copies := coalesce(
    configured_copies,
    case when target_order_type = 'takeaway' then 1 else 3 end
  );

  if p_job_type = 'order_update' then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_order_id::text || ':order_update', 0)
    );

    select *
    into result
    from public.print_jobs
    where order_id = p_order_id
      and job_type = 'order_update'
      and status in ('pending', 'failed')
    order by created_at desc
    limit 1
    for update;

    if result.id is not null then
      if result.status = 'failed' then
        update public.print_jobs
        set status = 'pending',
            idempotency_key =
              p_order_id::text || ':order_update:' || gen_random_uuid()::text,
            retry_count = 0,
            error_message = null,
            printnode_job_id = null,
            processing_started_at = null,
            submitted_at = null,
            failed_at = null,
            last_attempt_at = null,
            manual_fallback = false,
            created_by = p_created_by,
            created_at = now()
        where id = result.id
        returning * into result;
      end if;

      return result;
    end if;

    insert into public.print_jobs (
      order_id,
      job_type,
      idempotency_key,
      status,
      copies,
      created_by
    )
    values (
      p_order_id,
      p_job_type,
      p_order_id::text || ':order_update:' || gen_random_uuid()::text,
      'pending',
      configured_copies,
      p_created_by
    )
    returning * into result;

    return result;
  end if;

  insert into public.print_jobs (
    order_id,
    job_type,
    idempotency_key,
    status,
    copies,
    created_by
  )
  values (
    p_order_id,
    p_job_type,
    p_order_id::text || ':' || p_job_type::text,
    'pending',
    configured_copies,
    p_created_by
  )
  on conflict do nothing
  returning * into result;

  if result.id is null then
    select *
    into result
    from public.print_jobs
    where order_id = p_order_id
      and job_type = p_job_type
    order by created_at desc
    limit 1;
  end if;

  return result;
end;
$$;

create or replace function public.request_reprint(p_order_id uuid)
returns public.print_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_order public.orders;
  result public.print_jobs;
  configured_copies integer;
begin
  if private.current_role() not in ('cashier', 'admin') then
    raise exception 'Non autorizzato';
  end if;

  select *
  into target_order
  from public.orders
  where id = p_order_id;

  if target_order.id is null then
    raise exception 'Ordine non disponibile';
  end if;

  select case
    when target_order.order_type = 'takeaway'
      then takeaway_print_copies
    else dine_in_print_copies
  end
  into configured_copies
  from public.restaurant_settings
  order by created_at
  limit 1;

  configured_copies := coalesce(
    configured_copies,
    case when target_order.order_type = 'takeaway' then 1 else 3 end
  );

  insert into public.print_jobs (
    order_id,
    job_type,
    idempotency_key,
    status,
    copies,
    created_by
  )
  values (
    p_order_id,
    'reprint',
    p_order_id::text || ':reprint',
    'pending',
    configured_copies,
    (select auth.uid())
  )
  on conflict do nothing
  returning * into result;

  if result.id is null then
    select *
    into result
    from public.print_jobs
    where order_id = p_order_id
      and job_type = 'reprint'
    order by created_at desc
    limit 1;
  end if;

  perform private.log_order_activity(p_order_id, 'reprint_requested');
  return result;
end;
$$;

do $migration$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'print_jobs'
      and column_name = 'retry_requested_by'
  ) then
    execute $function$
      create or replace function public.request_reprint(
        p_order_id uuid,
        p_action_key uuid,
        p_reason text default 'Ristampa richiesta dalla cassa'
      )
      returns public.print_jobs
      language plpgsql
      security invoker
      set search_path = ''
      as $body$
      declare
        target_order public.orders;
        result public.print_jobs;
        stable_key text;
        configured_copies integer;
      begin
        if private.current_role() not in ('cashier', 'admin') then
          raise exception 'Non autorizzato';
        end if;

        select *
        into target_order
        from public.orders
        where id = p_order_id;

        if target_order.id is null then
          raise exception 'Ordine non disponibile';
        end if;

        select case
          when target_order.order_type = 'takeaway'
            then takeaway_print_copies
          else dine_in_print_copies
        end
        into configured_copies
        from public.restaurant_settings
        order by created_at
        limit 1;

        configured_copies := coalesce(
          configured_copies,
          case when target_order.order_type = 'takeaway' then 1 else 3 end
        );
        stable_key := p_order_id::text || ':reprint:' || p_action_key::text;

        insert into public.print_jobs (
          order_id,
          job_type,
          idempotency_key,
          status,
          copies,
          created_by,
          retry_requested_by,
          retry_requested_at,
          retry_reason
        )
        values (
          p_order_id,
          'reprint',
          stable_key,
          'pending',
          configured_copies,
          (select auth.uid()),
          (select auth.uid()),
          now(),
          nullif(trim(p_reason), '')
        )
        on conflict (idempotency_key) do nothing
        returning * into result;

        if result.id is null then
          select *
          into result
          from public.print_jobs
          where idempotency_key = stable_key;
        end if;

        perform private.log_order_activity(
          p_order_id,
          'reprint_requested',
          jsonb_build_object(
            'print_job_id', result.id,
            'action_key', p_action_key,
            'reason', p_reason
          )
        );
        return result;
      end;
      $body$;
    $function$;

    execute
      'revoke all on function public.request_reprint(uuid, uuid, text) from public';
    execute
      'grant execute on function public.request_reprint(uuid, uuid, text) to authenticated';
  end if;
end;
$migration$;

drop policy print_jobs_cashier_insert on public.print_jobs;
do $migration$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'print_jobs'
      and column_name = 'retry_of_job_id'
  ) then
    execute $policy$
      create policy print_jobs_cashier_insert
      on public.print_jobs
      for insert
      to authenticated
      with check (
        private.current_role() in ('cashier', 'admin')
        and created_by = (select auth.uid())
        and job_type = 'reprint'
        and status = 'pending'
        and copies between 1 and 3
        and (
          idempotency_key = order_id::text || ':reprint'
          or idempotency_key like order_id::text || ':reprint:%'
        )
        and (
          retry_of_job_id is null
          or private.is_retry_parent_for_order(retry_of_job_id, order_id)
        )
      )
    $policy$;
  else
    execute $policy$
      create policy print_jobs_cashier_insert
      on public.print_jobs
      for insert
      to authenticated
      with check (
        private.current_role() in ('cashier', 'admin')
        and created_by = (select auth.uid())
        and job_type = 'reprint'
        and status = 'pending'
        and copies between 1 and 3
        and idempotency_key = order_id::text || ':reprint'
      )
    $policy$;
  end if;
end;
$migration$;

revoke all on function public.create_takeaway_order(text, timestamptz) from public;
revoke all on function public.remove_order_item_extra(uuid) from public;
grant execute on function public.create_takeaway_order(text, timestamptz) to authenticated;
grant execute on function public.remove_order_item_extra(uuid) to authenticated;

commit;
