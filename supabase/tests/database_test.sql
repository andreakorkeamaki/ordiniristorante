begin;
select plan(161);

select has_table('public', 'orders', 'orders exists');
select has_table('public', 'order_items', 'order_items exists');
select has_table('public', 'print_jobs', 'print_jobs exists');
select has_table('public', 'menu_items', 'menu_items exists');
select has_table('public', 'restaurant_services', 'restaurant services exist');
select has_index('public', 'orders', 'orders_one_active_per_table_idx', 'one active order index exists');
select has_index(
  'public',
  'print_jobs',
  'print_jobs_singleton_type_key',
  'single-run print job types remain unique by order'
);
select has_index(
  'public',
  'print_jobs',
  'print_jobs_one_open_update_per_order_idx',
  'only one uncompleted update is queued per order'
);
select has_index(
  'public',
  'restaurant_services',
  'restaurant_services_one_open_idx',
  'only one restaurant service can be open'
);
select has_index(
  'public',
  'restaurant_settings',
  'restaurant_settings_singleton_idx',
  'restaurant settings are a singleton'
);
select has_index(
  'public',
  'print_jobs',
  'print_jobs_one_receipt_per_order_idx',
  'each order has one primary receipt job'
);
select has_index(
  'public',
  'print_jobs',
  'print_jobs_operational_queue_idx',
  'the complete operational print queue is indexed'
);
select has_function(
  'public',
  'get_or_create_receipt_print_job',
  array['uuid'],
  'receipt creation is atomic and idempotent'
);
select has_function(
  'public',
  'claim_print_job',
  array['uuid', 'uuid', 'uuid'],
  'print jobs have an atomic claim RPC'
);
select has_function(
  'public',
  'request_receipt_retry',
  array['uuid', 'uuid', 'text'],
  'receipt retries are persisted'
);
select has_function(
  'public',
  'confirm_receipt_manual_and_close',
  array['uuid', 'bigint', 'text'],
  'manual receipt confirmation and close are atomic'
);
select has_function(
  'public',
  'get_service_close_blockers',
  array['uuid'],
  'service closure exposes blocker counts'
);
select has_function(
  'public',
  'reorder_menu_categories',
  array['uuid[]'],
  'category reorder is transactional'
);
select has_column(
  'public',
  'restaurant_services',
  'forced_close',
  'forced service closure is audited'
);
select has_column(
  'public',
  'restaurant_services',
  'forced_close_reason',
  'forced service closure stores its reason'
);
select has_column('public', 'orders', 'service_id', 'orders belong to a service');
select has_column('public', 'orders', 'order_type', 'orders distinguish tables and takeaways');
select has_column('public', 'orders', 'takeaway_name', 'takeaways store the customer name');
select has_column('public', 'orders', 'takeaway_pickup_at', 'takeaways store the pickup time');
select has_column(
  'public',
  'restaurant_settings',
  'dine_in_print_copies',
  'table print copy invariant is stored'
);
select has_column(
  'public',
  'restaurant_settings',
  'takeaway_print_copies',
  'takeaway print copy invariant is stored'
);
select has_column(
  'public',
  'restaurant_settings',
  'order_ticket_print_mode',
  'order ticket print mode is configurable'
);
select has_function(
  'public',
  'create_takeaway_order',
  array['text', 'timestamp with time zone'],
  'takeaway creation RPC exists'
);
select has_function(
  'public',
  'reorder_menu_items',
  array['uuid', 'uuid[]'],
  'menu item reorder RPC exists'
);
select has_function(
  'public',
  'remove_order_item_extra',
  array['uuid'],
  'extra removal RPC exists'
);
select has_column('public', 'print_jobs', 'manually_confirmed', 'manual confirmation is persisted');
select has_column('public', 'print_jobs', 'manual_confirmed_at', 'manual confirmation has a timestamp');
select has_column('public', 'print_jobs', 'verification_required_at', 'uncertain jobs persist verification state');
select has_column('public', 'print_jobs', 'last_printnode_state', 'the latest PrintNode state is persisted');
select has_column('public', 'print_jobs', 'retry_of_job_id', 'retry attempts keep their parent job');
select has_column('public', 'print_jobs', 'attempt_number', 'retry attempts are numbered');
select has_column('public', 'print_jobs', 'dispatch_token', 'print dispatch has a server lease token');
select has_column('public', 'print_jobs', 'dispatch_expires_at', 'print dispatch leases expire');
select ok(
  not has_function_privilege(
    'authenticated',
    'public.record_printnode_state(uuid,text,text,uuid)',
    'EXECUTE'
  ),
  'browser sessions cannot attest PrintNode state'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.record_printnode_state(uuid,text,text,uuid)',
    'EXECUTE'
  ),
  'the server role can attest verified PrintNode state'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.mark_print_job_delivered(uuid)',
    'EXECUTE'
  ),
  'legacy delivery confirmation is no longer callable'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.mark_printed(uuid)',
    'EXECUTE'
  ),
  'legacy order-level print completion is no longer callable'
);
select ok(
  not coalesce(
    (
      select prosecdef
      from pg_catalog.pg_proc
      where oid = 'public.confirm_print_job_manual(uuid,text)'::regprocedure
    ),
    true
  ),
  'the exposed manual confirmation RPC is a security-invoker wrapper'
);
select ok(
  coalesce(
    (
      select prosecdef
      from pg_catalog.pg_proc
      where oid = 'private.confirm_print_job_manual(uuid,text)'::regprocedure
    ),
    false
  ),
  'the privileged manual confirmation implementation stays in the private schema'
);
select fk_ok(
  'public',
  'orders',
  'service_id',
  'public',
  'restaurant_services',
  'id',
  'orders reference restaurant services'
);
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
select policies_are(
  'public',
  'restaurant_services',
  array[
    'restaurant_services_cashier_insert',
    'restaurant_services_cashier_update',
    'restaurant_services_staff_select'
  ],
  'restaurant service policies are explicit'
);
select policies_are(
  'public',
  'print_jobs',
  array[
    'print_jobs_cashier_insert',
    'print_jobs_staff_select'
  ],
  'print job policies keep state transitions behind audited RPCs'
);
select function_returns('public', 'send_order_to_cashier', array['uuid'], 'orders', 'send RPC returns order');
select function_returns('public', 'change_order_item_quantity', array['uuid', 'integer'], 'order_items', 'quantity RPC returns item');
select function_returns(
  'public',
  'request_print_retry',
  array['uuid', 'uuid', 'text'],
  'print_jobs',
  'retry RPC returns the linked print job'
);
select function_returns(
  'public',
  'confirm_print_job_manual',
  array['uuid', 'text'],
  'print_jobs',
  'manual confirmation RPC returns the print job'
);
select function_returns(
  'public',
  'confirm_table_print_jobs',
  array['uuid', 'uuid[]', 'text'],
  'integer',
  'table confirmation RPC returns the completed count'
);
select function_returns(
  'public',
  'cancel_print_job',
  array['uuid', 'text'],
  'print_jobs',
  'safe cancellation RPC returns the print job'
);

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

