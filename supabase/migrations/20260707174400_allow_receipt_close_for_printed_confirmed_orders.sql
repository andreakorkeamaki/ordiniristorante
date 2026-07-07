create or replace function public.get_or_create_receipt_print_job(p_order_id uuid)
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

  select * into target_order
  from public.orders
  where id = p_order_id
  for update;

  if target_order.id is null then
    raise exception 'Ordine non disponibile';
  end if;
  if target_order.status = 'cancelled' then
    raise exception 'L''ordine è annullato';
  end if;
  if target_order.status = 'closed' then
    select * into result
    from public.print_jobs
    where order_id = p_order_id and job_type = 'receipt'
    order by created_at desc
    limit 1;
    return result;
  end if;
  if not (
    target_order.status in ('in_preparation', 'bill_requested')
    or (
      target_order.status = 'confirmed'
      and exists (
        select 1
        from public.print_jobs
        where order_id = p_order_id
          and job_type = 'new_order'
          and status = 'printed'
      )
    )
  ) then
    raise exception 'Ordine non ancora pronto per la chiusura';
  end if;
  if not exists (
    select 1
    from public.restaurant_services
    where id = target_order.service_id and closed_at is null
  ) then
    raise exception 'Il servizio dell''ordine è già chiuso';
  end if;

  insert into public.print_jobs(
    order_id,
    job_type,
    idempotency_key,
    status,
    copies,
    labels,
    created_by
  )
  values (
    p_order_id,
    'receipt',
    p_order_id::text || ':receipt',
    'pending',
    1,
    '["SCONTRINO"]'::jsonb,
    (select auth.uid())
  )
  on conflict (idempotency_key) do nothing
  returning * into result;

  if result.id is null then
    select * into result
    from public.print_jobs
    where idempotency_key = p_order_id::text || ':receipt';
  end if;

  perform private.log_order_activity(
    p_order_id,
    'receipt_print_job_ready',
    jsonb_build_object('print_job_id', result.id)
  );
  return result;
end;
$$;

create or replace function public.claim_print_job(p_job_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.print_jobs;
  claimed boolean := false;
begin
  update public.print_jobs
  set status = 'printing',
      processing_started_at = coalesce(processing_started_at, now()),
      last_attempt_at = now(),
      retry_count = retry_count + 1,
      failed_at = null,
      error_message = null,
      staff_message = null,
      technical_error = null,
      verification_required_at = null,
      manual_fallback = false
  where id = p_job_id
    and status = 'pending'
    and (
      job_type <> 'receipt'
      or exists (
        select 1
        from public.orders as target_order
        join public.restaurant_services as service
          on service.id = target_order.service_id
        where target_order.id = print_jobs.order_id
          and (
            target_order.status in ('in_preparation', 'bill_requested')
            or (
              target_order.status = 'confirmed'
              and exists (
                select 1
                from public.print_jobs as new_order_job
                where new_order_job.order_id = target_order.id
                  and new_order_job.job_type = 'new_order'
                  and new_order_job.status = 'printed'
              )
            )
          )
          and service.closed_at is null
      )
    )
  returning * into result;

  claimed := result.id is not null;
  if result.id is null then
    select * into result from public.print_jobs where id = p_job_id;
  end if;
  if result.id is null then
    raise exception 'Job di stampa non disponibile';
  end if;
  return jsonb_build_object(
    'job', to_jsonb(result),
    'claimed', claimed
  );
end;
$$;

create or replace function public.close_order(
  p_order_id uuid,
  p_expected_version bigint default null
)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.orders;
begin
  if private.current_role() not in ('cashier', 'admin') then
    raise exception 'Non autorizzato';
  end if;
  if not exists (
    select 1
    from public.print_jobs
    where order_id = p_order_id
      and job_type = 'receipt'
      and status = 'printed'
  ) then
    raise exception 'Lo scontrino non è ancora confermato';
  end if;

  update public.orders
  set status = 'closed',
      closed_at = now()
  where id = p_order_id
    and (
      status in ('in_preparation', 'bill_requested')
      or (
        status = 'confirmed'
        and exists (
          select 1
          from public.print_jobs
          where order_id = p_order_id
            and job_type = 'new_order'
            and status = 'printed'
        )
      )
    )
    and (p_expected_version is null or version = p_expected_version)
    and exists (
      select 1
      from public.restaurant_services
      where id = orders.service_id and closed_at is null
    )
  returning * into result;

  if result.id is null then
    select * into result
    from public.orders
    where id = p_order_id and status = 'closed';
    if result.id is not null then
      return result;
    end if;
    raise exception 'Ordine non chiudibile: stato o versione sono cambiati';
  end if;

  perform private.log_order_activity(p_order_id, 'closed_after_receipt');
  return result;
end;
$$;
