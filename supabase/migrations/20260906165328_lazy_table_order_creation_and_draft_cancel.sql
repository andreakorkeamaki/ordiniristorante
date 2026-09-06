begin;

-- Create the dine-in order and its first product in one transaction. If item
-- validation fails, the new empty order is rolled back as well.
create or replace function public.start_table_order_with_item(
  p_table_id uuid,
  p_operation_id uuid,
  p_item_id uuid,
  p_menu_item_id uuid,
  p_quantity integer
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_order public.orders;
begin
  select * into target_order
  from public.get_or_create_active_order(p_table_id);

  return public.apply_order_edit(
    target_order.id,
    p_operation_id,
    jsonb_build_object(
      'type', 'add',
      'item_id', p_item_id,
      'menu_item_id', p_menu_item_id,
      'quantity', p_quantity
    )
  );
end;
$$;

revoke all on function public.start_table_order_with_item(
  uuid, uuid, uuid, uuid, integer
) from public, anon;
grant execute on function public.start_table_order_with_item(
  uuid, uuid, uuid, uuid, integer
) to authenticated;

-- A waiter may discard a draft only through the narrow function below. The
-- marker is additionally gated by current_user so a client cannot imitate it
-- with set_config and a direct order update.
create or replace function private.prepare_order()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  configured_cover numeric(10, 2);
  printnode_transition_allowed boolean;
  draft_discard_allowed boolean := false;
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

    draft_discard_allowed :=
      old.status = 'draft'
      and new.status = 'cancelled'
      and current_user not in ('authenticated', 'anon')
      and old.id::text = current_setting(
        'appordini.discard_draft_order_id',
        true
      );

    if new.status <> old.status
      and private.current_role() = 'waiter'
      and not printnode_transition_allowed
    then
      if not (
        (old.status = 'draft' and new.status = 'pending_cashier')
        or (old.status = 'in_preparation' and new.status = 'bill_requested')
        or draft_discard_allowed
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

create or replace function private.discard_draft_order(p_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.orders;
  result public.orders;
  saved_order_id text := coalesce(
    current_setting('appordini.discard_draft_order_id', true),
    ''
  );
begin
  if not private.is_active_staff() then
    raise exception 'Utente non autorizzato';
  end if;

  select * into target_order
  from public.orders
  where id = p_order_id
  for update;

  if target_order.id is null
    or target_order.order_type <> 'dine_in'
    or target_order.status <> 'draft'
  then
    raise exception 'Si può annullare da qui solo un tavolo non ancora inviato';
  end if;

  if exists (
    select 1 from public.print_jobs
    where order_id = p_order_id
      and (
        status in ('printing', 'printed')
        or printnode_job_id is not null
        or submitted_at is not null
        or verification_required_at is not null
      )
  ) then
    raise exception 'La comanda potrebbe essere già stata stampata';
  end if;

  perform set_config(
    'appordini.discard_draft_order_id',
    p_order_id::text,
    true
  );

  begin
    update public.orders
    set status = 'cancelled',
        closed_at = now()
    where id = p_order_id
    returning * into result;
  exception when others then
    perform set_config(
      'appordini.discard_draft_order_id',
      saved_order_id,
      true
    );
    raise;
  end;

  perform set_config(
    'appordini.discard_draft_order_id',
    saved_order_id,
    true
  );
  perform private.log_order_activity(
    p_order_id,
    'cancelled',
    jsonb_build_object('reason', 'draft_discarded')
  );
  return result;
end;
$$;

revoke all on function private.discard_draft_order(uuid)
from public, anon, authenticated;
grant execute on function private.discard_draft_order(uuid)
to authenticated;

create or replace function public.discard_draft_order(p_order_id uuid)
returns public.orders
language sql
security invoker
set search_path = ''
as $$
  select private.discard_draft_order(p_order_id);
$$;

revoke all on function public.discard_draft_order(uuid)
from public, anon;
grant execute on function public.discard_draft_order(uuid)
to authenticated;

commit;