select throws_ok(
  $$select public.start_service('pranzo')$$,
  'P0001',
  'Solo cassa o amministratore possono iniziare un servizio',
  'a waiter cannot start a service'
);

update public.profiles
set role = 'cashier'
where id = '00000000-0000-4000-9000-000000009901';

select throws_ok(
  $$select public.start_service('recupero')$$,
  'P0001',
  'Il servizio di recupero è riservato alle comande precedenti',
  'cashier cannot manually create a recovery service'
);
select lives_ok(
  $$select public.start_service('pranzo')$$,
  'a cashier can start lunch service'
);
select is(
  (
    select count(*)::integer
    from public.restaurant_services
    where closed_at is null
  ),
  1,
  'exactly one service is open'
);
select is(
  (
    select period::text
    from public.restaurant_services
    where closed_at is null
  ),
  'pranzo',
  'the requested service period is stored'
);
select throws_ok(
  $$select public.start_service('cena')$$,
  'P0001',
  'Esiste già un servizio aperto',
  'a second concurrent service is rejected'
);

update public.profiles
set role = 'waiter'
where id = '00000000-0000-4000-9000-000000009901';

select throws_ok(
  $$
    select public.close_service(
      (select id from public.restaurant_services where closed_at is null),
      true
    )
  $$,
  'P0001',
  'Solo cassa o amministratore possono chiudere un servizio',
  'a waiter cannot close a service'
);

insert into public.restaurant_tables (id, table_number, display_name)
values
  ('00000000-0000-4000-9000-000000009911', 9901, 'Test invio valido'),
  ('00000000-0000-4000-9000-000000009912', 9902, 'Test invio non valido');

select throws_ok(
  $$
    select public.create_takeaway_order(
      'Giulia Test',
      now() + interval '30 minutes'
    )
  $$,
  'P0001',
  'Solo Cassa e Admin possono creare asporti',
  'a waiter cannot create a takeaway'
);

update public.profiles
set role = 'cashier'
where id = '00000000-0000-4000-9000-000000009901';

