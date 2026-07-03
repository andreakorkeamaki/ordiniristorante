begin;

update public.menu_categories
set description =
      'Ordinabile per il numero di persone desiderato. Include: antipastino misto della casa, pinsa romana non stop servita al tavolo a scelta dello chef, patatine fritte e pinsa con la Nutella.',
    description_en =
      'Available for the number of guests selected. Includes: a selection of house starters, unlimited Roman pinsa served at the table with toppings chosen by the chef, French fries and Nutella pinsa.'
where slug = 'all-you-can-eat';

create or replace function public.send_order_to_cashier(p_order_id uuid)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.orders;
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

drop policy print_jobs_cashier_insert on public.print_jobs;

create policy print_jobs_cashier_insert on public.print_jobs for insert to authenticated
with check (
  private.is_active_staff()
  and created_by = (select auth.uid())
  and job_type = 'reprint'
  and status = 'pending'
  and copies between 1 and 3
  and (
    idempotency_key = order_id::text || ':reprint'
    or idempotency_key like order_id::text || ':reprint:%'
  )
  and (
    private.current_role() in ('cashier', 'admin')
    or (
      private.current_role() = 'waiter'
      and retry_of_job_id is null
      and exists (
        select 1
        from public.orders as target_order
        where target_order.id = print_jobs.order_id
          and target_order.status in (
            'confirmed',
            'in_preparation',
            'bill_requested'
          )
      )
    )
  )
  and (
    retry_of_job_id is null
    or private.is_retry_parent_for_order(retry_of_job_id, order_id)
  )
);

drop policy print_jobs_waiter_automatic_update on public.print_jobs;

create policy print_jobs_waiter_automatic_update
on public.print_jobs
for update
to authenticated
using (
  private.current_role() = 'waiter'
  and status in ('pending', 'printing')
  and exists (
    select 1
    from public.orders as target_order
    where target_order.id = print_jobs.order_id
      and target_order.status in (
        'pending_cashier',
        'confirmed',
        'in_preparation',
        'bill_requested'
      )
      and (
        (
          print_jobs.job_type in ('new_order', 'order_update')
          and target_order.created_by = (select auth.uid())
        )
        or (
          print_jobs.job_type = 'reprint'
          and print_jobs.created_by = (select auth.uid())
          and print_jobs.retry_of_job_id is null
        )
      )
  )
)
with check (
  private.current_role() = 'waiter'
  and status in ('printing', 'failed')
  and exists (
    select 1
    from public.orders as target_order
    where target_order.id = print_jobs.order_id
      and target_order.status in (
        'pending_cashier',
        'confirmed',
        'in_preparation',
        'bill_requested'
      )
      and (
        (
          print_jobs.job_type in ('new_order', 'order_update')
          and target_order.created_by = (select auth.uid())
        )
        or (
          print_jobs.job_type = 'reprint'
          and print_jobs.created_by = (select auth.uid())
          and print_jobs.retry_of_job_id is null
        )
      )
  )
);

create or replace function public.request_reprint(
  p_order_id uuid,
  p_action_key uuid,
  p_reason text default 'Ristampa richiesta dai tavoli'
)
returns public.print_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_order public.orders;
  result public.print_jobs;
  stable_key text;
  configured_copies integer;
begin
  if not private.is_active_staff() then
    raise exception 'Non autorizzato';
  end if;

  select *
  into target_order
  from public.orders
  where id = p_order_id;

  if target_order.id is null then
    raise exception 'Ordine non disponibile';
  end if;

  if private.current_role() = 'waiter'
    and target_order.status not in ('confirmed', 'in_preparation', 'bill_requested')
  then
    raise exception 'Comanda non disponibile per la ristampa';
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
$$;

revoke all on function public.request_reprint(uuid, uuid, text) from public;
grant execute on function public.request_reprint(uuid, uuid, text) to authenticated;

commit;
