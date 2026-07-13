begin;

-- A submitted order is not, by itself, a service-close blocker. The safe
-- boundary is whether its command has been printed and whether every print job
-- has reached a terminal state. This keeps tables editable for later rounds
-- during service, while allowing the cashier to close the whole service once
-- the kitchen handoff is complete.
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
          when verification_required_at is not null then 'uncertain'
          else status::text
        end as job_state,
        count(*)::integer as amount
        from public.print_jobs
        where order_id in (
          select id from public.orders where service_id = p_service_id
        )
          and status in ('pending', 'printing', 'failed')
        group by 1
      ) as job_counts
    ), '{}'::jsonb)
  );
$$;

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
  unresolved_jobs integer;
  unsafe_jobs integer;
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

  select count(*)::integer into unresolved_jobs
  from public.print_jobs
  where order_id in (
    select id from public.orders where service_id = p_service_id
  )
    and status in ('pending', 'printing', 'failed');

  select count(*)::integer into unsafe_jobs
  from public.print_jobs
  where order_id in (
    select id from public.orders where service_id = p_service_id
  )
    and (
      status = 'printing'
      or verification_required_at is not null
    );

  if unsafe_jobs > 0 then
    raise exception 'Ci sono % job in stampa o da verificare', unsafe_jobs;
  end if;
  if (blocked_orders > 0 or unresolved_jobs > 0) and not p_force then
    raise exception
      'Ci sono ancora % ordini senza comanda stampata e % job di stampa da risolvere',
      blocked_orders,
      unresolved_jobs;
  end if;
  if p_force and char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'La chiusura forzata richiede una motivazione di almeno 10 caratteri';
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
      case when p_force then 'service_force_closed' else 'service_closed' end,
      jsonb_build_object(
        'service_id', p_service_id,
        'reason', case when p_force then left(trim(p_reason), 500) else null end
      )
    );
  end loop;

  update public.print_jobs
  set status = 'cancelled',
      staff_message = 'Job annullato prima dell''invio dalla chiusura del servizio'
  where order_id in (
    select id from public.orders where service_id = p_service_id
  )
    and status in ('pending', 'failed')
    and printnode_job_id is null
    and submitted_at is null
    and verification_required_at is null;

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
      closed_by = (select auth.uid()),
      forced_close = p_force,
      forced_close_reason = case
        when p_force then left(trim(p_reason), 500)
        else null
      end
  where id = p_service_id
    and closed_at is null
  returning * into result;

  if result.id is null then
    raise exception 'Il servizio è cambiato durante la chiusura';
  end if;
  return result;
end;
$$;

-- Repair orders whose PrintNode job was already recorded as completed but
-- whose operational state was left behind by the earlier permission rollout.
select set_config('appordini.printnode_state_transition', 'on', true);

update public.orders as target_order
set status = 'in_preparation'
where target_order.status in ('pending_cashier', 'confirmed')
  and exists (
    select 1
    from public.restaurant_services as service
    where service.id = target_order.service_id
      and service.closed_at is null
  )
  and exists (
    select 1
    from public.print_jobs as command_job
    where command_job.order_id = target_order.id
      and command_job.job_type = 'new_order'
      and command_job.status = 'printed'
  );

select set_config('appordini.printnode_state_transition', 'off', true);

commit;