select lives_ok(
  $$
    select public.create_takeaway_order(
      'Giulia Test',
      now() + interval '30 minutes'
    )
  $$,
  'a cashier can create a takeaway in the current service'
);
select is(
  (
    select order_type::text
    from public.orders
    where takeaway_name = 'Giulia Test'
  ),
  'takeaway',
  'the takeaway order type is stored'
);
select is(
  (
    select table_id::text
    from public.orders
    where takeaway_name = 'Giulia Test'
  ),
  null::text,
  'a takeaway does not consume a restaurant table'
);
select is(
  (
    select cover_count
    from public.orders
    where takeaway_name = 'Giulia Test'
  ),
  0,
  'a takeaway starts with zero covers'
);
select lives_ok(
  $$
    select public.add_order_item(
      (select id from public.orders where takeaway_name = 'Giulia Test'),
      '00000000-0000-4000-8000-000000001001',
      ''
    )
  $$,
  'products can be added to a takeaway'
);
select lives_ok(
  $$
    select public.add_order_item_extra(
      (
        select id
        from public.order_items
        where order_id = (
          select id from public.orders where takeaway_name = 'Giulia Test'
        )
        limit 1
      ),
      '00000000-0000-4000-8000-000000001080'
    )
  $$,
  'an extra can be added to a takeaway item'
);
select is(
  (
    select count(*)::integer
    from public.order_item_extras
    where order_item_id = (
      select id
      from public.order_items
      where order_id = (
        select id from public.orders where takeaway_name = 'Giulia Test'
      )
      limit 1
    )
  ),
  1,
  'the added extra is stored'
);
select lives_ok(
  $$
    select public.remove_order_item_extra(
      (
        select extra.id
        from public.order_item_extras as extra
        join public.order_items as item on item.id = extra.order_item_id
        where item.order_id = (
          select id from public.orders where takeaway_name = 'Giulia Test'
        )
        limit 1
      )
    )
  $$,
  'an extra can be removed from the order'
);
select is(
  (
    select count(*)::integer
    from public.order_item_extras as extra
    join public.order_items as item on item.id = extra.order_item_id
    where item.order_id = (
      select id from public.orders where takeaway_name = 'Giulia Test'
    )
  ),
  0,
  'the removed extra is no longer stored'
);
select lives_ok(
  $$
    select public.send_order_to_cashier(
      (select id from public.orders where takeaway_name = 'Giulia Test')
    )
  $$,
  'a takeaway can be sent to the cashier'
);
select is(
  (
    select job.copies
    from public.print_jobs as job
    join public.orders as target_order on target_order.id = job.order_id
    where target_order.takeaway_name = 'Giulia Test'
      and job.job_type = 'new_order'
  ),
  3,
  'takeaway command jobs keep the three-sheet invariant'
);

select throws_ok(
  $$
    select public.create_takeaway_order(
      'Asporto giorno errato',
      now() + interval '1 day'
    )
  $$,
  'P0001',
  'L''orario di ritiro deve appartenere al servizio di oggi',
  'a takeaway cannot be attached to a different business day'
);

update public.profiles
set role = 'waiter'
where id = '00000000-0000-4000-9000-000000009901';

set local role authenticated;

select is(
  (
    select count(*)::integer from public.orders where order_type = 'takeaway'
  ),
  0,
  'a waiter cannot read takeaway orders through RLS'
);
select is_empty(
  $$
    update public.order_items
    set quantity = quantity + 1
    where order_id = (
      select id from public.orders where takeaway_name = 'Giulia Test'
    )
    returning id
  $$,
  'a waiter cannot mutate takeaway items through RLS'
);
select is(
  (
    select count(*)::integer
    from public.order_activity
    where payload ->> 'customer_name' = 'Giulia Test'
  ),
  0,
  'a waiter cannot read takeaway customer data through activity history'
);

reset role;

insert into public.orders (id, table_id, service_id)
values
  (
    '00000000-0000-4000-9000-000000009921',
    '00000000-0000-4000-9000-000000009911',
    (select id from public.restaurant_services where closed_at is null)
  ),
  (
    '00000000-0000-4000-9000-000000009922',
    '00000000-0000-4000-9000-000000009912',
    (select id from public.restaurant_services where closed_at is null)
  );

select is(
  (
    select count(distinct service_id)::integer
    from public.orders
    where id in (
      '00000000-0000-4000-9000-000000009921',
      '00000000-0000-4000-9000-000000009922'
    )
  ),
  1,
  'new orders belong to the current service'
);

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
  'the table print job uses the initial table copy setting'
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

update public.profiles
set role = 'admin'
where id = '00000000-0000-4000-9000-000000009901';

