begin;

alter table public.print_jobs
  add column dispatch_token uuid,
  add column dispatch_expires_at timestamptz,
  add constraint print_jobs_dispatch_lease_check check (
    (dispatch_token is null and dispatch_expires_at is null)
    or (dispatch_token is not null and dispatch_expires_at is not null)
  );

create index print_jobs_dispatch_lease_idx
  on public.print_jobs (dispatch_token, dispatch_expires_at)
  where dispatch_token is not null;

-- A browser session may request a print, but only the server-side Supabase
-- secret may attest PrintNode submissions and state changes.
revoke all on function private.apply_printnode_state(uuid, text, text)
from public, anon, authenticated;

revoke all on function public.record_printnode_state(uuid, text, text)
from public, anon, authenticated;
revoke all on function public.record_printnode_submission(uuid, bigint)
from public, anon, authenticated;
revoke all on function public.mark_print_job_uncertain(uuid, text, text)
from public, anon, authenticated;
revoke all on function public.claim_print_job(uuid)
from public, anon, authenticated;
revoke all on function public.flag_stale_print_jobs(integer)
from public, anon, authenticated;

grant usage on schema private to service_role;
grant select on public.orders, public.restaurant_services to service_role;
grant select, update on public.print_jobs to service_role;
grant execute on function private.log_order_activity(uuid, text, jsonb)
to service_role;

-- Obsolete entry points predate the audited print workflow and must not remain
-- callable after receipt and retry state machines have been introduced.
revoke all on function public.mark_printed(uuid)
from public, anon, authenticated;
revoke all on function public.mark_print_job_delivered(uuid)
from public, anon, authenticated;
revoke all on function public.mark_print_job_manual(uuid)
from public, anon, authenticated;
revoke all on function public.request_print(uuid)
from public, anon, authenticated;
revoke all on function public.request_reprint(uuid)
from public, anon, authenticated;

create or replace function private.require_server_actor(p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Operazione riservata al server';
  end if;
  if not exists (
    select 1 from public.profiles where id = p_actor_id and active
  ) then
    raise exception 'Operatore server non valido';
  end if;

  -- Keep the real staff identity in triggers and order_activity while the
  -- database operation itself is authorized by the service role.
  perform set_config('request.jwt.claim.sub', p_actor_id::text, true);
end;
$$;

revoke all on function private.require_server_actor(uuid)
from public, anon, authenticated;
grant execute on function private.require_server_actor(uuid) to service_role;

create or replace function private.apply_printnode_state_server(
  p_job_id uuid,
  p_state text,
  p_message text,
  p_actor_id uuid
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
  perform private.require_server_actor(p_actor_id);

  if nullif(trim(p_state), '') is null or char_length(p_state) > 100 then
    raise exception 'Stato PrintNode non valido';
  end if;

  select status into previous_status
  from public.print_jobs
  where id = p_job_id;

  update public.print_jobs
  set status = case
        when p_state = 'done' then 'printed'::public.print_status
        when p_state in ('error', 'expired') then 'failed'::public.print_status
        else 'printing'::public.print_status
      end,
      printed_at = case
        when p_state = 'done' then coalesce(printed_at, now())
        else printed_at
      end,
      failed_at = case
        when p_state in ('error', 'expired') then now()
        else null
      end,
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
        when p_state in ('error', 'expired')
          then left(coalesce(p_message, 'PrintNode: ' || p_state), 2000)
        else null
      end,
      error_message = case
        when p_state in ('error', 'expired')
          then left(coalesce(p_message, 'PrintNode: ' || p_state), 2000)
        else null
      end,
      dispatch_token = null,
      dispatch_expires_at = null
  where id = p_job_id
    and printnode_job_id is not null
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
        'message', left(p_message, 500)
      )
    );
  end if;

  return result;
end;
$$;

revoke all on function private.apply_printnode_state_server(uuid, text, text, uuid)
from public, anon, authenticated;
grant execute on function private.apply_printnode_state_server(uuid, text, text, uuid)
to service_role;

create or replace function public.record_printnode_state(
  p_job_id uuid,
  p_state text,
  p_message text,
  p_actor_id uuid
)
returns public.print_jobs
language sql
security invoker
set search_path = ''
as $$
  select private.apply_printnode_state_server(
    p_job_id,
    p_state,
    p_message,
    p_actor_id
  );
