begin;

alter table public.print_jobs
  add column manually_confirmed boolean not null default false,
  add column manual_confirmed_at timestamptz,
  add column manual_confirmed_by uuid references public.profiles(id) on delete set null,
  add column manual_confirmation_note text,
  add column verification_required_at timestamptz,
  add column last_printnode_state text,
  add column last_state_checked_at timestamptz,
  add column staff_message text,
  add column technical_error text,
  add column retry_of_job_id uuid references public.print_jobs(id) on delete set null,
  add column attempt_number integer not null default 1 check (attempt_number > 0),
  add column retry_requested_by uuid references public.profiles(id) on delete set null,
  add column retry_requested_at timestamptz,
  add column retry_reason text;

update public.print_jobs
set manually_confirmed = manual_fallback,
    manual_confirmed_at = case when manual_fallback then printed_at end,
    manual_confirmed_by = case when manual_fallback then created_by end,
    manual_confirmation_note = case
      when manual_fallback
      then 'Conferma manuale registrata prima dell’introduzione dell’audit dettagliato'
    end,
    last_printnode_state = case
      when status = 'printed' and not manual_fallback and printnode_job_id is not null
      then 'done'
    end,
    last_state_checked_at = case
      when status = 'printed' and not manual_fallback and printnode_job_id is not null
      then updated_at
    end,
    staff_message = case
      when status = 'failed' and printnode_job_id is null
      then 'Invio alla stampante non riuscito'
      when status = 'failed'
      then 'La stampa richiede una verifica'
    end,
    technical_error = case when status = 'failed' then error_message end;

-- A collision with an id PrintNode già salvato prova che il job era stato
-- accettato. Non deve restare "failed" né essere inviato di nuovo.
update public.print_jobs
set status = 'printing',
    verification_required_at = coalesce(verification_required_at, now()),
    staff_message = 'Richiesta già ricevuta da PrintNode: verificare il foglio prima di ristampare',
    technical_error = error_message,
    error_message = null,
    failed_at = null
where status = 'failed'
  and printnode_job_id is not null
  and error_message ilike 'Idempotency key collision:%';

drop index if exists public.print_jobs_singleton_type_key;

create unique index print_jobs_singleton_type_key
  on public.print_jobs (order_id, job_type)
  where retry_of_job_id is null
    and job_type in ('new_order', 'cancellation');

create index print_jobs_retry_of_idx
  on public.print_jobs(retry_of_job_id, created_at desc)
  where retry_of_job_id is not null;

create index print_jobs_verification_idx
  on public.print_jobs(verification_required_at, updated_at desc)
  where verification_required_at is not null
    and status = 'printing';

create or replace function private.print_job_origin_type(p_job_id uuid)
returns public.print_job_type
language sql
stable
security definer
set search_path = ''
as $$
  with recursive lineage as (
    select id, job_type, retry_of_job_id, 0 as depth
    from public.print_jobs
    where id = p_job_id

    union all

    select parent.id, parent.job_type, parent.retry_of_job_id, lineage.depth + 1
    from public.print_jobs as parent
    join lineage on lineage.retry_of_job_id = parent.id
    where lineage.depth < 20
  )
  select job_type
  from lineage
  order by depth desc
  limit 1;
$$;

revoke execute on function private.print_job_origin_type(uuid)
from public, anon, authenticated;

create or replace function private.is_retry_parent_for_order(
  p_parent_job_id uuid,
  p_order_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.print_jobs
    where id = p_parent_job_id
      and order_id = p_order_id
  );
$$;

revoke execute on function private.is_retry_parent_for_order(uuid, uuid)
from public, anon, authenticated;
grant execute on function private.print_job_origin_type(uuid) to authenticated;
grant execute on function private.is_retry_parent_for_order(uuid, uuid) to authenticated;

drop policy print_jobs_cashier_insert on public.print_jobs;

create policy print_jobs_cashier_insert on public.print_jobs for insert to authenticated
with check (
  private.current_role() in ('cashier', 'admin')
  and created_by = (select auth.uid())
  and job_type = 'reprint'
  and status = 'pending'
  and copies = 3
  and (
    idempotency_key = order_id::text || ':reprint'
    or idempotency_key like order_id::text || ':reprint:%'
  )
  and (
    retry_of_job_id is null
    or private.is_retry_parent_for_order(retry_of_job_id, order_id)
  )
);