select lives_ok(
  $test$
    do $$
    declare
      target_category_id uuid;
      ordered_item_ids uuid[];
    begin
      select id
      into target_category_id
      from public.menu_categories
      where slug = 'rosse';

      select array_agg(id order by name desc, id)
      into ordered_item_ids
      from public.menu_items
      where category_id = target_category_id;

      perform public.reorder_menu_items(
        target_category_id,
        ordered_item_ids
      );
    end;
    $$
  $test$,
  'an admin can save a complete product order inside one category'
);
select is(
  (
    select name
    from public.menu_items
    where category_id = (
      select id from public.menu_categories where slug = 'rosse'
    )
    order by sort_order
    limit 1
  ),
  (
    select max(item.name)
    from public.menu_items as item
    join public.menu_categories as category
      on category.id = item.category_id
    where category.slug = 'rosse'
  ),
  'the saved product order is persisted in sort_order'
);

select throws_ok(
  $$update public.restaurant_settings set dine_in_print_copies = 2$$,
  '23514',
  null,
  'command copy count cannot diverge from three'
);
select throws_ok(
  $$update public.restaurant_settings set order_ticket_print_mode = 'unknown'$$,
  '23514',
  null,
  'command print mode must be one of the supported modes'
);

update public.profiles
set role = 'waiter'
where id = '00000000-0000-4000-9000-000000009901';

select lives_ok(
  $test$
    do $$
    begin
      insert into public.restaurant_tables (id, table_number, display_name)
      values ('00000000-0000-4000-9000-000000009913', 9903, 'Copie future');

      insert into public.orders (id, table_id, service_id)
      values (
        '00000000-0000-4000-9000-000000009923',
        '00000000-0000-4000-9000-000000009913',
        (select id from public.restaurant_services where closed_at is null)
      );

      perform public.add_order_item(
        '00000000-0000-4000-9000-000000009923',
        '00000000-0000-4000-8000-000000001001',
        ''
      );
      perform public.send_order_to_cashier(
        '00000000-0000-4000-9000-000000009923'
      );
    end;
    $$
  $test$,
  'a later table order can be submitted after the setting changes'
);
select is(
  (
    select copies
    from public.print_jobs
    where order_id = '00000000-0000-4000-9000-000000009923'
      and job_type = 'new_order'
  ),
  3,
  'new table jobs always use three copies'
);
select is(
  (
    select copies
    from public.print_jobs
    where order_id = '00000000-0000-4000-9000-000000009921'
      and job_type = 'new_order'
  ),
  3,
  'existing queued jobs remain at three copies'
);

update public.profiles
set role = 'admin'
where id = '00000000-0000-4000-9000-000000009901';

select throws_ok(
  $$update public.restaurant_settings set dine_in_print_copies = 4$$,
  '23514',
  null,
  'copy settings reject values above three'
);

update public.profiles
set role = 'waiter'
where id = '00000000-0000-4000-9000-000000009901';
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

set local role authenticated;

select is_empty(
  $$
    update public.print_jobs
    set status = 'printing',
        printnode_job_id = 990003,
        processing_started_at = now(),
        submitted_at = now(),
        last_attempt_at = now(),
        retry_count = retry_count + 1
    where order_id = '00000000-0000-4000-9000-000000009923'
      and job_type = 'new_order'
      and status = 'pending'
    returning status::text
  $$,
  'a waiter cannot directly start the automatic print state flow'
);
select throws_ok(
  $$
    select public.record_printnode_state(
      (
        select id
        from public.print_jobs
        where order_id = '00000000-0000-4000-9000-000000009923'
          and job_type = 'new_order'
      ),
      'done',
      null,
      '00000000-0000-4000-9000-000000009901'
    )
  $$,
  '42501',
  null,
  'a waiter cannot forge PrintNode completion'
);

select is_empty(
  $$
    update public.print_jobs
    set status = 'printing',
        processing_started_at = now(),
        last_attempt_at = now(),
        retry_count = retry_count + 1
    where order_id = '00000000-0000-4000-9000-000000009921'
      and job_type = 'new_order'
      and status = 'pending'
    returning status::text
  $$,
  'a waiter cannot claim the initial print job directly'
);

reset role;
set local "request.jwt.claims" =
  '{"sub":"00000000-0000-4000-9000-000000009901","role":"service_role"}';
set local role service_role;

