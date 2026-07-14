begin;

create or replace function public.request_receipt_reprint(
  p_order_id uuid,
  p_action_key uuid,
  p_reason text
)
returns public.print_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_order public.orders;
  source_job public.print_jobs;
  result public.print_jobs;
  stable_key text;
  next_attempt integer;
begin
  if private.current_role() not in ('cashier', 'admin') then
    raise exception 'Non autorizzato';
  end if;
  if p_action_key is null then
    raise exception 'La ristampa richiede una chiave azione';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'La ristampa richiede una motivazione';
  end if;

  select * into target_order
  from public.orders
  where id = p_order_id
  for update;

  if target_order.id is null or target_order.status <> 'closed' then
    raise exception 'Il conto finale è disponibile solo per un tavolo chiuso';
  end if;

  select * into source_job
  from public.print_jobs
  where order_id = p_order_id
    and job_type = 'receipt'
    and status = 'printed'
  order by attempt_number desc, created_at desc
  limit 1;

  if source_job.id is null then
    raise exception 'Conto finale stampato non disponibile';
  end if;

  stable_key := p_order_id::text || ':receipt:retry:' || p_action_key::text;
  select coalesce(max(attempt_number), 0) + 1
  into next_attempt
  from public.print_jobs
  where order_id = p_order_id
    and job_type = 'receipt';

  insert into public.print_jobs(
    order_id,
    job_type,
    idempotency_key,
    status,
    copies,
    labels,
    created_by,
    retry_of_job_id,
    attempt_number,
    retry_requested_by,
    retry_requested_at,
    retry_reason
  )
  values (
    p_order_id,
    'receipt',
    stable_key,
    'pending',
    1,
    '["SCONTRINO"]'::jsonb,
    (select auth.uid()),
    source_job.id,
    greatest(next_attempt, source_job.attempt_number + 1),
    (select auth.uid()),
    now(),
    left(trim(p_reason), 500)
  )
  on conflict (idempotency_key) do nothing
  returning * into result;

  if result.id is null then
    select * into result
    from public.print_jobs
    where idempotency_key = stable_key;
  end if;

  perform private.log_order_activity(
    p_order_id,
    'receipt_reprint_requested',
    jsonb_build_object(
      'print_job_id', result.id,
      'retry_of_job_id', source_job.id,
      'attempt_number', result.attempt_number,
      'reason', left(trim(p_reason), 500)
    )
  );

  return result;
end;
$$;

revoke all on function public.request_receipt_reprint(uuid, uuid, text)
from public, anon;
grant execute on function public.request_receipt_reprint(uuid, uuid, text)
to authenticated;

commit;
