begin;

drop policy order_items_staff_insert on public.order_items;
drop policy order_items_staff_update on public.order_items;
drop policy order_items_staff_delete on public.order_items;

create policy order_items_staff_insert
on public.order_items
for insert
to authenticated
with check (
  private.is_active_staff()
  and exists (
    select 1
    from public.orders
    where id = order_id
      and status in (
        'draft',
        'pending_cashier',
        'confirmed',
        'in_preparation',
        'bill_requested'
      )
  )
);

create policy order_items_staff_update
on public.order_items
for update
to authenticated
using (
  private.is_active_staff()
  and exists (
    select 1
    from public.orders
    where id = order_id
      and status in (
        'draft',
        'pending_cashier',
        'confirmed',
        'in_preparation',
        'bill_requested'
      )
  )
)
with check (private.is_active_staff());

create policy order_items_staff_delete
on public.order_items
for delete
to authenticated
using (
  private.is_active_staff()
  and exists (
    select 1
    from public.orders
    where id = order_id
      and status in (
        'draft',
        'pending_cashier',
        'confirmed',
        'in_preparation',
        'bill_requested'
      )
  )
);

drop policy order_extras_staff_write on public.order_item_extras;

create policy order_extras_staff_write
on public.order_item_extras
for all
to authenticated
using (
  private.is_active_staff()
  and exists (
    select 1
    from public.order_items as item
    join public.orders as target_order on target_order.id = item.order_id
    where item.id = order_item_id
      and target_order.status in (
        'draft',
        'pending_cashier',
        'confirmed',
        'in_preparation',
        'bill_requested'
      )
  )
)
with check (
  private.is_active_staff()
  and exists (
    select 1
    from public.order_items as item
    join public.orders as target_order on target_order.id = item.order_id
    where item.id = order_item_id
      and target_order.status in (
        'draft',
        'pending_cashier',
        'confirmed',
        'in_preparation',
        'bill_requested'
      )
  )
);

alter table public.print_jobs
  drop constraint print_jobs_order_type_key;

create unique index print_jobs_singleton_type_key
  on public.print_jobs (order_id, job_type)
  where job_type <> 'order_update';

create unique index print_jobs_one_open_update_per_order_idx
  on public.print_jobs (order_id)
  where job_type = 'order_update'
    and status in ('pending', 'failed');

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
begin
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
      3,
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
    3,
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
    3,
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

commit;