select lives_ok(
  $$
    select public.claim_print_job(
      (
        select id from public.print_jobs
        where order_id = '00000000-0000-4000-9000-000000009923'
          and job_type = 'new_order'
      ),
      '00000000-0000-4000-9000-000000009951',
      '00000000-0000-4000-9000-000000009901'
    )
  $$,
  'the server claims a print job with a lease'
);
select lives_ok(
  $$
    select public.record_printnode_submission(
      (
        select id from public.print_jobs
        where order_id = '00000000-0000-4000-9000-000000009923'
          and job_type = 'new_order'
      ),
      990003,
      '00000000-0000-4000-9000-000000009951',
      '00000000-0000-4000-9000-000000009901'
    )
  $$,
  'the server records the PrintNode submission with the same lease'
);
select lives_ok(
  $$
    select public.record_printnode_state(
      (
        select id from public.print_jobs
        where order_id = '00000000-0000-4000-9000-000000009923'
          and job_type = 'new_order'
      ),
      'done',
      null,
      '00000000-0000-4000-9000-000000009901'
    )
  $$,
  'the server records verified PrintNode completion'
);
select is(
  (
    select status::text from public.orders
    where id = '00000000-0000-4000-9000-000000009923'
  ),
  'in_preparation',
  'verified PrintNode completion moves the order to preparation'
);
select lives_ok(
  $$
    select public.claim_print_job(
      (
        select id from public.print_jobs
        where order_id = '00000000-0000-4000-9000-000000009921'
          and job_type = 'new_order'
      ),
      '00000000-0000-4000-9000-000000009952',
      '00000000-0000-4000-9000-000000009901'
    )
  $$,
  'the server claims the other initial print job'
);
select lives_ok(
  $$
    select public.record_printnode_submission(
      (
        select id from public.print_jobs
        where order_id = '00000000-0000-4000-9000-000000009921'
          and job_type = 'new_order'
      ),
      990001,
      '00000000-0000-4000-9000-000000009952',
      '00000000-0000-4000-9000-000000009901'
    )
  $$,
  'the server persists the second PrintNode submission'
);

reset role;
set local "request.jwt.claims" =
  '{"sub":"00000000-0000-4000-9000-000000009901","role":"authenticated"}';

select lives_ok(
  $$select public.send_order_to_cashier('00000000-0000-4000-9000-000000009922')$$,
  'an All You Can Eat order does not have to match the cover count'
);
select is(
  (select status::text from public.orders where id = '00000000-0000-4000-9000-000000009922'),
  'pending_cashier',
  'All You Can Eat quantity and cover count remain independent'
);

update public.profiles
set role = 'cashier'
where id = '00000000-0000-4000-9000-000000009901';

select lives_ok(
  $$
    select public.confirm_print_job_manual(
      (
        select id
        from public.print_jobs
        where order_id = '00000000-0000-4000-9000-000000009921'
          and job_type = 'new_order'
      ),
      'Stampa fisica verificata manualmente dalla cassa nel test'
    )
  $$,
  'the cashier can complete the initial print'
);
select ok(
  (
    select manually_confirmed
      and manual_confirmed_at is not null
      and manual_confirmed_by = '00000000-0000-4000-9000-000000009901'
    from public.print_jobs
    where order_id = '00000000-0000-4000-9000-000000009921'
      and job_type = 'new_order'
  ),
  'manual completion stores actor and timestamp'
);

update public.profiles
set role = 'waiter'
where id = '00000000-0000-4000-9000-000000009901';

select lives_ok(
  $$
    select public.add_order_item(
      '00000000-0000-4000-9000-000000009921',
      '00000000-0000-4000-8000-000000001002',
      ''
    )
  $$,
  'a waiter can add products after the first submission'
);
select is(
  (
    select status::text
    from public.orders
    where id = '00000000-0000-4000-9000-000000009921'
  ),
  'in_preparation',
  'adding products does not reopen or replace the order'
);
select is(
  (
    select count(*)::integer
    from public.print_jobs
    where order_id = '00000000-0000-4000-9000-000000009921'
      and job_type = 'order_update'
      and status = 'pending'
  ),
  1,
  'the first post-submit change creates an update print job'
);

set local role authenticated;

select is_empty(
  $$
    update public.print_jobs
    set status = 'printing',
        processing_started_at = now(),
        last_attempt_at = now(),
        retry_count = retry_count + 1
    where order_id = '00000000-0000-4000-9000-000000009921'
      and job_type = 'order_update'
      and status = 'pending'
    returning status::text
  $$,
  'a waiter cannot directly claim an update print job'
);

reset role;

update public.profiles
set role = 'cashier'
where id = '00000000-0000-4000-9000-000000009901';

update public.print_jobs
set status = 'printing',
    processing_started_at = now() - interval '3 minutes',
    last_attempt_at = now() - interval '3 minutes'
where id = (
  select id
  from public.print_jobs
  where order_id = '00000000-0000-4000-9000-000000009921'
    and job_type = 'order_update'
  order by created_at desc
  limit 1
);

