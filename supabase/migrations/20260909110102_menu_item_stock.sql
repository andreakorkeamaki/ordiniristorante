begin;

-- NULL means unlimited. The value is the number of portions still available,
-- excluding portions already reserved by orders (including drafts).
alter table public.menu_items add column stock_quantity integer;

-- Check the final balance at commit, so splitting a variant at zero stock is
-- allowed. UPDATE locks serialize reservations from simultaneous orders.
create function private.check_menu_item_stock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare product public.menu_items;
begin
  select * into product from public.menu_items where id = new.id;
  if product.stock_quantity < 0 then
    raise exception 'Quantità disponibile insufficiente per %', product.name;
  end if;
  return null;
end;
$$;
create constraint trigger menu_item_stock_nonnegative
  after insert or update on public.menu_items
  deferrable initially deferred for each row
  execute function private.check_menu_item_stock();

create function private.reserve_order_item_stock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_order uuid; product_id uuid; delta integer;
begin
  if tg_op = 'DELETE' then
    target_order := old.order_id; product_id := old.menu_item_id; delta := -old.quantity;
  elsif tg_op = 'INSERT' then
    target_order := new.order_id; product_id := new.menu_item_id; delta := new.quantity;
  else
    target_order := new.order_id; product_id := new.menu_item_id;
    delta := new.quantity - old.quantity;
  end if;
  perform 1 from public.orders where id = target_order and status <> 'cancelled' for update;
  if not found or delta = 0 then return null; end if;
  update public.menu_items set stock_quantity = stock_quantity - delta
    where id = product_id and stock_quantity is not null;
  return null;
end;
$$;
create trigger order_items_reserve_stock
  after insert or update or delete on public.order_items
  for each row execute function private.reserve_order_item_stock();

create function private.restore_cancelled_order_stock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare line record;
begin
  if (new.status = 'cancelled') = (old.status = 'cancelled') then return null; end if;
  for line in select menu_item_id, sum(quantity)::integer as quantity
    from public.order_items where order_id = new.id
    group by menu_item_id order by menu_item_id
  loop
    update public.menu_items
      set stock_quantity = stock_quantity + case when new.status = 'cancelled' then line.quantity else -line.quantity end
      where id = line.menu_item_id and stock_quantity is not null;
  end loop;
  return null;
end;
$$;
create trigger orders_restore_stock
  after update of status on public.orders for each row
  execute function private.restore_cancelled_order_stock();

revoke all on function private.check_menu_item_stock() from public, anon, authenticated;
revoke all on function private.reserve_order_item_stock() from public, anon, authenticated;
revoke all on function private.restore_cancelled_order_stock() from public, anon, authenticated;
commit;
