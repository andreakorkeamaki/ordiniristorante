begin;

create or replace function private.prepare_order()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  configured_cover numeric(10, 2);
  printnode_transition_allowed boolean;
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

    printnode_transition_allowed :=
      current_setting('appordini.printnode_state_transition', true) = 'on'
      and old.status in ('pending_cashier', 'confirmed')
      and new.status = 'in_preparation';

    if new.status <> old.status
      and private.current_role() = 'waiter'
      and not printnode_transition_allowed
    then
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

create or replace function private.apply_printnode_state(
  p_job_id uuid,
  p_state text,
  p_message text default null
)
returns public.print_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.print_jobs;
  previous_status public.print_status;
begin
  select status into previous_status
  from public.print_jobs
  where id = p_job_id;

  update public.print_jobs
  set status = case
        when p_state = 'done' then 'printed'::public.print_status
        when p_state in ('error', 'expired') then 'failed'::public.print_status
        else 'printing'::public.print_status
      end,
      printed_at = case when p_state = 'done' then coalesce(printed_at, now()) else printed_at end,
      failed_at = case when p_state in ('error', 'expired') then now() else null end,
      last_printnode_state = p_state,
      last_state_checked_at = now(),
      verification_required_at = case
        when p_state in ('done', 'error', 'expired') then null
        else verification_required_at
      end,
      staff_message = case
        when p_state = 'error' then 'PrintNode ha segnalato un errore di stampa'
        when p_state = 'expired' then 'La richiesta è scaduta prima di raggiungere la stampante'
        else null
      end,
      technical_error = case
        when p_state in ('error', 'expired') then left(coalesce(p_message, 'PrintNode: ' || p_state), 2000)
        else null
      end,
      error_message = case
        when p_state in ('error', 'expired') then left(coalesce(p_message, 'PrintNode: ' || p_state), 2000)
        else null
      end
  where id = p_job_id
    and status in ('printing', 'failed')
  returning * into result;

  if result.id is null then
    select * into result from public.print_jobs where id = p_job_id;
  end if;
  if result.id is null then
    raise exception 'Job di stampa non disponibile';
  end if;

  if p_state = 'done' and result.job_type = 'new_order' then
    perform set_config('appordini.printnode_state_transition', 'on', true);
    update public.orders
    set status = 'in_preparation'
    where id = result.order_id
      and status in ('pending_cashier', 'confirmed');
    perform set_config('appordini.printnode_state_transition', 'off', true);
  elsif p_state = 'done' and result.job_type = 'receipt' then
    begin
      perform public.close_order(result.order_id, null);
    exception
      when others then
        perform private.log_order_activity(
          result.order_id,
          'receipt_printed_order_not_closed',
          jsonb_build_object(
            'print_job_id', result.id,
            'reason', sqlerrm
          )
        );
    end;
  end if;

  if previous_status is distinct from result.status
    or p_state in ('done', 'error', 'expired')
  then
    perform private.log_order_activity(
      result.order_id,
      'printnode_state_updated',
      jsonb_build_object(
        'print_job_id', result.id,
        'printnode_job_id', result.printnode_job_id,
        'state', p_state,
        'message', p_message
      )
    );
  end if;

  return result;
end;
$$;

revoke all on function private.apply_printnode_state(uuid, text, text)
from public, anon, authenticated;

create or replace function public.record_printnode_state(
  p_job_id uuid,
  p_state text,
  p_message text default null
)
returns public.print_jobs
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if private.current_role() not in ('cashier', 'admin')
    and not exists (
      select 1
      from public.print_jobs as job
      join public.orders as target_order
        on target_order.id = job.order_id
      where job.id = p_job_id
        and job.job_type in ('new_order', 'order_update')
        and job.status in ('printing', 'failed')
        and job.printnode_job_id is not null
        and target_order.created_by = (select auth.uid())
        and target_order.status in (
          'pending_cashier',
          'confirmed',
          'in_preparation',
          'bill_requested'
        )
    )
  then
    raise exception 'Non autorizzato';
  end if;

  return private.apply_printnode_state(p_job_id, p_state, p_message);
end;
$$;

commit;