select lives_ok(
  $$select public.flag_stale_print_jobs(2)$$,
  'stale printing jobs can be flagged without being resent'
);
select ok(
  (
    select verification_required_at is not null
    from public.print_jobs
    where order_id = '00000000-0000-4000-9000-000000009921'
      and job_type = 'order_update'
    order by created_at desc
    limit 1
  ),
  'stale jobs persist the verification-required timestamp'
);

update public.print_jobs
set status = 'failed'
where id = (
  select id
  from public.print_jobs
  where order_id = '00000000-0000-4000-9000-000000009921'
    and job_type = 'order_update'
  order by created_at desc
  limit 1
);

select lives_ok(
  $$
    select public.request_print_retry(
      (
        select id
        from public.print_jobs
        where order_id = '00000000-0000-4000-9000-000000009921'
          and job_type = 'order_update'
        order by created_at desc
        limit 1
      ),
      '00000000-0000-4000-9000-000000009931',
      'Verifica retry test'
    )
  $$,
  'a cashier can create a linked retry attempt'
);
select lives_ok(
  $$
    select public.request_print_retry(
      (
        select id
        from public.print_jobs
        where order_id = '00000000-0000-4000-9000-000000009921'
          and job_type = 'order_update'
        order by created_at desc
        limit 1
      ),
      '00000000-0000-4000-9000-000000009931',
      'Verifica retry test'
    )
  $$,
  'the same retry action key returns the existing attempt'
);
select is(
  (
    select count(*)::integer
    from public.print_jobs
    where idempotency_key =
      '00000000-0000-4000-9000-000000009921:reprint:00000000-0000-4000-9000-000000009931'
  ),
  1,
  'a double click creates only one retry attempt'
);
select is(
  (
    select attempt_number
    from public.print_jobs
    where idempotency_key =
      '00000000-0000-4000-9000-000000009921:reprint:00000000-0000-4000-9000-000000009931'
  ),
  2,
  'the linked retry increments the attempt number'
);

select lives_ok(
  $$
    select public.confirm_print_job_manual(
      (
        select id
        from public.print_jobs
        where order_id = '00000000-0000-4000-9000-000000009921'
          and job_type = 'order_update'
        order by created_at desc
        limit 1
      ),
      'Aggiornamento stampato e verificato manualmente nel test'
    )
  $$,
  'the cashier can complete an update print'
);

update public.profiles
set role = 'waiter'
where id = '00000000-0000-4000-9000-000000009901';

select lives_ok(
  $$
    select public.add_order_item(
      '00000000-0000-4000-9000-000000009921',
      '00000000-0000-4000-8000-000000001003',
      ''
    )
  $$,
  'a waiter can add another round after an update was printed'
);
select is(
  (
    select count(*)::integer
    from public.print_jobs
    where order_id = '00000000-0000-4000-9000-000000009921'
      and job_type = 'order_update'
  ),
  2,
  'each completed round can create a later update print job'
);
select is(
  (
    select count(*)::integer
    from public.print_jobs
    where order_id = '00000000-0000-4000-9000-000000009921'
      and job_type = 'order_update'
      and status = 'pending'
  ),
  1,
  'only the latest update round remains pending'
);

update public.profiles
set role = 'waiter'
where id = '00000000-0000-4000-9000-000000009901';

set local role authenticated;

select lives_ok(
  $$
    select public.request_reprint(
      '00000000-0000-4000-9000-000000009921',
      '00000000-0000-4000-9000-000000009941',
      'Ristampa richiesta dai tavoli'
    )
  $$,
  'a waiter can request a table reprint'
);
select lives_ok(
  $$
    select public.request_reprint(
      '00000000-0000-4000-9000-000000009921',
      '00000000-0000-4000-9000-000000009941',
      'Ristampa richiesta dai tavoli'
    )
  $$,
  'a repeated table reprint action is idempotent'
);
select is(
  (
    select count(*)::integer
    from public.print_jobs
    where idempotency_key =
      '00000000-0000-4000-9000-000000009921:reprint:00000000-0000-4000-9000-000000009941'
  ),
  1,
  'only one table reprint exists for the repeated action'
);
select is_empty(
  $$
    update public.print_jobs
    set status = 'printing'
    where idempotency_key =
      '00000000-0000-4000-9000-000000009921:reprint:00000000-0000-4000-9000-000000009941'
      and status = 'pending'
    returning status::text
  $$,
  'a waiter cannot directly claim the table reprint they requested'
);

reset role;

update public.profiles
set role = 'cashier'
where id = '00000000-0000-4000-9000-000000009901';

