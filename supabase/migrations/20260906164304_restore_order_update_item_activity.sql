begin;

-- Atomic edits keep their idempotency audit row, but the update-ticket builder
-- also needs the legacy item-level activities to determine what was added
-- since the preceding kitchen ticket. Capture the physical row delta so grouped
-- decreases and later increases retain the correct net quantity.
create or replace function private.log_atomic_order_item_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  edit_type text := current_setting('appordini.atomic_edit_type', true);
  parent_order uuid := coalesce(new.order_id, old.order_id);
begin
  if edit_type = 'add' and tg_op = 'INSERT' then
    perform private.log_order_activity(
      parent_order,
      'item_added',
      jsonb_build_object(
        'item_id', new.id,
        'quantity', new.quantity
      )
    );
  elsif edit_type = 'quantity' and tg_op = 'UPDATE'
    and new.quantity is distinct from old.quantity
  then
    perform private.log_order_activity(
      parent_order,
      'item_quantity_changed',
      jsonb_build_object(
        'item_id', new.id,
        'delta', new.quantity - old.quantity
      )
    );
  elsif edit_type in ('quantity', 'remove') and tg_op = 'DELETE' then
    perform private.log_order_activity(
      parent_order,
      'item_removed',
      jsonb_build_object('item_id', old.id, 'quantity', old.quantity)
    );
  end if;

  return coalesce(new, old);
end;
$$;

revoke all on function private.log_atomic_order_item_activity()
from public, anon, authenticated;

create trigger order_items_log_atomic_activity
after insert or update or delete on public.order_items
for each row execute function private.log_atomic_order_item_activity();

-- Preserve pending update tickets created between the atomic-edit release and
-- this fix. Original operation timestamps keep already-processed updates out
-- of later ticket windows.
insert into public.order_activity(order_id, user_id, action, payload, created_at)
select
  operation.order_id,
  operation.created_by,
  case operation.payload->>'type'
    when 'add' then 'item_added'
    else 'item_quantity_changed'
  end,
  case operation.payload->>'type'
    when 'add' then jsonb_build_object(
      'item_id', operation.payload->>'item_id',
      'quantity', (operation.payload->>'quantity')::integer
    )
    else jsonb_build_object(
      'item_id', operation.payload#>>'{item_ids,0}',
      'delta', (operation.payload->>'delta')::integer
    )
  end,
  operation.created_at
from private.order_edit_operations as operation
where operation.payload->>'type' in ('add', 'quantity')
  and case operation.payload->>'type'
    when 'add' then (operation.payload->>'quantity')::integer <> 0
    else (operation.payload->>'delta')::integer <> 0
  end;

create or replace function public.apply_order_edit(
  p_order_id uuid,
  p_operation_id uuid,
  p_edit jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result jsonb;
  saved_edit_type text := coalesce(
    current_setting('appordini.atomic_edit_type', true),
    ''
  );
begin
  perform set_config(
    'appordini.atomic_edit_type',
    coalesce(p_edit->>'type', ''),
    true
  );

  begin
    result := private.apply_order_edit(p_order_id, p_operation_id, p_edit);
  exception when others then
    perform set_config('appordini.atomic_edit_type', saved_edit_type, true);
    raise;
  end;

  perform set_config('appordini.atomic_edit_type', saved_edit_type, true);
  return result;
end;
$$;

revoke all on function public.apply_order_edit(uuid, uuid, jsonb)
from public, anon;
grant execute on function public.apply_order_edit(uuid, uuid, jsonb)
to authenticated;

commit;
