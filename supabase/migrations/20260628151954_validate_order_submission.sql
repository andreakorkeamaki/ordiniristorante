create or replace function public.send_order_to_cashier(p_order_id uuid)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.orders;
  configured_copies integer;
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

  select default_print_copies into configured_copies
  from public.restaurant_settings order by created_at limit 1;

  insert into public.print_jobs(order_id, status, copies)
  values (p_order_id, 'pending', coalesce(configured_copies, 3))
  on conflict (order_id) do update
    set status = 'pending',
        copies = excluded.copies,
        error_message = null,
        updated_at = now();

  perform private.log_order_activity(p_order_id, 'sent_to_cashier');
  return result;
end;
$$;