$$;

revoke all on function public.record_printnode_state(uuid, text, text, uuid)
from public, anon, authenticated;
grant execute on function public.record_printnode_state(uuid, text, text, uuid)
to service_role;

create or replace function private.print_job_is_dispatchable(
  p_job_id uuid,
  p_dispatch_token uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.print_jobs as job
    join public.orders as target_order on target_order.id = job.order_id
    join public.restaurant_services as service on service.id = target_order.service_id
    where job.id = p_job_id
      and job.status = 'printing'
      and job.dispatch_token = p_dispatch_token
      and job.dispatch_expires_at >= now()
      and service.closed_at is null
      and case job.job_type
        when 'new_order' then target_order.status in ('pending_cashier', 'confirmed')
        when 'order_update' then target_order.status in ('confirmed', 'in_preparation', 'bill_requested')
        when 'reprint' then target_order.status in ('confirmed', 'in_preparation', 'bill_requested')
        when 'receipt' then (
          target_order.status in ('in_preparation', 'bill_requested')
          or (
            target_order.status = 'confirmed'
            and exists (
              select 1 from public.print_jobs as original
              where original.order_id = target_order.id
                and original.job_type = 'new_order'
                and original.status = 'printed'
            )
          )
        )
        when 'cancellation' then target_order.status = 'cancelled'
        else false
      end
  );
$$;

revoke all on function private.print_job_is_dispatchable(uuid, uuid)
from public, anon, authenticated;
grant execute on function private.print_job_is_dispatchable(uuid, uuid)
to service_role;

