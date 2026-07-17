begin;

-- Keep waiter statistics in a dedicated read-only RPC so the existing
-- analytics payload remains backwards-compatible during deployment.
grant select on table public.profiles to service_role;

create or replace function public.get_admin_waiter_analytics(
  p_from date,
  p_to date,
  p_period public.service_period default null,
  p_order_type public.order_type default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with filtered_services as (
    select service.id
    from public.restaurant_services as service
    where service.business_date between p_from and p_to
      and (p_period is null or service.period = p_period)
  ),
  range_orders as (
    select
      orders.id,
      orders.status,
      orders.order_type,
      orders.cover_count,
      orders.total,
      orders.created_by
    from public.orders as orders
    join filtered_services as service on service.id = orders.service_id
    where p_order_type is null or orders.order_type = p_order_type
  ),
  waiter_stats as (
    select
      profile.id,
      profile.full_name,
      profile.active,
      count(orders.id) filter (where orders.status = 'closed')::integer
        as order_count,
      count(orders.id) filter (where orders.status = 'cancelled')::integer
        as cancelled_count,
      count(orders.id) filter (
        where orders.status = 'closed' and orders.order_type = 'dine_in'
      )::integer as dine_in_order_count,
      count(orders.id) filter (
        where orders.status = 'closed' and orders.order_type = 'takeaway'
      )::integer as takeaway_order_count,
      coalesce(
        sum(orders.cover_count) filter (
          where orders.status = 'closed' and orders.order_type = 'dine_in'
        ),
        0
      )::integer as cover_count,
      coalesce(
        sum(orders.total) filter (where orders.status = 'closed'),
        0
      )::numeric as revenue
    from public.profiles as profile
    left join range_orders as orders on orders.created_by = profile.id
    where profile.role = 'waiter'
      and (profile.active or orders.id is not null)
    group by profile.id, profile.full_name, profile.active
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', entry.id,
        'full_name', entry.full_name,
        'active', entry.active,
        'order_count', entry.order_count,
        'cancelled_count', entry.cancelled_count,
        'dine_in_order_count', entry.dine_in_order_count,
        'takeaway_order_count', entry.takeaway_order_count,
        'cover_count', entry.cover_count,
        'revenue', entry.revenue,
        'average_order', case
          when entry.order_count = 0 then 0
          else round(entry.revenue / entry.order_count, 2)
        end
      )
      order by entry.order_count desc, entry.revenue desc, entry.full_name
    ),
    '[]'::jsonb
  )
  from waiter_stats as entry;
$$;

revoke all on function public.get_admin_waiter_analytics(
  date,
  date,
  public.service_period,
  public.order_type
)
  from public, anon, authenticated;

grant execute on function public.get_admin_waiter_analytics(
  date,
  date,
  public.service_period,
  public.order_type
)
  to service_role;

commit;