create or replace function public.request_reprint(
  p_order_id uuid,
  p_action_key uuid,
  p_reason text default 'Ristampa richiesta dalla cassa'
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
    3,
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

create or replace function public.request_print_retry(
  p_job_id uuid,
  p_action_key uuid,
  p_reason text
)
returns public.print_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_job public.print_jobs;
  result public.print_jobs;
  stable_key text;
  next_attempt integer;
begin
  if private.current_role() not in ('cashier', 'admin') then
    raise exception 'Non autorizzato';
  end if;

  select *
  into source_job
  from public.print_jobs
  where id = p_job_id;

  if source_job.id is null then
    raise exception 'Job di stampa non disponibile';
  end if;

  if source_job.status not in ('printing', 'failed') then
    raise exception 'Il job non è in uno stato che consente il retry';
  end if;

  stable_key := source_job.order_id::text || ':reprint:' || p_action_key::text;

  select coalesce(max(attempt_number), 0) + 1
  into next_attempt
  from public.print_jobs
  where id = source_job.id
     or retry_of_job_id = source_job.id
     or retry_of_job_id = source_job.retry_of_job_id;

  insert into public.print_jobs (
    order_id,
    job_type,
    idempotency_key,
    status,
    copies,
    created_by,
    retry_of_job_id,
    attempt_number,
    retry_requested_by,
    retry_requested_at,
    retry_reason
  )
  values (
    source_job.order_id,
    'reprint',
    stable_key,
    'pending',
    source_job.copies,
    (select auth.uid()),
    source_job.id,
    greatest(next_attempt, source_job.attempt_number + 1),
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
    source_job.order_id,
    'print_retry_requested',
    jsonb_build_object(
      'print_job_id', result.id,
      'retry_of_job_id', source_job.id,
      'action_key', p_action_key,
      'attempt_number', result.attempt_number,
      'reason', p_reason
    )
  );
  return result;
end;
$$;

create or replace function public.record_printnode_submission(
  p_job_id uuid,
  p_printnode_job_id bigint
)
returns public.print_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.print_jobs;
begin
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
      failed_at = null
  where id = p_job_id
    and status in ('printing', 'failed')
    and (printnode_job_id is null or printnode_job_id = p_printnode_job_id)
  returning * into result;

  if result.id is null then
    raise exception 'Impossibile registrare l’invio PrintNode';
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
declare
  result public.print_jobs;
  previous_status public.print_status;
begin
  if private.current_role() not in ('cashier', 'admin') then
    raise exception 'Non autorizzato';
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
        when p_state in ('error', 'expired') then coalesce(p_message, 'PrintNode: ' || p_state)
        else null
      end,
      error_message = case
        when p_state in ('error', 'expired') then coalesce(p_message, 'PrintNode: ' || p_state)
        else null
      end
  where id = p_job_id
    and status in ('printing', 'failed')
  returning * into result;

  if result.id is null then
    select * into result
    from public.print_jobs
    where id = p_job_id;
  end if;

  if result.id is null then
    raise exception 'Job di stampa non disponibile';
  end if;

  if p_state = 'done'
    and private.print_job_origin_type(result.id) = 'new_order'
  then
    update public.orders
    set status = 'in_preparation'
    where id = result.order_id
      and status in ('pending_cashier', 'confirmed');
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

create or replace function public.mark_print_job_uncertain(
  p_job_id uuid,
  p_staff_message text,
  p_technical_error text default null
)
returns public.print_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.print_jobs;
begin
  update public.print_jobs
  set status = 'printing',
      verification_required_at = coalesce(verification_required_at, now()),
      staff_message = p_staff_message,
      technical_error = p_technical_error,
      error_message = null,
      failed_at = null
  where id = p_job_id
    and status in ('printing', 'failed')
  returning * into result;

  if result.id is null then
    raise exception 'Job di stampa non disponibile';
  end if;

  perform private.log_order_activity(
    result.order_id,
    'print_state_requires_verification',
    jsonb_build_object(
      'print_job_id', result.id,
      'printnode_job_id', result.printnode_job_id,
      'technical_error', p_technical_error
    )
  );
  return result;
end;
$$;

create or replace function public.flag_stale_print_jobs(p_minutes integer default 2)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  affected integer;
begin
  if private.current_role() not in ('cashier', 'admin') then
    raise exception 'Non autorizzato';
  end if;

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

create or replace function public.confirm_print_job_manual(
  p_job_id uuid,
  p_note text
)
returns public.print_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.print_jobs;
begin
  if private.current_role() not in ('cashier', 'admin') then
    raise exception 'Non autorizzato';
  end if;

  update public.print_jobs
  set status = 'printed',
      printed_at = coalesce(printed_at, now()),
      failed_at = null,
      error_message = null,
      staff_message = null,
      technical_error = null,
      verification_required_at = null,
      manually_confirmed = true,
      manual_fallback = true,
      manual_confirmed_at = now(),
      manual_confirmed_by = (select auth.uid()),
      manual_confirmation_note = coalesce(
        nullif(trim(p_note), ''),
        'Confermato manualmente dalla cassa perché stampato fisicamente ma stato non aggiornato'
      )
  where id = p_job_id
    and status in ('pending', 'printing', 'failed')
  returning * into result;

  if result.id is null then
    raise exception 'Job già completato o non disponibile';
  end if;

  if private.print_job_origin_type(result.id) = 'new_order' then
    update public.orders
    set status = 'in_preparation'
    where id = result.order_id
      and status in ('pending_cashier', 'confirmed');
  end if;

  perform private.log_order_activity(
    result.order_id,
    'manual_print_confirmed',
    jsonb_build_object(
      'print_job_id', result.id,
      'job_type', result.job_type,
      'confirmed_by', result.manual_confirmed_by,
      'note', result.manual_confirmation_note
    )
  );
  return result;
end;
$$;

create or replace function public.mark_print_job_manual(p_job_id uuid)
returns public.print_jobs
language sql
security invoker
set search_path = ''
as $$
  select public.confirm_print_job_manual(
    p_job_id,
    'Confermato manualmente dalla cassa perché stampato fisicamente ma stato non aggiornato'
  );
$$;

create or replace function public.confirm_table_print_jobs(
  p_order_id uuid,
  p_job_ids uuid[],
  p_note text
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_id uuid;
  confirmed_count integer := 0;
begin
  if private.current_role() not in ('cashier', 'admin') then
    raise exception 'Non autorizzato';
  end if;

  if coalesce(array_length(p_job_ids, 1), 0) = 0 then
    raise exception 'Nessun job selezionato';
  end if;

  foreach target_id in array p_job_ids
  loop
    if exists (
      select 1
      from public.print_jobs
      where id = target_id
        and order_id = p_order_id
        and status in ('printing', 'failed')
    ) then
      perform public.confirm_print_job_manual(target_id, p_note);
      confirmed_count := confirmed_count + 1;
    end if;
  end loop;

  if confirmed_count = 0 then
    raise exception 'Nessun job da confermare per questo tavolo';
  end if;

  return confirmed_count;
end;
$$;

create or replace function public.cancel_print_job(
  p_job_id uuid,
  p_note text default 'Job annullato dalla cassa prima dell’invio'
)
returns public.print_jobs
language plpgsql
security invoker
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

  perform private.log_order_activity(
    result.order_id,
    'print_job_cancelled',
    jsonb_build_object('print_job_id', result.id, 'note', p_note)
  );
  return result;
end;
$$;

grant insert (
  retry_of_job_id,
  attempt_number,
  retry_requested_by,
  retry_requested_at,
  retry_reason
) on public.print_jobs to authenticated;

grant update (
  manually_confirmed,
  manual_confirmed_at,
  manual_confirmed_by,
  manual_confirmation_note,
  verification_required_at,
  last_printnode_state,
  last_state_checked_at,
  staff_message,
  technical_error
) on public.print_jobs to authenticated;

revoke all on function public.request_reprint(uuid, uuid, text) from public;
revoke all on function public.request_print_retry(uuid, uuid, text) from public;
revoke all on function public.record_printnode_submission(uuid, bigint) from public;
revoke all on function public.record_printnode_state(uuid, text, text) from public;
revoke all on function public.mark_print_job_uncertain(uuid, text, text) from public;
revoke all on function public.flag_stale_print_jobs(integer) from public;
revoke all on function public.confirm_print_job_manual(uuid, text) from public;
revoke all on function public.confirm_table_print_jobs(uuid, uuid[], text) from public;
revoke all on function public.cancel_print_job(uuid, text) from public;

grant execute on function public.request_reprint(uuid, uuid, text) to authenticated;
grant execute on function public.request_print_retry(uuid, uuid, text) to authenticated;
grant execute on function public.record_printnode_submission(uuid, bigint) to authenticated;
grant execute on function public.record_printnode_state(uuid, text, text) to authenticated;
grant execute on function public.mark_print_job_uncertain(uuid, text, text) to authenticated;
grant execute on function public.flag_stale_print_jobs(integer) to authenticated;
grant execute on function public.confirm_print_job_manual(uuid, text) to authenticated;
grant execute on function public.confirm_table_print_jobs(uuid, uuid[], text) to authenticated;
grant execute on function public.cancel_print_job(uuid, text) to authenticated;

commit;
