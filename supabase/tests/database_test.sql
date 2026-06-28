begin;
select plan(14);

select has_table('public', 'orders', 'orders exists');
select has_table('public', 'order_items', 'order_items exists');
select has_table('public', 'print_jobs', 'print_jobs exists');
select has_table('public', 'menu_items', 'menu_items exists');
select has_index('public', 'orders', 'orders_one_active_per_table_idx', 'one active order index exists');
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

select * from finish();
rollback;
