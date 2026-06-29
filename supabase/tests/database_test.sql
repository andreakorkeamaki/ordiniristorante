begin;
select plan(32);

select has_table('public', 'orders', 'orders exists');
select has_table('public', 'order_items', 'order_items exists');
select has_table('public', 'print_jobs', 'print_jobs exists');
select has_table('public', 'menu_items', 'menu_items exists');
select has_index('public', 'orders', 'orders_one_active_per_table_idx', 'one active order index exists');
select has_index('public', 'print_jobs', 'print_jobs_order_type_key', 'print jobs are unique by order and type');
select col_type_is('public', 'orders', 'total', 'numeric(10,2)', 'order totals use exact numeric values');
select col_type_is('public', 'menu_items', 'price', 'numeric(10,2)', 'menu prices use exact numeric values');
select col_is_pk('public', 'profiles', 'id', 'profiles id is primary key');
select fk_ok('public', 'orders', 'table_id', 'public', 'restaurant_tables', 'id', 'orders reference tables');
select fk_ok('public', 'order_items', 'order_id', 'public', 'orders', 'id', 'items reference orders');
select policies_are(
  'public',
  'menu_items',
  array['menu_items_admin_all', 'menu_items_public_select', 'menu_items_staff_select'],
  'menu item policies are explicit'
);
select policies_are(
  'public',
  'orders',
  array['orders_staff_insert', 'orders_staff_select', 'orders_staff_update'],
  'order policies are explicit'
);
select function_returns('public', 'send_order_to_cashier', array['uuid'], 'orders', 'send RPC returns order');
select function_returns('public', 'change_order_item_quantity', array['uuid', 'integer'], 'order_items', 'quantity RPC returns item');

insert into auth.users (
  id,
  email,
  aud,
  role,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-4000-9000-000000009901',
  'codex-order-test@example.invalid',
  'authenticated',
  'authenticated',
  '',
  now(),
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{"full_name":"Test ordini"}'::jsonb,
  now(),
  now()
);

update public.profiles
set active = true, role = 'waiter'
where id = '00000000-0000-4000-9000-000000009901';

set local "request.jwt.claims" =
  '{"sub":"00000000-0000-4000-9000-000000009901","role":"authenticated"}';

insert into public.restaurant_tables (id, table_number, display_name)
values
  ('00000000-0000-4000-9000-000000009911', 9901, 'Test invio valido'),
  ('00000000-0000-4000-9000-000000009912', 9902, 'Test invio non valido');

insert into public.orders (id, table_id)
values
  ('00000000-0000-4000-9000-000000009921', '00000000-0000-4000-9000-000000009911'),
  ('00000000-0000-4000-9000-000000009922', '00000000-0000-4000-9000-000000009912');

do $$
begin
  perform public.add_order_item(
    '00000000-0000-4000-9000-000000009921',
    '00000000-0000-4000-8000-000000001001',
    ''
  );
  perform public.add_order_item(
    '00000000-0000-4000-9000-000000009922',
    '00000000-0000-4000-8000-000000001045',
    ''
  );
end;
$$;

select lives_ok(
  $$select public.send_order_to_cashier('00000000-0000-4000-9000-000000009921')$$,
  'a valid order can be sent to the cashier'
);
select is(
  (select status::text from public.orders where id = '00000000-0000-4000-9000-000000009921'),
  'pending_cashier',
  'sending changes the order status'
);
select ok(
  (select sent_to_cashier_at is not null from public.orders where id = '00000000-0000-4000-9000-000000009921'),
  'sending records its timestamp'
);
select is(
  (select status::text from public.print_jobs where order_id = '00000000-0000-4000-9000-000000009921'),
  'pending',
  'sending creates a pending print job'
);
select is(
  (
    select count(*)::integer
    from public.print_jobs
    where order_id = '00000000-0000-4000-9000-000000009921'
  ),
  1,
  'sending creates exactly one print job'
);
select is(
  (
    select job_type::text
    from public.print_jobs
    where order_id = '00000000-0000-4000-9000-000000009921'
  ),
  'new_order',
  'the submitted order creates a new-order job'
);
select is(
  (
    select copies
    from public.print_jobs
    where order_id = '00000000-0000-4000-9000-000000009921'
  ),
  3,
  'the print job always has three copies'
);
select is(
  (
    select idempotency_key
    from public.print_jobs
    where order_id = '00000000-0000-4000-9000-000000009921'
  ),
  '00000000-0000-4000-9000-000000009921:new_order',
  'the idempotency key contains order and type'
);
select is(
  (
    select count(*)::integer
    from public.order_activity
    where order_id = '00000000-0000-4000-9000-000000009921'
      and action = 'sent_to_cashier'
  ),
  1,
  'sending writes an audit event'
);

select throws_ok(
  $$select public.send_order_to_cashier('00000000-0000-4000-9000-000000009922')$$,
  'P0001',
  'Le formule All You Can Eat (1) e i coperti (0) devono coincidere',
  'an invalid All You Can Eat order is rejected'
);
select is(
  (select status::text from public.orders where id = '00000000-0000-4000-9000-000000009922'),
  'draft',
  'a rejected order remains a draft'
);

update public.profiles
set role = 'cashier'
where id = '00000000-0000-4000-9000-000000009901';

select lives_ok(
  $$select public.request_reprint('00000000-0000-4000-9000-000000009921')$$,
  'a cashier can request a reprint'
);
select lives_ok(
  $$select public.request_reprint('00000000-0000-4000-9000-000000009921')$$,
  'a repeated reprint request is idempotent'
);
select is(
  (
    select count(*)::integer
    from public.print_jobs
    where order_id = '00000000-0000-4000-9000-000000009921'
      and job_type = 'reprint'
  ),
  1,
  'only one reprint job exists for the order'
);
select lives_ok(
  $$select public.cancel_order('00000000-0000-4000-9000-000000009921')$$,
  'a cashier can cancel an order'
);
select is(
  (
    select status::text
    from public.print_jobs
    where order_id = '00000000-0000-4000-9000-000000009921'
      and job_type = 'cancellation'
  ),
  'pending',
  'cancelling creates a pending cancellation job'
);
select is(
  (
    select status::text
    from public.print_jobs
    where order_id = '00000000-0000-4000-9000-000000009921'
      and job_type = 'new_order'
  ),
  'cancelled',
  'cancelling stops the unfinished new-order job'
);

select * from finish();
rollback;
