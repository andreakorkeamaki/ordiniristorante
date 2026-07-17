begin;

-- Costs are deliberately kept outside the exposed public schema. The public
-- menu is readable by anonymous users, while costs and margins are admin-only.
create table private.menu_item_costs (
  menu_item_id uuid primary key
    references public.menu_items(id) on delete cascade,
  unit_cost numeric(10, 2) not null
    check (unit_cost >= 0 and unit_cost < 1000000),
  updated_at timestamptz not null default now()
);

create table private.menu_extra_costs (
  menu_extra_id uuid primary key
    references public.menu_extras(id) on delete cascade,
  unit_cost numeric(10, 2) not null
    check (unit_cost >= 0 and unit_cost < 1000000),
  updated_at timestamptz not null default now()
);

-- A sale keeps the cost that was configured when the item was added. Historic
-- rows are intentionally not backfilled with today's cost.
create table private.order_item_cost_snapshots (
  order_item_id uuid primary key
    references public.order_items(id) on delete cascade,
  unit_cost numeric(10, 2)
    check (unit_cost is null or (unit_cost >= 0 and unit_cost < 1000000)),
  captured_at timestamptz not null default now()
);

create table private.order_item_extra_cost_snapshots (
  order_item_extra_id uuid primary key
    references public.order_item_extras(id) on delete cascade,
  unit_cost numeric(10, 2)
    check (unit_cost is null or (unit_cost >= 0 and unit_cost < 1000000)),
  captured_at timestamptz not null default now()
);

revoke all on table private.menu_item_costs from public, anon, authenticated;
revoke all on table private.menu_extra_costs from public, anon, authenticated;
revoke all on table private.order_item_cost_snapshots from public, anon, authenticated;
revoke all on table private.order_item_extra_cost_snapshots from public, anon, authenticated;

grant usage on schema private to service_role;
grant select on table public.menu_categories to service_role;
grant select on table public.menu_items to service_role;
grant select on table public.menu_extras to service_role;
grant select on table public.restaurant_services to service_role;
grant select on table public.orders to service_role;
grant select on table public.order_items to service_role;
grant select on table public.order_item_extras to service_role;
grant select, insert, update, delete on table private.menu_item_costs to service_role;
grant select, insert, update, delete on table private.menu_extra_costs to service_role;
grant select on table private.order_item_cost_snapshots to service_role;
grant select on table private.order_item_extra_cost_snapshots to service_role;

create or replace function private.capture_order_item_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.order_item_cost_snapshots (order_item_id, unit_cost)
  values (
    new.id,
    (
      select configured.unit_cost
      from private.menu_item_costs as configured
      where configured.menu_item_id = new.menu_item_id
    )
  )
  on conflict (order_item_id) do nothing;
  return new;
end;
$$;

create trigger order_items_capture_cost
after insert on public.order_items
for each row execute function private.capture_order_item_cost();

create or replace function private.capture_order_item_extra_cost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.order_item_extra_cost_snapshots (
    order_item_extra_id,
    unit_cost
  )
  values (
    new.id,
    (
      select configured.unit_cost
      from private.menu_extra_costs as configured
      where configured.menu_extra_id = new.menu_extra_id
    )
  )
  on conflict (order_item_extra_id) do nothing;
  return new;
end;
$$;

create trigger order_item_extras_capture_cost
after insert on public.order_item_extras
for each row execute function private.capture_order_item_extra_cost();

revoke all on function private.capture_order_item_cost() from public, anon, authenticated;
revoke all on function private.capture_order_item_extra_cost() from public, anon, authenticated;

create or replace function public.set_admin_product_cost(
  p_kind text,
  p_product_id uuid,
  p_unit_cost numeric
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_kind not in ('item', 'extra') then
    raise exception 'Tipo prodotto non valido';
  end if;

  if p_unit_cost is not null and (p_unit_cost < 0 or p_unit_cost >= 1000000) then
    raise exception 'Costo prodotto non valido';
  end if;

  if p_kind = 'item' then
    if not exists (
      select 1 from public.menu_items where id = p_product_id
    ) then
      raise exception 'Prodotto non disponibile';
    end if;

    if p_unit_cost is null then
      delete from private.menu_item_costs where menu_item_id = p_product_id;
    else
      insert into private.menu_item_costs (menu_item_id, unit_cost)
      values (p_product_id, round(p_unit_cost, 2))
      on conflict (menu_item_id) do update
      set unit_cost = excluded.unit_cost,
          updated_at = now();
    end if;
    return;
  end if;

  if not exists (
    select 1 from public.menu_extras where id = p_product_id
  ) then
    raise exception 'Extra non disponibile';
  end if;

  if p_unit_cost is null then
    delete from private.menu_extra_costs where menu_extra_id = p_product_id;
  else
    insert into private.menu_extra_costs (menu_extra_id, unit_cost)
    values (p_product_id, round(p_unit_cost, 2))
    on conflict (menu_extra_id) do update
    set unit_cost = excluded.unit_cost,
        updated_at = now();
  end if;
end;
$$;

create or replace function public.get_admin_cost_catalog()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'items', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', item.id,
            'name', item.name,
            'category', category.name,
            'price', item.price,
            'unit_cost', configured.unit_cost,
            'active', item.active
          )
          order by category.sort_order, category.name, item.sort_order, item.name
        )
        from public.menu_items as item
        join public.menu_categories as category on category.id = item.category_id
        left join private.menu_item_costs as configured
          on configured.menu_item_id = item.id
      ),
      '[]'::jsonb
    ),
    'extras', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', extra.id,
            'name', extra.name,
            'category', 'Extra',
            'price', extra.price,
            'unit_cost', configured.unit_cost,
            'active', extra.active
          )
          order by extra.sort_order, extra.name
        )
        from public.menu_extras as extra
        left join private.menu_extra_costs as configured
          on configured.menu_extra_id = extra.id
      ),
      '[]'::jsonb
    )
  );
