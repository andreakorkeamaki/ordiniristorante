begin;

-- One deterministic settings row. Existing installations keep the oldest row.
delete from public.restaurant_settings
where id not in (
  select id
  from public.restaurant_settings
  order by created_at, id
  limit 1
);

create unique index if not exists restaurant_settings_singleton_idx
  on public.restaurant_settings ((true));

update public.restaurant_settings
set default_print_copies = 3,
    dine_in_print_copies = 3,
    takeaway_print_copies = 3;

alter table public.restaurant_settings
  drop constraint if exists restaurant_settings_dine_in_print_copies_check,
  drop constraint if exists restaurant_settings_takeaway_print_copies_check,
  add constraint restaurant_settings_dine_in_print_copies_check
    check (dine_in_print_copies = 3),
  add constraint restaurant_settings_takeaway_print_copies_check
    check (takeaway_print_copies = 3);

-- Normalize historical metadata before making copies a real invariant.
update public.print_jobs
set copies = 3
where job_type <> 'receipt'
  and copies <> 3;

alter table public.print_jobs
  drop constraint if exists print_jobs_copies_check,
  drop constraint if exists print_jobs_three_copies_check,
  add constraint print_jobs_copies_match_type_check
    check (
      (job_type = 'receipt' and copies = 1)
      or (job_type <> 'receipt' and copies = 3)
    );

create unique index if not exists print_jobs_one_receipt_per_order_idx
  on public.print_jobs(order_id)
  where job_type = 'receipt' and retry_of_job_id is null;

create index if not exists print_jobs_operational_queue_idx
  on public.print_jobs(status, created_at)
  where status in ('pending', 'printing', 'failed');

alter table public.restaurant_services
  add column if not exists forced_close boolean not null default false,
  add column if not exists forced_close_reason text;

alter table public.orders
  drop constraint if exists orders_general_notes_length_check,
  add constraint orders_general_notes_length_check
    check (char_length(general_notes) <= 500) not valid;

alter table public.order_items
  drop constraint if exists order_items_notes_length_check,
  add constraint order_items_notes_length_check
    check (char_length(notes) <= 300) not valid;

alter table public.orders
  drop constraint if exists orders_takeaway_name_length_check,
  add constraint orders_takeaway_name_length_check
    check (takeaway_name is null or char_length(takeaway_name) <= 80) not valid;

alter table public.menu_categories
  drop constraint if exists menu_categories_name_length_check,
  add constraint menu_categories_name_length_check
    check (char_length(name) <= 120) not valid;

alter table public.menu_items
  drop constraint if exists menu_items_ticket_text_length_check,
  add constraint menu_items_ticket_text_length_check
    check (
      char_length(name) <= 120
      and (ingredients is null or char_length(ingredients) <= 500)
    ) not valid;

alter table public.menu_extras
  drop constraint if exists menu_extras_name_length_check,
  add constraint menu_extras_name_length_check
    check (char_length(name) <= 120) not valid;

alter table public.print_jobs
  drop constraint if exists print_jobs_staff_message_length_check,
  drop constraint if exists print_jobs_retry_reason_length_check,
  drop constraint if exists print_jobs_manual_note_length_check,
  add constraint print_jobs_staff_message_length_check
    check (staff_message is null or char_length(staff_message) <= 500) not valid,
  add constraint print_jobs_retry_reason_length_check
    check (retry_reason is null or char_length(retry_reason) <= 500) not valid,
  add constraint print_jobs_manual_note_length_check
    check (
      manual_confirmation_note is null
      or char_length(manual_confirmation_note) <= 500
    ) not valid;

create or replace function public.set_order_item_notes(
  p_item_id uuid,
  p_notes text,
  p_expected_version bigint
)
returns public.order_items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.order_items;
  normalized_notes text := coalesce(p_notes, '');
begin
  if char_length(normalized_notes) > 300 then
    raise exception 'La nota riga non può superare 300 caratteri';
  end if;

  update public.order_items
  set notes = normalized_notes
  where id = p_item_id
    and version = p_expected_version
  returning * into result;

  if result.id is null then
    raise exception 'Conflitto: riga modificata da un altro utente';
  end if;
  return result;
end;
$$;

create or replace function public.set_order_details(
  p_order_id uuid,
  p_cover_count integer,
  p_general_notes text,
  p_expected_version bigint
)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.orders;
  normalized_notes text := coalesce(p_general_notes, '');
begin
  if char_length(normalized_notes) > 500 then
    raise exception 'La nota ordine non può superare 500 caratteri';
  end if;

  update public.orders
  set cover_count = p_cover_count,
      general_notes = normalized_notes
  where id = p_order_id
    and version = p_expected_version
  returning * into result;

  if result.id is null then
    raise exception 'Conflitto: ordine modificato da un altro utente';
  end if;
  return result;
end;
$$;

