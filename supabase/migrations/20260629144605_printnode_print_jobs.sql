begin;

create type public.print_job_type as enum (
  'new_order',
  'order_update',
  'cancellation',
  'reprint'
);

alter table public.print_jobs
  drop constraint print_jobs_order_id_key,
  drop constraint print_jobs_copies_check;

alter table public.print_jobs
  add column job_type public.print_job_type not null default 'new_order',
  add column idempotency_key text,
  add column printnode_job_id bigint,
  add column processing_started_at timestamptz,
  add column submitted_at timestamptz,
  add column failed_at timestamptz,
  add column last_attempt_at timestamptz,
  add column manual_fallback boolean not null default false;

update public.print_jobs
set copies = 3,
    idempotency_key = order_id::text || ':new_order';

alter table public.print_jobs
  alter column idempotency_key set not null,
  add constraint print_jobs_three_copies_check check (copies = 3),
  add constraint print_jobs_order_type_key unique (order_id, job_type),
  add constraint print_jobs_idempotency_key_key unique (idempotency_key),
  add constraint print_jobs_printnode_job_id_check
    check (printnode_job_id is null or printnode_job_id > 0);

create index print_jobs_order_created_idx
  on public.print_jobs(order_id, created_at desc);

create or replace function private.enqueue_print_job(
  p_order_id uuid,
  p_job_type public.print_job_type,
  p_created_by uuid
)
returns public.print_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.print_jobs;
begin
  insert into public.print_jobs (
    order_id,
    job_type,
    idempotency_key,
    status,
    copies,
    created_by
  )
  values (
    p_order_id,
    p_job_type,
    p_order_id::text || ':' || p_job_type::text,
    'pending',
    3,
    p_created_by
  )
  on conflict (order_id, job_type) do nothing
  returning * into result;

  if result.id is null then
    select *
    into result
    from public.print_jobs
    where order_id = p_order_id
      and job_type = p_job_type;
  end if;

  return result;
end;
$$;

revoke execute on function private.enqueue_print_job(uuid, public.print_job_type, uuid)
from public, anon, authenticated;

create or replace function private.enqueue_job_from_order_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'draft' and new.status = 'pending_cashier' then
    perform private.enqueue_print_job(new.id, 'new_order', new.updated_by);
  elsif old.status <> 'cancelled' and new.status = 'cancelled' then
    update public.print_jobs
    set status = 'cancelled',
        error_message = 'Ordine annullato prima del completamento della stampa'
    where order_id = new.id
      and job_type <> 'cancellation'
      and status in ('pending', 'printing');

    perform private.enqueue_print_job(new.id, 'cancellation', new.updated_by);
  end if;

  return new;
end;
$$;

create trigger orders_enqueue_print_job
after update of status on public.orders
for each row execute function private.enqueue_job_from_order_status();

