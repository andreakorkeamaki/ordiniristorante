begin;

with ranked_items as (
  select
    id,
    (row_number() over (
      partition by category_id
      order by sort_order, created_at, id
    ) - 1)::integer as normalized_sort_order
  from public.menu_items
)
update public.menu_items as item
set sort_order = ranked_items.normalized_sort_order
from ranked_items
where ranked_items.id = item.id
  and item.sort_order is distinct from ranked_items.normalized_sort_order;

create or replace function public.reorder_menu_items(
  p_category_id uuid,
  p_item_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  category_item_count integer;
  requested_item_count integer;
begin
  if private.current_role() is distinct from 'admin' then
    raise exception 'Solo l''amministratore può riordinare i prodotti';
  end if;

  if not exists (
    select 1
    from public.menu_categories
    where id = p_category_id
  ) then
    raise exception 'Categoria non disponibile';
  end if;

  select count(*)
  into category_item_count
  from public.menu_items
  where category_id = p_category_id;

  requested_item_count := coalesce(cardinality(p_item_ids), 0);

  if requested_item_count <> category_item_count then
    raise exception 'Il riordino deve includere tutti i prodotti della categoria';
  end if;

  if (
    select count(distinct item_id)
    from unnest(p_item_ids) as requested(item_id)
  ) <> requested_item_count then
    raise exception 'Il riordino contiene prodotti duplicati';
  end if;

  if exists (
    select 1
    from unnest(p_item_ids) as requested(item_id)
    left join public.menu_items as item
      on item.id = requested.item_id
     and item.category_id = p_category_id
    where item.id is null
  ) then
    raise exception 'Un prodotto non appartiene alla categoria selezionata';
  end if;

  update public.menu_items as item
  set sort_order = (requested.position - 1)::integer
  from unnest(p_item_ids) with ordinality as requested(item_id, position)
  where item.id = requested.item_id
    and item.category_id = p_category_id;
end;
$$;

revoke all on function public.reorder_menu_items(uuid, uuid[]) from public;
grant execute on function public.reorder_menu_items(uuid, uuid[]) to authenticated;

drop policy orders_staff_insert on public.orders;

create policy orders_staff_insert on public.orders for insert to authenticated
with check (
  private.is_active_staff()
  and status = 'draft'
  and (
    order_type = 'dine_in'
    or private.current_role() in ('cashier', 'admin')
  )
);

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
  if not coalesce(
    private.current_role() in ('cashier', 'admin'),
    false
  ) then
    raise exception 'Solo Cassa e Admin possono creare asporti';
  end if;

  normalized_name := trim(coalesce(p_customer_name, ''));
  if char_length(normalized_name) < 1 or char_length(normalized_name) > 80 then
    raise exception 'Inserisci un nome cliente valido';
  end if;
  if p_pickup_at is null then
    raise exception 'Inserisci l''ora di ritiro';
  end if;

  select *
  into current_service
  from public.restaurant_services
  where closed_at is null
  limit 1;

  if current_service.id is null then
    raise exception 'Nessun servizio aperto. Chiedi alla cassa di iniziare il servizio';
  end if;
  if current_service.period = 'recupero'
    or current_service.business_date <> (now() at time zone 'Europe/Rome')::date
  then
    raise exception 'Il servizio precedente deve essere chiuso dalla cassa';
  end if;

  insert into public.orders (
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

revoke all on function public.create_takeaway_order(text, timestamptz) from public;
grant execute on function public.create_takeaway_order(text, timestamptz) to authenticated;

commit;
