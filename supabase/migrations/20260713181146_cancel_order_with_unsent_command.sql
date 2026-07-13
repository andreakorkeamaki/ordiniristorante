begin;

-- A cancellation sheet is useful only when the original command may already
-- have reached the kitchen. Cancelling an entirely local/queued command must
-- simply retire the order; otherwise the generated cancellation job becomes a
-- new service-close blocker for something that was never printed.
create or replace function private.enqueue_job_from_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kitchen_was_notified boolean := false;
begin
  if old.status = 'draft' and new.status = 'pending_cashier' then
    perform private.enqueue_print_job(new.id, 'new_order', new.updated_by);
  elsif old.status <> 'cancelled' and new.status = 'cancelled' then
    select exists (
      select 1
      from public.print_jobs
      where order_id = new.id
        and job_type = 'new_order'
        and (
          status = 'printed'
          or printnode_job_id is not null
          or submitted_at is not null
        )
    ) into kitchen_was_notified;

    update public.print_jobs
    set status = 'cancelled',
        error_message = 'Ordine annullato prima del completamento della stampa'
    where order_id = new.id
      and job_type <> 'cancellation'
      and status in ('pending', 'printing');

    if kitchen_was_notified then
      perform private.enqueue_print_job(new.id, 'cancellation', new.updated_by);
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.cancel_print_job(
  p_job_id uuid,
  p_note text default 'Job annullato dalla cassa prima dell’invio'
)
returns public.print_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.print_jobs;
begin
  if private.current_role() not in ('cashier', 'admin') then
    raise exception 'Non autorizzato';
  end if;

  update public.print_jobs
  set status = 'cancelled',
      failed_at = null,
      error_message = null,
      staff_message = p_note,
      technical_error = null,
      verification_required_at = null
  where id = p_job_id
    and status in ('pending', 'failed')
    and printnode_job_id is null
    and submitted_at is null
    and verification_required_at is null
  returning * into result;

  if result.id is null then
    raise exception 'Il job potrebbe essere già stato inviato e non può essere annullato in sicurezza';
  end if;

  -- The initial command represents the whole unprinted order. Retiring only
  -- its job leaves a pending_cashier order visible and blocks close_service().
  if result.job_type = 'new_order' then
    perform private.cancel_order(result.order_id);
  end if;

  perform private.log_order_activity(
    result.order_id,
    'print_job_cancelled',
    jsonb_build_object('print_job_id', result.id, 'note', p_note)
  );
  return result;
end;
$$;

revoke all on function private.enqueue_job_from_order_status()
from public, anon, authenticated;
revoke all on function private.cancel_print_job(uuid, text)
from public, anon, authenticated;
grant execute on function private.cancel_print_job(uuid, text) to authenticated;

-- Repair initial commands that were safely cancelled before this transition
-- became atomic. These are the cards shown as "NUOVA COMANDA - annullata"
-- while their orders are still pending in the cashier dashboard.
update public.orders as target_order
set status = 'cancelled',
    closed_at = coalesce(target_order.closed_at, now())
where target_order.status in ('pending_cashier', 'confirmed')
  and exists (
    select 1
    from public.print_jobs as command_job
    where command_job.order_id = target_order.id
      and command_job.job_type = 'new_order'
      and command_job.status = 'cancelled'
      and command_job.printnode_job_id is null
      and command_job.submitted_at is null
      and command_job.verification_required_at is null
  )
  and not exists (
    select 1
    from public.print_jobs as delivered_job
    where delivered_job.order_id = target_order.id
      and delivered_job.job_type in ('new_order', 'order_update', 'reprint')
      and (
        delivered_job.status in ('printing', 'printed')
        or delivered_job.printnode_job_id is not null
        or delivered_job.submitted_at is not null
      )
  );

commit;