select lives_ok(
  $$select public.cancel_order('00000000-0000-4000-9000-000000009921')$$,
  'a cashier can cancel an order'
);
select lives_ok(
  $$
    select public.cancel_order(
      (select id from public.orders where takeaway_name = 'Giulia Test')
    )
  $$,
  'a cashier can cancel a takeaway'
);
select lives_ok(
  $$select public.cancel_order('00000000-0000-4000-9000-000000009923')$$,
  'a cashier can cancel the later table order'
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
  'printed',
  'cancelling preserves the completed new-order print'
);

update public.print_jobs
set status = 'printed',
    printed_at = coalesce(printed_at, now())
where order_id in (
    select id
    from public.orders
    where service_id = (
      select id from public.restaurant_services where closed_at is null
    )
  )
  and status = 'printing';

insert into public.print_jobs(
  order_id,
  job_type,
  idempotency_key,
  status,
  copies,
  labels,
  created_by
) values (
  '00000000-0000-4000-9000-000000009922',
  'reprint',
  '00000000-0000-4000-9000-000000009922:reprint:service-close-blocker',
  'printing',
  3,
  '["RISTAMPA"]'::jsonb,
  '00000000-0000-4000-9000-000000009901'
);

select throws_ok(
  $$
    select public.close_service(
      (select id from public.restaurant_services where closed_at is null),
      true,
      'Tentativo forzato con job ancora in stampa'
    )
  $$,
  'P0001',
  'Ci sono 1 job in stampa o da verificare',
  'service closure cannot hide a printing job even when forced'
);
select lives_ok(
  $$
    select public.confirm_print_job_manual(
      (
        select id
        from public.print_jobs
        where idempotency_key =
          '00000000-0000-4000-9000-000000009922:reprint:service-close-blocker'
      ),
      'Ristampa fisica verificata manualmente prima della chiusura servizio'
    )
  $$,
  'the printing job is explicitly resolved before service closure'
);

savepoint receipt_state_machine_tests;

update public.orders
set status = 'bill_requested'
where id = '00000000-0000-4000-9000-000000009922';

select lives_ok(
  $$
    select public.get_or_create_receipt_print_job(
      '00000000-0000-4000-9000-000000009922'
    )
  $$,
  'receipt job is created before printing'
);
select is(
  (
    select job_type::text
    from public.print_jobs
    where order_id = '00000000-0000-4000-9000-000000009922'
      and job_type = 'receipt'
  ),
  'receipt',
  'receipt job type is persisted'
);
select is(
  (
    select copies
    from public.print_jobs
    where order_id = '00000000-0000-4000-9000-000000009922'
      and job_type = 'receipt'
  ),
  1,
  'receipt records exactly one copy'
);

set local "request.jwt.claims" =
  '{"sub":"00000000-0000-4000-9000-000000009901","role":"service_role"}';
set local role service_role;

select is(
  (
    select public.claim_print_job(
      (
        select id
        from public.print_jobs
        where order_id = '00000000-0000-4000-9000-000000009922'
          and job_type = 'receipt'
      ),
      '00000000-0000-4000-9000-000000009961',
      '00000000-0000-4000-9000-000000009901'
    ) -> 'job' ->> 'status'
  ),
  'printing',
  'the first receipt claim starts printing'
);
select is(
  (
    select (public.claim_print_job(
      (
        select id
        from public.print_jobs
        where order_id = '00000000-0000-4000-9000-000000009922'
          and job_type = 'receipt'
      ),
      '00000000-0000-4000-9000-000000009962',
      '00000000-0000-4000-9000-000000009901'
    ) ->> 'claimed')::boolean
  ),
  false,
  'a concurrent second claim is explicitly rejected'
);

reset role;
set local "request.jwt.claims" =
  '{"sub":"00000000-0000-4000-9000-000000009901","role":"authenticated"}';

select throws_ok(
  $$select public.cancel_order('00000000-0000-4000-9000-000000009922')$$,
  'P0001',
  'Scontrino in stampa o da verificare: risolvi il job prima di annullare',
  'cancellation cannot race a claimed receipt'
);
select throws_ok(
  $$
    select public.close_order(
      '00000000-0000-4000-9000-000000009922',
      (select version from public.orders where id = '00000000-0000-4000-9000-000000009922')
    )
  $$,
  'P0001',
  'Lo scontrino non è ancora confermato',
  'an order cannot close before receipt confirmation'
);
select lives_ok(
  $$
    select public.confirm_receipt_manual_and_close(
      (
        select id
        from public.print_jobs
        where order_id = '00000000-0000-4000-9000-000000009922'
          and job_type = 'receipt'
      ),
      (select version from public.orders where id = '00000000-0000-4000-9000-000000009922'),
      'Scontrino stampato manualmente e verificato nel test'
    )
  $$,
  'manual fallback confirms receipt and closes atomically'
);
select is(
  (
    select status::text
    from public.orders
    where id = '00000000-0000-4000-9000-000000009922'
  ),
  'closed',
  'manual receipt confirmation really closes the database row'
);