create or replace function public.reorder_menu_categories(p_category_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  category_count integer;
  requested_count integer := coalesce(cardinality(p_category_ids), 0);
begin
  if private.current_role() is distinct from 'admin' then
    raise exception 'Solo l''amministratore può riordinare le categorie';
  end if;

  select count(*) into category_count from public.menu_categories;
  if requested_count <> category_count then
    raise exception 'Il riordino deve includere tutte le categorie';
  end if;
  if (
    select count(distinct category_id)
    from unnest(p_category_ids) as requested(category_id)
  ) <> requested_count then
    raise exception 'Il riordino contiene categorie duplicate';
  end if;
  if exists (
    select 1
    from unnest(p_category_ids) as requested(category_id)
    left join public.menu_categories as category on category.id = requested.category_id
    where category.id is null
  ) then
    raise exception 'Categoria non disponibile';
  end if;

  update public.menu_categories as category
  set sort_order = requested.position - 1
  from unnest(p_category_ids) with ordinality as requested(category_id, position)
  where category.id = requested.category_id;
end;
$$;

drop policy if exists print_jobs_cashier_insert on public.print_jobs;
create policy print_jobs_cashier_insert on public.print_jobs for insert to authenticated
with check (
  private.is_active_staff()
  and created_by = (select auth.uid())
  and status = 'pending'
  and (
    (
      job_type = 'receipt'
      and private.current_role() in ('cashier', 'admin')
      and copies = 1
      and (
        (
          retry_of_job_id is null
          and idempotency_key = order_id::text || ':receipt'
        )
        or (
          retry_of_job_id is not null
          and idempotency_key like order_id::text || ':receipt:retry:%'
          and private.is_retry_parent_for_order(retry_of_job_id, order_id)
        )
      )
    )
    or (
      job_type = 'reprint'
      and copies = 3
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
              and target_order.status in ('confirmed', 'in_preparation', 'bill_requested')
          )
        )
      )
      and (
        retry_of_job_id is null
        or private.is_retry_parent_for_order(retry_of_job_id, order_id)
      )
    )
  )
);

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
  if target_order.status not in ('in_preparation', 'bill_requested') then
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
          and target_order.status in ('in_preparation', 'bill_requested')
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

