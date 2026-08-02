begin;

-- A print request that never left our database is safe to discard when its
-- order is already closed or cancelled. Open orders and print attempts that
-- may already be in progress remain real blockers.
create or replace function public.get_service_close_blockers(p_service_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'orders', coalesce((
      select jsonb_object_agg(blocker, amount)
      from (
        select 'draft'::text as blocker, count(*)::integer as amount
        from public.orders
        where service_id = p_service_id
          and status = 'draft'
        having count(*) > 0

        union all

        select 'unprinted'::text as blocker, count(*)::integer as amount
        from public.orders as target_order
        where target_order.service_id = p_service_id
          and target_order.status in (
            'pending_cashier',
            'confirmed',
            'in_preparation',
            'bill_requested'
          )
          and not exists (
            select 1
            from public.print_jobs as command_job
            where command_job.order_id = target_order.id
              and command_job.job_type = 'new_order'
              and command_job.status = 'printed'
          )
        having count(*) > 0
      ) as order_blockers
    ), '{}'::jsonb),
    'jobs', coalesce((
      select jsonb_object_agg(job_state, amount)
      from (
        select case
          when candidate_job.verification_required_at is not null then 'uncertain'
          else candidate_job.status::text
        end as job_state,
        count(*)::integer as amount
        from public.print_jobs as candidate_job
        where candidate_job.order_id in (
          select id from public.orders where service_id = p_service_id
        )
          and candidate_job.status in ('pending', 'printing', 'failed')
          and not (
            candidate_job.status in ('pending', 'failed')
            and candidate_job.printnode_job_id is null
            and candidate_job.submitted_at is null
            and candidate_job.verification_required_at is null
            and exists (
              select 1
              from public.orders as completed_order
              where completed_order.id = candidate_job.order_id
                and completed_order.status in ('closed', 'cancelled')
            )
          )
        group by 1
      ) as job_counts
    ), '{}'::jsonb)
  );
$$;

-- Keep the existing parameters temporarily so an older deployed client can
-- still call the function during rollout. They no longer enable a bypass:
-- every closure follows the same safe rules.
create or replace function private.close_service(
  p_service_id uuid,
  p_force boolean default false,
  p_reason text default null
)
returns public.restaurant_services
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_service public.restaurant_services;
  blocked_orders integer;
  blocking_jobs integer;
  result public.restaurant_services;
  active_order record;
begin
  if private.current_role() not in ('cashier', 'admin') then
    raise exception 'Solo cassa o amministratore possono chiudere un servizio';
  end if;

  select * into target_service
  from public.restaurant_services
  where id = p_service_id
  for update;

  if target_service.id is null then
    raise exception 'Servizio non disponibile';
  end if;
  if target_service.closed_at is not null then
    return target_service;
  end if;

  select count(*)::integer into blocked_orders
  from public.orders as target_order
  where target_order.service_id = p_service_id
    and (
      target_order.status = 'draft'
      or (
        target_order.status in (
          'pending_cashier',
          'confirmed',
          'in_preparation',
          'bill_requested'
        )
        and not exists (
          select 1
          from public.print_jobs as command_job
          where command_job.order_id = target_order.id
            and command_job.job_type = 'new_order'
            and command_job.status = 'printed'
        )
      )
    );

  select count(*)::integer into blocking_jobs
  from public.print_jobs as candidate_job
  where candidate_job.order_id in (
    select id from public.orders where service_id = p_service_id
  )
    and candidate_job.status in ('pending', 'printing', 'failed')
    and not (
      candidate_job.status in ('pending', 'failed')
      and candidate_job.printnode_job_id is null
      and candidate_job.submitted_at is null
      and candidate_job.verification_required_at is null
      and exists (
        select 1
        from public.orders as completed_order
        where completed_order.id = candidate_job.order_id
          and completed_order.status in ('closed', 'cancelled')
      )
    );

  if blocked_orders > 0 then
    raise exception
      'Ci sono ancora % ordini da completare o inviare in stampa',
      blocked_orders;
  end if;
  if blocking_jobs > 0 then
    raise exception
      'Ci sono ancora % stampe in corso o da verificare',
      blocking_jobs;
  end if;

  update public.print_jobs as candidate_job
  set status = 'cancelled',
      staff_message =
        'Richiesta mai inviata: annullata automaticamente alla chiusura del servizio'
  where order_id in (
    select id from public.orders where service_id = p_service_id
  )
    and status in ('pending', 'failed')
    and printnode_job_id is null
    and submitted_at is null
    and verification_required_at is null
    and exists (
      select 1
      from public.orders as completed_order
      where completed_order.id = candidate_job.order_id
        and completed_order.status in ('closed', 'cancelled')
    );

  for active_order in
    select id
    from public.orders
    where service_id = p_service_id
      and status in (
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

  update public.orders
  set status = 'closed'::public.order_status,
      closed_at = now()
  where service_id = p_service_id
    and status in (
      'pending_cashier',
      'confirmed',
      'in_preparation',
      'bill_requested'
    );

  update public.restaurant_services
  set closed_at = now(),
      closed_by = (select auth.uid()),
      forced_close = false,
      forced_close_reason = null
  where id = p_service_id
    and closed_at is null
  returning * into result;

  if result.id is null then
    raise exception 'Il servizio è cambiato durante la chiusura';
  end if;
  return result;
end;
$$;

comment on function private.close_service(uuid, boolean, text) is
  'Closes a service safely. p_force and p_reason are deprecated compatibility parameters and never bypass blockers.';

commit;