create or replace function public.claim_print_job(
  p_job_id uuid,
  p_dispatch_token uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.print_jobs;
  claimed boolean := false;
begin
  perform private.require_server_actor(p_actor_id);

  update public.print_jobs as job
  set status = 'printing',
      processing_started_at = now(),
      last_attempt_at = now(),
      retry_count = retry_count + 1,
      failed_at = null,
      error_message = null,
      staff_message = null,
      technical_error = null,
      verification_required_at = null,
      manual_fallback = false,
      dispatch_token = p_dispatch_token,
      dispatch_expires_at = now() + interval '2 minutes'
  where job.id = p_job_id
    and job.status = 'pending'
    and exists (
      select 1
      from public.orders as target_order
      join public.restaurant_services as service on service.id = target_order.service_id
      where target_order.id = job.order_id
        and service.closed_at is null
        and case job.job_type
          when 'new_order' then target_order.status in ('pending_cashier', 'confirmed')
          when 'order_update' then target_order.status in ('confirmed', 'in_preparation', 'bill_requested')
          when 'reprint' then target_order.status in ('confirmed', 'in_preparation', 'bill_requested')
          when 'receipt' then (
            target_order.status in ('in_preparation', 'bill_requested')
            or (
              target_order.status = 'confirmed'
              and exists (
                select 1 from public.print_jobs as original
                where original.order_id = target_order.id
                  and original.job_type = 'new_order'
                  and original.status = 'printed'
              )
            )
          )
          when 'cancellation' then target_order.status = 'cancelled'
          else false
        end
    )
  returning job.* into result;

  claimed := result.id is not null;
  if result.id is null then
    select * into result from public.print_jobs where id = p_job_id;
  end if;
  if result.id is null then
    raise exception 'Job di stampa non disponibile';
  end if;

  return jsonb_build_object('job', to_jsonb(result), 'claimed', claimed);
end;
$$;

revoke all on function public.claim_print_job(uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.claim_print_job(uuid, uuid, uuid)
to service_role;

create or replace function public.verify_print_job_dispatch(
  p_job_id uuid,
  p_dispatch_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Operazione riservata al server';
  end if;
  return private.print_job_is_dispatchable(p_job_id, p_dispatch_token);
end;
$$;

revoke all on function public.verify_print_job_dispatch(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.verify_print_job_dispatch(uuid, uuid)
to service_role;

create or replace function public.record_printnode_submission(
  p_job_id uuid,
  p_printnode_job_id bigint,
  p_dispatch_token uuid,
  p_actor_id uuid
)
returns public.print_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.print_jobs;
begin
  perform private.require_server_actor(p_actor_id);
  if p_printnode_job_id <= 0 then
    raise exception 'Identificativo PrintNode non valido';
  end if;

  update public.print_jobs
  set status = 'printing',
      printnode_job_id = coalesce(printnode_job_id, p_printnode_job_id),
      submitted_at = coalesce(submitted_at, now()),
      last_printnode_state = 'new',
      last_state_checked_at = now(),
      verification_required_at = null,
      staff_message = null,
      technical_error = null,
      error_message = null,
      failed_at = null,
      dispatch_token = null,
      dispatch_expires_at = null
  where id = p_job_id
    and status in ('printing', 'failed')
    and dispatch_token = p_dispatch_token
    and (printnode_job_id is null or printnode_job_id = p_printnode_job_id)
  returning * into result;

  if result.id is null then
    raise exception 'Lease di stampa non più valida';
  end if;

  perform private.log_order_activity(
    result.order_id,
    'printnode_submission_recorded',
    jsonb_build_object(
      'print_job_id', result.id,
      'printnode_job_id', result.printnode_job_id,
      'attempt_number', result.attempt_number
    )
  );
  return result;
end;
$$;

revoke all on function public.record_printnode_submission(uuid, bigint, uuid, uuid)
from public, anon, authenticated;
grant execute on function public.record_printnode_submission(uuid, bigint, uuid, uuid)
to service_role;

create or replace function public.release_print_job(
  p_job_id uuid,
  p_dispatch_token uuid,
  p_staff_message text,
  p_technical_error text,
  p_actor_id uuid
)
returns public.print_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare result public.print_jobs;
begin
  perform private.require_server_actor(p_actor_id);
  update public.print_jobs
  set status = 'pending',
      processing_started_at = null,
      dispatch_token = null,
      dispatch_expires_at = null,
      staff_message = left(p_staff_message, 500),
      technical_error = left(p_technical_error, 2000),
      error_message = null,
      failed_at = null
  where id = p_job_id
    and status = 'printing'
    and dispatch_token = p_dispatch_token
    and printnode_job_id is null
    and submitted_at is null
  returning * into result;
  if result.id is null then
    raise exception 'Lease di stampa non più valida';
  end if;
  return result;
end;
$$;

revoke all on function public.release_print_job(uuid, uuid, text, text, uuid)
from public, anon, authenticated;
grant execute on function public.release_print_job(uuid, uuid, text, text, uuid)
to service_role;

create or replace function public.fail_print_job(
  p_job_id uuid,
  p_dispatch_token uuid,
  p_staff_message text,
  p_technical_error text,
  p_actor_id uuid
)
returns public.print_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare result public.print_jobs;
begin
  perform private.require_server_actor(p_actor_id);
  update public.print_jobs
  set status = 'failed',
      dispatch_token = null,
      dispatch_expires_at = null,
      staff_message = left(p_staff_message, 500),
      technical_error = left(p_technical_error, 2000),
      error_message = left(p_technical_error, 2000),
      failed_at = now()
  where id = p_job_id
    and status = 'printing'
    and dispatch_token = p_dispatch_token
  returning * into result;
  if result.id is null then
    raise exception 'Lease di stampa non più valida';
  end if;
  return result;
end;
$$;

revoke all on function public.fail_print_job(uuid, uuid, text, text, uuid)
from public, anon, authenticated;
grant execute on function public.fail_print_job(uuid, uuid, text, text, uuid)
to service_role;

create or replace function public.mark_print_job_uncertain(
  p_job_id uuid,
  p_dispatch_token uuid,
  p_staff_message text,
  p_technical_error text,
  p_actor_id uuid
)
returns public.print_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare result public.print_jobs;
begin
  perform private.require_server_actor(p_actor_id);
  update public.print_jobs
  set status = 'printing',
      dispatch_token = null,
      dispatch_expires_at = null,
      verification_required_at = coalesce(verification_required_at, now()),
      staff_message = left(p_staff_message, 500),
      technical_error = left(p_technical_error, 2000),
      error_message = null,
      failed_at = null
  where id = p_job_id
    and status in ('printing', 'failed')
    and dispatch_token = p_dispatch_token
  returning * into result;
  if result.id is null then
    raise exception 'Lease di stampa non più valida';
  end if;
  perform private.log_order_activity(
    result.order_id,
    'print_state_requires_verification',
    jsonb_build_object(
      'print_job_id', result.id,
      'printnode_job_id', result.printnode_job_id,
      'technical_error', left(p_technical_error, 500)
    )
  );
  return result;
end;
$$;

revoke all on function public.mark_print_job_uncertain(uuid, uuid, text, text, uuid)
from public, anon, authenticated;
grant execute on function public.mark_print_job_uncertain(uuid, uuid, text, text, uuid)
to service_role;

create or replace function public.flag_stale_print_jobs(
  p_minutes integer,
  p_actor_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare affected integer;
begin
  perform private.require_server_actor(p_actor_id);
  if p_minutes < 1 or p_minutes > 60 then
    raise exception 'Timeout di verifica non valido';
  end if;

  update public.print_jobs
  set verification_required_at = coalesce(verification_required_at, now()),
      staff_message = coalesce(
        staff_message,
        'Nessun aggiornamento recente: verificare la stampante prima di ristampare'
      )
  where status = 'printing'
    and verification_required_at is null
    and coalesce(submitted_at, last_attempt_at, processing_started_at, created_at)
      < now() - make_interval(mins => p_minutes);

  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.flag_stale_print_jobs(integer, uuid)
from public, anon, authenticated;
grant execute on function public.flag_stale_print_jobs(integer, uuid)
to service_role;

-- Direct UPDATEs to print state are denied. The small set of audited user RPCs
-- delegates to SECURITY DEFINER implementations kept outside the exposed
-- public schema; each implementation still checks the authenticated staff role.
drop policy print_jobs_waiter_automatic_update on public.print_jobs;
drop policy print_jobs_cashier_update on public.print_jobs;

alter function public.confirm_print_job_manual(uuid, text) set schema private;
alter function public.confirm_table_print_jobs(uuid, uuid[], text) set schema private;
alter function public.cancel_print_job(uuid, text) set schema private;
alter function public.confirm_receipt_manual_and_close(uuid, bigint, text) set schema private;
alter function public.cancel_order(uuid) set schema private;
alter function public.close_service(uuid, boolean, text) set schema private;

alter function private.confirm_print_job_manual(uuid, text) security definer;
alter function private.confirm_table_print_jobs(uuid, uuid[], text) security definer;
alter function private.cancel_print_job(uuid, text) security definer;
alter function private.confirm_receipt_manual_and_close(uuid, bigint, text) security definer;
alter function private.cancel_order(uuid) security definer;
alter function private.close_service(uuid, boolean, text) security definer;

revoke all on function private.confirm_print_job_manual(uuid, text)
from public, anon, authenticated;
revoke all on function private.confirm_table_print_jobs(uuid, uuid[], text)
from public, anon, authenticated;
revoke all on function private.cancel_print_job(uuid, text)
from public, anon, authenticated;
revoke all on function private.confirm_receipt_manual_and_close(uuid, bigint, text)
from public, anon, authenticated;
revoke all on function private.cancel_order(uuid)
from public, anon, authenticated;
revoke all on function private.close_service(uuid, boolean, text)
from public, anon, authenticated;

grant execute on function private.confirm_print_job_manual(uuid, text) to authenticated;
grant execute on function private.confirm_table_print_jobs(uuid, uuid[], text) to authenticated;
grant execute on function private.cancel_print_job(uuid, text) to authenticated;
grant execute on function private.confirm_receipt_manual_and_close(uuid, bigint, text) to authenticated;
grant execute on function private.cancel_order(uuid) to authenticated;
grant execute on function private.close_service(uuid, boolean, text) to authenticated;

create function public.confirm_print_job_manual(p_job_id uuid, p_note text)
returns public.print_jobs
language sql
security invoker
set search_path = ''
as $$
  select private.confirm_print_job_manual(p_job_id, p_note);
$$;

create function public.confirm_table_print_jobs(
  p_order_id uuid,
  p_job_ids uuid[],
  p_note text
)
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.confirm_table_print_jobs(p_order_id, p_job_ids, p_note);
$$;

create function public.cancel_print_job(
  p_job_id uuid,
  p_note text default 'Job annullato dalla cassa prima dell’invio'
)
returns public.print_jobs
language sql
security invoker
set search_path = ''
as $$
  select private.cancel_print_job(p_job_id, p_note);
$$;

create function public.confirm_receipt_manual_and_close(
  p_job_id uuid,
  p_expected_version bigint,
  p_note text
)
returns public.orders
language sql
security invoker
set search_path = ''
as $$
  select private.confirm_receipt_manual_and_close(
    p_job_id,
    p_expected_version,
    p_note
  );
$$;

create function public.cancel_order(p_order_id uuid)
returns public.orders
language sql
security invoker
set search_path = ''
as $$
  select private.cancel_order(p_order_id);
$$;

create function public.close_service(
  p_service_id uuid,
  p_force boolean default false,
  p_reason text default null
)
returns public.restaurant_services
language sql
security invoker
set search_path = ''
as $$
  select private.close_service(p_service_id, p_force, p_reason);
$$;

revoke all on function public.confirm_print_job_manual(uuid, text)
from public, anon, authenticated;
revoke all on function public.confirm_table_print_jobs(uuid, uuid[], text)
from public, anon, authenticated;
revoke all on function public.cancel_print_job(uuid, text)
from public, anon, authenticated;
revoke all on function public.confirm_receipt_manual_and_close(uuid, bigint, text)
from public, anon, authenticated;
revoke all on function public.cancel_order(uuid)
from public, anon, authenticated;
revoke all on function public.close_service(uuid, boolean, text)
from public, anon, authenticated;

grant execute on function public.confirm_print_job_manual(uuid, text) to authenticated;
grant execute on function public.confirm_table_print_jobs(uuid, uuid[], text) to authenticated;
grant execute on function public.cancel_print_job(uuid, text) to authenticated;
grant execute on function public.confirm_receipt_manual_and_close(uuid, bigint, text) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
grant execute on function public.close_service(uuid, boolean, text) to authenticated;

-- Waiters only see and mutate dine-in data. Takeaway remains a cashier/admin
-- concern at the database boundary, independently of page routing.
drop policy orders_staff_select on public.orders;
create policy orders_staff_select
on public.orders
for select
to authenticated
using (
  private.is_active_staff()
  and (
    private.current_role() in ('cashier', 'admin')
    or (order_type = 'dine_in' and status <> 'closed')
  )
);

drop policy activity_staff_select on public.order_activity;
create policy activity_staff_select
on public.order_activity
for select
to authenticated
using (
  private.is_active_staff()
  and (
    private.current_role() in ('cashier', 'admin')
    or exists (
      select 1 from public.orders as target_order
      where target_order.id = order_id
        and target_order.order_type = 'dine_in'
        and target_order.status <> 'closed'
    )
  )
);

drop policy order_items_staff_select on public.order_items;
drop policy order_items_staff_insert on public.order_items;
drop policy order_items_staff_update on public.order_items;
drop policy order_items_staff_delete on public.order_items;

create policy order_items_staff_select
on public.order_items
for select
to authenticated
using (
  private.is_active_staff()
  and exists (
    select 1 from public.orders as target_order
    where target_order.id = order_id
      and (
        target_order.order_type = 'dine_in'
        or private.current_role() in ('cashier', 'admin')
      )
  )
);

create policy order_items_staff_insert
on public.order_items
for insert
to authenticated
with check (
  private.is_active_staff()
  and exists (
    select 1 from public.orders as target_order
    where target_order.id = order_id
      and target_order.status in ('draft', 'pending_cashier', 'confirmed', 'in_preparation', 'bill_requested')
      and (
        target_order.order_type = 'dine_in'
        or private.current_role() in ('cashier', 'admin')
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
    select 1 from public.orders as target_order
    where target_order.id = order_id
      and target_order.status in ('draft', 'pending_cashier', 'confirmed', 'in_preparation', 'bill_requested')
      and (
        target_order.order_type = 'dine_in'
        or private.current_role() in ('cashier', 'admin')
      )
  )
)
with check (
  private.is_active_staff()
  and exists (
    select 1 from public.orders as target_order
    where target_order.id = order_id
      and target_order.status in ('draft', 'pending_cashier', 'confirmed', 'in_preparation', 'bill_requested')
      and (
        target_order.order_type = 'dine_in'
        or private.current_role() in ('cashier', 'admin')
      )
  )
);

create policy order_items_staff_delete
on public.order_items
for delete
to authenticated
using (
  private.is_active_staff()
  and exists (
    select 1 from public.orders as target_order
    where target_order.id = order_id
      and target_order.status in ('draft', 'pending_cashier', 'confirmed', 'in_preparation', 'bill_requested')
      and (
        target_order.order_type = 'dine_in'
        or private.current_role() in ('cashier', 'admin')
      )
  )
);

drop policy order_extras_staff_select on public.order_item_extras;
drop policy order_extras_staff_write on public.order_item_extras;

create policy order_extras_staff_select
on public.order_item_extras
for select
to authenticated
using (
  private.is_active_staff()
  and exists (
    select 1
    from public.order_items as item
    join public.orders as target_order on target_order.id = item.order_id
    where item.id = order_item_id
      and (
        target_order.order_type = 'dine_in'
        or private.current_role() in ('cashier', 'admin')
      )
  )
);

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
      and target_order.status in ('draft', 'pending_cashier', 'confirmed', 'in_preparation', 'bill_requested')
      and (
        target_order.order_type = 'dine_in'
        or private.current_role() in ('cashier', 'admin')
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
      and target_order.status in ('draft', 'pending_cashier', 'confirmed', 'in_preparation', 'bill_requested')
      and (
        target_order.order_type = 'dine_in'
        or private.current_role() in ('cashier', 'admin')
      )
  )
);

drop policy print_jobs_staff_select on public.print_jobs;
create policy print_jobs_staff_select
on public.print_jobs
for select
to authenticated
using (
  private.is_active_staff()
  and (
    private.current_role() in ('cashier', 'admin')
    or exists (
      select 1 from public.orders as target_order
      where target_order.id = order_id
        and target_order.order_type = 'dine_in'
        and target_order.status <> 'closed'
    )
  )
);

-- Serialize creation with close_service(), which locks the same service row.
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
  from public.restaurant_services
  where closed_at is null
  limit 1
  for update;

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
  if not coalesce(private.current_role() in ('cashier', 'admin'), false) then
    raise exception 'Solo Cassa e Admin possono creare asporti';
  end if;

  normalized_name := trim(coalesce(p_customer_name, ''));
  if char_length(normalized_name) < 1 or char_length(normalized_name) > 80 then
    raise exception 'Inserisci un nome cliente valido';
  end if;
  if p_pickup_at is null then
    raise exception 'Inserisci l''ora di ritiro';
  end if;

  select * into current_service
  from public.restaurant_services
  where closed_at is null
  limit 1
  for update;

  if current_service.id is null then
    raise exception 'Nessun servizio aperto. Chiedi alla cassa di iniziare il servizio';
  end if;
  if current_service.period = 'recupero'
    or current_service.business_date <> (now() at time zone 'Europe/Rome')::date
  then
    raise exception 'Il servizio precedente deve essere chiuso dalla cassa';
  end if;
  if (p_pickup_at at time zone 'Europe/Rome')::date <> current_service.business_date then
    raise exception 'L''orario di ritiro deve appartenere al servizio di oggi';
  end if;

  insert into public.orders(
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

-- Refuse order cancellation while a submission is inside the only unsafe
-- window: claimed locally but not yet identified by PrintNode.
create or replace function private.guard_order_cancellation_during_dispatch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status <> 'cancelled' and new.status = 'cancelled'
    and exists (
      select 1 from public.print_jobs
      where order_id = new.id
        and job_type <> 'cancellation'
        and status = 'printing'
        and printnode_job_id is null
        and submitted_at is null
    )
  then
    raise exception 'Stampa in corso: attendi l''esito prima di annullare l''ordine';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_order_cancellation_during_dispatch()
from public, anon, authenticated;

create trigger orders_guard_cancellation_dispatch
before update of status on public.orders
for each row execute function private.guard_order_cancellation_during_dispatch();

create or replace function private.clear_finished_dispatch_lease()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status <> 'printing' then
    new.dispatch_token = null;
    new.dispatch_expires_at = null;
  end if;
  return new;
end;
$$;

revoke all on function private.clear_finished_dispatch_lease()
from public, anon, authenticated;

create trigger print_jobs_clear_finished_dispatch_lease
before update of status on public.print_jobs
for each row execute function private.clear_finished_dispatch_lease();

commit;