create or replace function public.request_receipt_retry(
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
  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'Il retry richiede una motivazione';
  end if;

  select * into source_job
  from public.print_jobs
  where id = p_job_id
    and job_type = 'receipt'
  for update;

  if source_job.id is null then
    raise exception 'Job scontrino non disponibile';
  end if;
  if source_job.status not in ('printing', 'failed') then
    raise exception 'Lo scontrino non è in uno stato che consente il retry';
  end if;

  stable_key := source_job.order_id::text || ':receipt:retry:' || p_action_key::text;
  select coalesce(max(attempt_number), 0) + 1
  into next_attempt
  from public.print_jobs
  where order_id = source_job.order_id
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
    source_job.order_id,
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
    source_job.order_id,
    'receipt_retry_requested',
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

drop function if exists public.close_order(uuid);
create function public.close_order(
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
    and status in ('in_preparation', 'bill_requested')
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

create or replace function public.confirm_receipt_manual_and_close(
  p_job_id uuid,
  p_expected_version bigint,
  p_note text
)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_job public.print_jobs;
  result public.orders;
begin
  if private.current_role() not in ('cashier', 'admin') then
    raise exception 'Non autorizzato';
  end if;
  if char_length(trim(coalesce(p_note, ''))) < 10 then
    raise exception 'Inserisci una conferma manuale esplicita';
  end if;

  select * into target_job
  from public.print_jobs
  where id = p_job_id and job_type = 'receipt'
  for update;

  if target_job.id is null then
    raise exception 'Job scontrino non disponibile';
  end if;
  if target_job.status <> 'printed' then
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
        manual_confirmation_note = left(trim(p_note), 500)
    where id = target_job.id
      and status in ('pending', 'printing', 'failed');

    if not found then
      raise exception 'Lo scontrino non può essere confermato in questo stato';
    end if;
  end if;

  select *
  into result
  from public.close_order(target_job.order_id, p_expected_version);

  perform private.log_order_activity(
    target_job.order_id,
    'receipt_manual_fallback_confirmed',
    jsonb_build_object(
      'print_job_id', target_job.id,
      'note', left(trim(p_note), 500)
    )
  );
  return result;
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
  if exists (
    select 1
    from public.print_jobs
    where id = p_job_id and job_type = 'receipt'
  ) then
    raise exception 'Usa la conferma scontrino atomica per chiudere l''ordine';
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
        nullif(left(trim(p_note), 500), ''),
        'Confermato manualmente dalla cassa perché stampato fisicamente'
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
    update public.orders
    set status = 'in_preparation'
    where id = result.order_id
      and status in ('pending_cashier', 'confirmed');
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

create or replace function public.cancel_order(p_order_id uuid)
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
  if exists (
    select 1
    from public.print_jobs
    where order_id = p_order_id
      and job_type = 'receipt'
      and status = 'printing'
  ) then
    raise exception 'Scontrino in stampa o da verificare: risolvi il job prima di annullare';
  end if;

  update public.orders
  set status = 'cancelled',
      closed_at = now()
  where id = p_order_id
    and status not in ('closed', 'cancelled')
  returning * into result;

  if result.id is null then
    raise exception 'Ordine già chiuso, annullato o non disponibile';
  end if;

  update public.print_jobs
  set status = 'cancelled',
      staff_message = 'Job annullato insieme all''ordine prima dell''invio'
  where order_id = p_order_id
    and status in ('pending', 'failed')
    and job_type <> 'cancellation'
    and printnode_job_id is null
    and submitted_at is null
    and verification_required_at is null;

  perform private.log_order_activity(p_order_id, 'cancelled');
  return result;
end;
$$;

create or replace function public.get_service_close_blockers(p_service_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'orders', coalesce((
      select jsonb_object_agg(status, amount)
      from (
        select status::text, count(*)::integer as amount
        from public.orders
        where service_id = p_service_id
          and status in ('draft', 'pending_cashier', 'confirmed', 'in_preparation', 'bill_requested')
        group by status
      ) as order_counts
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

drop function if exists public.close_service(uuid, boolean);
create function public.close_service(
  p_service_id uuid,
  p_force boolean default false,
  p_reason text default null
)
returns public.restaurant_services
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_service public.restaurant_services;
  open_orders integer;
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

  select count(*)::integer into open_orders
  from public.orders
  where service_id = p_service_id
    and status in ('draft', 'pending_cashier', 'confirmed', 'in_preparation', 'bill_requested');

  select count(*)::integer into unsafe_jobs
  from public.print_jobs
  where order_id in (select id from public.orders where service_id = p_service_id)
    and status = 'printing';

  if unsafe_jobs > 0 then
    raise exception 'Ci sono % job in stampa o da verificare', unsafe_jobs;
  end if;
  if open_orders > 0 and not p_force then
    raise exception 'Ci sono ancora % ordini aperti', open_orders;
  end if;
  if p_force and char_length(trim(coalesce(p_reason, ''))) < 10 then
    raise exception 'La chiusura forzata richiede una motivazione di almeno 10 caratteri';
  end if;

  for active_order in
    select id
    from public.orders
    where service_id = p_service_id
      and status in ('draft', 'pending_cashier', 'confirmed', 'in_preparation', 'bill_requested')
  loop
    perform private.log_order_activity(
      active_order.id,
      case when p_force then 'service_force_closed' else 'service_closed' end,
      jsonb_build_object(
        'service_id', p_service_id,
        'reason', left(trim(p_reason), 500)
      )
    );
  end loop;

  update public.print_jobs
  set status = 'cancelled',
      staff_message = 'Job annullato prima dell''invio dalla chiusura del servizio'
  where order_id in (select id from public.orders where service_id = p_service_id)
    and status in ('pending', 'failed')
    and printnode_job_id is null
    and submitted_at is null
    and verification_required_at is null;

  if p_force then
    update public.orders
    set status = case
          when status = 'draft' then 'cancelled'::public.order_status
          else 'closed'::public.order_status
        end,
        closed_at = now()
    where service_id = p_service_id
      and status in ('draft', 'pending_cashier', 'confirmed', 'in_preparation', 'bill_requested');
  end if;

  update public.restaurant_services
  set closed_at = now(),
      closed_by = (select auth.uid()),
      forced_close = p_force,
      forced_close_reason = case when p_force then left(trim(p_reason), 500) else null end
  where id = p_service_id
    and closed_at is null
  returning * into result;

  if result.id is null then
    raise exception 'Il servizio è cambiato durante la chiusura';
  end if;
  return result;
end;
$$;

revoke all on function public.get_or_create_receipt_print_job(uuid) from public;
revoke all on function public.claim_print_job(uuid) from public;
revoke all on function public.request_receipt_retry(uuid, uuid, text) from public;
revoke all on function public.close_order(uuid, bigint) from public;
revoke all on function public.confirm_receipt_manual_and_close(uuid, bigint, text) from public;
revoke all on function public.get_service_close_blockers(uuid) from public;
revoke all on function public.close_service(uuid, boolean, text) from public;
revoke all on function public.reorder_menu_categories(uuid[]) from public;

grant execute on function public.get_or_create_receipt_print_job(uuid) to authenticated;
grant execute on function public.claim_print_job(uuid) to authenticated;
grant execute on function public.request_receipt_retry(uuid, uuid, text) to authenticated;
grant execute on function public.close_order(uuid, bigint) to authenticated;
grant execute on function public.confirm_receipt_manual_and_close(uuid, bigint, text) to authenticated;
grant execute on function public.get_service_close_blockers(uuid) to authenticated;
grant execute on function public.close_service(uuid, boolean, text) to authenticated;
grant execute on function public.reorder_menu_categories(uuid[]) to authenticated;

grant insert (labels) on public.print_jobs to authenticated;
grant update (forced_close, forced_close_reason)
  on public.restaurant_services to authenticated;

commit;