rollback to savepoint receipt_state_machine_tests;

savepoint receipt_confirmed_printed_order_close_tests;

update public.orders
set status = 'confirmed'
where id = '00000000-0000-4000-9000-000000009922';

update public.print_jobs
set status = 'printed',
    printed_at = coalesce(printed_at, now())
where order_id = '00000000-0000-4000-9000-000000009922'
  and job_type = 'new_order';

select lives_ok(
  $$
    select public.get_or_create_receipt_print_job(
      '00000000-0000-4000-9000-000000009922'
    )
  $$,
  'a confirmed order with printed command can prepare a receipt'
);

set local "request.jwt.claims" =
  '{"sub":"00000000-0000-4000-9000-000000009901","role":"service_role"}';
set local role service_role;

select is(
  (
    select public.claim_print_job(
      (
        select id
        from public.print_jobs
        where order_id = '00000000-0000-4000-9000-000000009922'
          and job_type = 'receipt'
      ),
      '00000000-0000-4000-9000-000000009963',
      '00000000-0000-4000-9000-000000009901'
    ) -> 'job' ->> 'status'
  ),
  'printing',
  'a confirmed order with printed command can claim the receipt'
);
select lives_ok(
  $$
    select public.record_printnode_submission(
      (
        select id
        from public.print_jobs
        where order_id = '00000000-0000-4000-9000-000000009922'
          and job_type = 'receipt'
      ),
      990004,
      '00000000-0000-4000-9000-000000009963',
      '00000000-0000-4000-9000-000000009901'
    )
  $$,
  'the server persists the verified receipt submission'
);
select lives_ok(
  $$
    select public.record_printnode_state(
      (
        select id
        from public.print_jobs
        where order_id = '00000000-0000-4000-9000-000000009922'
          and job_type = 'receipt'
      ),
      'done',
      null,
      '00000000-0000-4000-9000-000000009901'
    )
  $$,
  'verified PrintNode receipt completion is recorded by the server'
);

reset role;
set local "request.jwt.claims" =
  '{"sub":"00000000-0000-4000-9000-000000009901","role":"authenticated"}';
select is(
  (
    select status::text
    from public.orders
    where id = '00000000-0000-4000-9000-000000009922'
  ),
  'closed',
  'verified receipt completion closes the confirmed order automatically'
);

rollback to savepoint receipt_confirmed_printed_order_close_tests;

select throws_ok(
  $$
    select public.close_service(
      (select id from public.restaurant_services where closed_at is null),
      false
    )
  $$,
  'P0001',
  'Ci sono ancora 1 ordini aperti',
  'closing without confirmation refuses open tables'
);
select lives_ok(
  $$
    select public.close_service(
      (select id from public.restaurant_services where closed_at is null),
      true,
      'Chiusura forzata controllata dal test database'
    )
  $$,
  'confirmed service closure succeeds'
);
select is(
  (
    select count(*)::integer
    from public.restaurant_services
    where closed_at is null
  ),
  0,
  'service closure leaves no current service'
);
select is(
  (
    select status::text
    from public.orders
    where id = '00000000-0000-4000-9000-000000009922'
  ),
  'closed',
  'submitted orders are closed when the service closes'
);
select is(
  (
    select count(*)::integer
    from public.orders
    where status in (
      'draft',
      'pending_cashier',
      'confirmed',
      'in_preparation',
      'bill_requested'
    )
  ),
  0,
  'all tables are free after service closure'
);
select lives_ok(
  $$select public.start_service('cena')$$,
  'a new dinner service can start after lunch closes'
);
select lives_ok(
  $$
    select public.close_service(
      (select id from public.restaurant_services where closed_at is null),
      false
    )
  $$,
  'an empty service closes without force'
);

update public.profiles
set role = 'waiter'
where id = '00000000-0000-4000-9000-000000009901';

select throws_ok(
  $$
    select public.get_or_create_active_order(
      '00000000-0000-4000-9000-000000009912'
    )
  $$,
  'P0001',
  'Nessun servizio aperto. Chiedi alla cassa di iniziare il servizio',
  'a waiter cannot open a table without a current service'
);

select * from finish();
rollback;