$$;

create or replace function public.get_admin_analytics(
  p_from date,
  p_to date,
  p_period public.service_period default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with filtered_services as (
    select service.*
    from public.restaurant_services as service
    where service.business_date between p_from and p_to
      and (p_period is null or service.period = p_period)
  ),
  range_orders as (
    select orders.*
    from public.orders as orders
    join filtered_services as service on service.id = orders.service_id
  ),
  closed_orders as (
    select * from range_orders where status = 'closed'
  ),
  extra_totals as (
    select
      extra.order_item_id,
      sum(extra.total)::numeric as extra_revenue
    from public.order_item_extras as extra
    join public.order_items as item on item.id = extra.order_item_id
    join closed_orders as orders on orders.id = item.order_id
    group by extra.order_item_id
  ),
  item_sales as (
    select
      item.id,
      item.order_id,
      orders.service_id,
      item.item_name_snapshot as name,
      category.slug as category_slug,
      item.quantity,
      (item.line_total + coalesce(extra.extra_revenue, 0))::numeric as revenue
    from public.order_items as item
    join closed_orders as orders on orders.id = item.order_id
    left join extra_totals as extra on extra.order_item_id = item.id
    left join public.menu_items as current_item on current_item.id = item.menu_item_id
    left join public.menu_categories as category
      on category.id = current_item.category_id
  ),
  cost_lines as (
    select
      orders.service_id,
      item.quantity::bigint as units,
      case when snapshot.unit_cost is null then 0 else item.quantity end::bigint
        as costed_units,
      coalesce(snapshot.unit_cost * item.quantity, 0)::numeric as known_cost
    from public.order_items as item
    join closed_orders as orders on orders.id = item.order_id
    left join private.order_item_cost_snapshots as snapshot
      on snapshot.order_item_id = item.id

    union all

    select
      orders.service_id,
      extra.quantity::bigint as units,
      case when snapshot.unit_cost is null then 0 else extra.quantity end::bigint
        as costed_units,
      coalesce(snapshot.unit_cost * extra.quantity, 0)::numeric as known_cost
    from public.order_item_extras as extra
    join public.order_items as item on item.id = extra.order_item_id
    join closed_orders as orders on orders.id = item.order_id
    left join private.order_item_extra_cost_snapshots as snapshot
      on snapshot.order_item_extra_id = extra.id
  ),
  overall as (
    select
      count(*)::integer as order_count,
      coalesce(sum(total), 0)::numeric as revenue,
      coalesce(sum(total) filter (where order_type = 'dine_in'), 0)::numeric
        as dine_in_revenue,
      coalesce(sum(total) filter (where order_type = 'takeaway'), 0)::numeric
        as takeaway_revenue,
      coalesce(sum(cover_count) filter (where order_type = 'dine_in'), 0)::integer
        as cover_count
    from closed_orders
  ),
  overall_costs as (
    select
      coalesce(sum(units), 0)::bigint as units,
      coalesce(sum(costed_units), 0)::bigint as costed_units,
      coalesce(sum(known_cost), 0)::numeric as known_cost
    from cost_lines
  ),
  top_pizzas as (
    select
      name,
      sum(quantity)::bigint as quantity,
      sum(revenue)::numeric as revenue
    from item_sales
    where category_slug in ('bianche', 'rosse', 'speciali')
    group by name
    order by quantity desc, revenue desc, name
    limit 8
  ),
  top_products as (
    select
      name,
      sum(quantity)::bigint as quantity,
      sum(revenue)::numeric as revenue
    from item_sales
    group by name
    order by quantity desc, revenue desc, name
    limit 8
  ),
  daily as (
    select
      service.business_date,
      count(orders.id)::integer as order_count,
      coalesce(sum(orders.total), 0)::numeric as revenue
    from filtered_services as service
    left join closed_orders as orders on orders.service_id = service.id
    group by service.business_date
    order by service.business_date
  ),
  service_costs as (
    select
      service_id,
      sum(units)::bigint as units,
      sum(costed_units)::bigint as costed_units,
      sum(known_cost)::numeric as known_cost
    from cost_lines
    group by service_id
  ),
  service_stats as (
    select
      service.id,
      service.business_date,
      service.period,
      service.opened_at,
      service.closed_at,
      service.forced_close,
      count(orders.id) filter (where orders.status = 'closed')::integer
        as order_count,
      count(orders.id) filter (where orders.status = 'cancelled')::integer
        as cancelled_count,
      coalesce(
        sum(orders.cover_count) filter (
          where orders.status = 'closed' and orders.order_type = 'dine_in'
        ),
        0
      )::integer as cover_count,
      coalesce(sum(orders.total) filter (where orders.status = 'closed'), 0)::numeric
        as revenue,
      coalesce(costs.units, 0)::bigint as cost_units,
      coalesce(costs.costed_units, 0)::bigint as costed_units,
      coalesce(costs.known_cost, 0)::numeric as known_cost
    from filtered_services as service
    left join range_orders as orders on orders.service_id = service.id
    left join service_costs as costs on costs.service_id = service.id
    group by service.id, costs.units, costs.costed_units, costs.known_cost
  ),
  totals as (
    select
      overall.*,
      overall_costs.units as cost_units,
      overall_costs.costed_units,
      overall_costs.known_cost,
      (select count(*) from range_orders where status = 'cancelled')::integer
        as cancelled_count,
      (select count(*) from filtered_services)::integer as service_count
    from overall
    cross join overall_costs
  )
  select jsonb_build_object(
    'metrics', jsonb_build_object(
      'revenue', totals.revenue,
      'order_count', totals.order_count,
      'cover_count', totals.cover_count,
      'cancelled_count', totals.cancelled_count,
      'service_count', totals.service_count,
      'average_order', case
        when totals.order_count = 0 then 0
        else round(totals.revenue / totals.order_count, 2)
      end,
      'average_cover', case
        when totals.cover_count = 0 then 0
        else round(totals.dine_in_revenue / totals.cover_count, 2)
      end,
      'known_cost', totals.known_cost,
      'cost_coverage', case
        when totals.cost_units = 0 then 100
        else round((totals.costed_units::numeric * 100) / totals.cost_units)
      end,
      'gross_profit', case
        when totals.cost_units = totals.costed_units
          then totals.revenue - totals.known_cost
        else null
      end,
      'dine_in_revenue', totals.dine_in_revenue,
      'takeaway_revenue', totals.takeaway_revenue
    ),
    'daily', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'date', entry.business_date,
            'revenue', entry.revenue,
            'order_count', entry.order_count
          )
          order by entry.business_date
        )
        from daily as entry
      ),
      '[]'::jsonb
    ),
    'top_pizzas', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'name', entry.name,
            'quantity', entry.quantity,
            'revenue', entry.revenue
          )
          order by entry.quantity desc, entry.revenue desc, entry.name
        )
        from top_pizzas as entry
      ),
      '[]'::jsonb
    ),
    'top_products', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'name', entry.name,
            'quantity', entry.quantity,
            'revenue', entry.revenue
          )
          order by entry.quantity desc, entry.revenue desc, entry.name
        )
        from top_products as entry
      ),
      '[]'::jsonb
    ),
    'services', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', entry.id,
            'business_date', entry.business_date,
            'period', entry.period,
            'opened_at', entry.opened_at,
            'closed_at', entry.closed_at,
            'forced_close', entry.forced_close,
            'order_count', entry.order_count,
            'cancelled_count', entry.cancelled_count,
            'cover_count', entry.cover_count,
            'revenue', entry.revenue,
            'average_order', case
              when entry.order_count = 0 then 0
              else round(entry.revenue / entry.order_count, 2)
            end,
            'known_cost', entry.known_cost,
            'cost_coverage', case
              when entry.cost_units = 0 then 100
              else round((entry.costed_units::numeric * 100) / entry.cost_units)
            end,
            'gross_profit', case
              when entry.cost_units = entry.costed_units
                then entry.revenue - entry.known_cost
              else null
            end,
            'duration_minutes', greatest(
              0,
              round(
                extract(epoch from (coalesce(entry.closed_at, now()) - entry.opened_at))
                / 60
              )
            )
          )
          order by entry.business_date desc, entry.opened_at desc
        )
        from service_stats as entry
      ),
      '[]'::jsonb
    )
  )
  from totals;
$$;

revoke all on function public.set_admin_product_cost(text, uuid, numeric)
  from public, anon, authenticated;
revoke all on function public.get_admin_cost_catalog()
  from public, anon, authenticated;
revoke all on function public.get_admin_analytics(date, date, public.service_period)
  from public, anon, authenticated;

grant execute on function public.set_admin_product_cost(text, uuid, numeric)
  to service_role;
grant execute on function public.get_admin_cost_catalog()
  to service_role;
grant execute on function public.get_admin_analytics(date, date, public.service_period)
  to service_role;

commit;