create or replace function private.enqueue_order_update(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.orders;
begin
  select *
  into target_order
  from public.orders
  where id = p_order_id;

  if target_order.id is null
    or target_order.status in ('draft', 'closed', 'cancelled')
    or not exists (
      select 1
      from public.print_jobs
      where order_id = p_order_id
        and job_type = 'new_order'
        and status in ('printing', 'printed')
    )
  then
    return;
  end if;

  perform private.enqueue_print_job(
    p_order_id,
    'order_update',
    coalesce((select auth.uid()), target_order.updated_by)
  );
end;
$$;

revoke execute on function private.enqueue_order_update(uuid)
from public, anon, authenticated;

create or replace function private.enqueue_order_update_from_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cover_count is distinct from old.cover_count
    or new.general_notes is distinct from old.general_notes
  then
    perform private.enqueue_order_update(new.id);
  end if;
  return new;
end;
$$;

create trigger orders_enqueue_update_job
after update of cover_count, general_notes on public.orders
for each row execute function private.enqueue_order_update_from_order();

create or replace function private.enqueue_order_update_from_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.enqueue_order_update(coalesce(new.order_id, old.order_id));
  return coalesce(new, old);
end;
$$;

create trigger order_items_enqueue_update_job
after insert or update or delete on public.order_items
for each row execute function private.enqueue_order_update_from_item();

create or replace function private.enqueue_order_update_from_extra()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_order uuid;
begin
  select order_id
  into parent_order
  from public.order_items
  where id = coalesce(new.order_item_id, old.order_item_id);

  if parent_order is not null then
    perform private.enqueue_order_update(parent_order);
  end if;

  return coalesce(new, old);
end;
$$;

create trigger order_extras_enqueue_update_job
after insert or update or delete on public.order_item_extras
for each row execute function private.enqueue_order_update_from_extra();

create or replace function public.send_order_to_cashier(p_order_id uuid)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.orders;
  order_covers integer;
  all_you_can_eat_quantity integer;
begin
  if not exists (select 1 from public.order_items where order_id = p_order_id) then
    raise exception 'La comanda è vuota';
  end if;

  select cover_count
  into order_covers
  from public.orders
  where id = p_order_id and status = 'draft';

  if order_covers is null then
    raise exception 'Ordine già inviato o non disponibile';
  end if;

  select coalesce(sum(quantity), 0)::integer
  into all_you_can_eat_quantity
  from public.order_items
  where order_id = p_order_id
    and item_name_snapshot like 'All You Can Eat%';

  if all_you_can_eat_quantity > 0
    and all_you_can_eat_quantity <> order_covers
  then
    raise exception 'Le formule All You Can Eat (%) e i coperti (%) devono coincidere',
      all_you_can_eat_quantity,
      order_covers;
  end if;

  update public.orders
  set status = 'pending_cashier', sent_to_cashier_at = now()
  where id = p_order_id and status = 'draft'
  returning * into result;

  if result.id is null then
    raise exception 'Ordine già inviato o non disponibile';
  end if;

  perform private.log_order_activity(p_order_id, 'sent_to_cashier');
  return result;
end;
$$;

create or replace function public.request_reprint(p_order_id uuid)
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

  select *
  into target_order
  from public.orders
  where id = p_order_id;

  if target_order.id is null then
    raise exception 'Ordine non disponibile';
  end if;

  insert into public.print_jobs (
    order_id,
    job_type,
    idempotency_key,
    status,
    copies,
    created_by
  )
  values (
    p_order_id,
    'reprint',
    p_order_id::text || ':reprint',
    'pending',
    3,
    (select auth.uid())
  )
  on conflict (order_id, job_type) do nothing
  returning * into result;

  if result.id is null then
    select *
    into result
    from public.print_jobs
    where order_id = p_order_id
      and job_type = 'reprint';
  end if;

  perform private.log_order_activity(p_order_id, 'reprint_requested');
  return result;
end;
$$;

create or replace function public.request_print(p_order_id uuid)
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

  update public.orders
  set status = 'confirmed'
  where id = p_order_id and status = 'pending_cashier';

  select *
  into result
  from public.print_jobs
  where order_id = p_order_id
    and job_type = 'new_order';

  return result;
end;
$$;

create or replace function public.mark_print_job_delivered(p_job_id uuid)
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
      error_message = null
  where id = p_job_id
  returning * into result;

  if result.id is null then
    raise exception 'Job di stampa non disponibile';
  end if;

  if result.job_type = 'new_order' then
    update public.orders
    set status = 'in_preparation'
    where id = result.order_id
      and status in ('pending_cashier', 'confirmed');
  end if;

  perform private.log_order_activity(
    result.order_id,
    'print_delivered',
    jsonb_build_object('print_job_id', result.id, 'job_type', result.job_type)
  );
  return result;
end;
$$;

create or replace function public.mark_print_job_manual(p_job_id uuid)
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
      printed_at = now(),
      failed_at = null,
      error_message = null,
      manual_fallback = true
  where id = p_job_id
    and status in ('pending', 'printing', 'failed')
  returning * into result;

  if result.id is null then
    raise exception 'Job già completato o non disponibile';
  end if;

  if result.job_type = 'new_order' then
    update public.orders
    set status = 'in_preparation'
    where id = result.order_id
      and status in ('pending_cashier', 'confirmed');
  end if;

  perform private.log_order_activity(
    result.order_id,
    'manual_print_completed',
    jsonb_build_object('print_job_id', result.id, 'job_type', result.job_type)
  );
  return result;
end;
$$;

create or replace function public.cancel_order(p_order_id uuid)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare result public.orders;
begin
  if private.current_role() not in ('cashier', 'admin') then
    raise exception 'Non autorizzato';
  end if;

  update public.orders
  set status = 'cancelled', closed_at = now()
  where id = p_order_id and status not in ('closed', 'cancelled')
  returning * into result;

  if result.id is null then
    raise exception 'Ordine non annullabile';
  end if;

  perform private.log_order_activity(p_order_id, 'cancelled');
  return result;
end;
$$;

drop policy print_jobs_waiter_insert on public.print_jobs;

create policy print_jobs_cashier_insert on public.print_jobs for insert to authenticated
with check (
  private.current_role() in ('cashier', 'admin')
  and created_by = (select auth.uid())
  and job_type = 'reprint'
  and status = 'pending'
  and copies = 3
  and idempotency_key = order_id::text || ':reprint'
);

revoke insert on public.print_jobs from authenticated;
grant insert (
  order_id,
  job_type,
  idempotency_key,
  status,
  copies,
  created_by
) on public.print_jobs to authenticated;
grant update (
  status,
  retry_count,
  error_message,
  updated_at,
  printed_at,
  printnode_job_id,
  processing_started_at,
  submitted_at,
  failed_at,
  last_attempt_at,
  manual_fallback
) on public.print_jobs to authenticated;

revoke all on function public.request_reprint(uuid) from public;
revoke all on function public.mark_print_job_delivered(uuid) from public;
revoke all on function public.mark_print_job_manual(uuid) from public;
grant execute on function public.request_reprint(uuid) to authenticated;
grant execute on function public.mark_print_job_delivered(uuid) to authenticated;
grant execute on function public.mark_print_job_manual(uuid) to authenticated;

commit;
