begin;
select plan(1);

insert into auth.users(id,email,raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000fd01','table-lifecycle-waiter@test.invalid','{}'),
  ('00000000-0000-4000-8000-00000000fd02','table-lifecycle-admin@test.invalid','{}');
update public.profiles set role='waiter',active=true
where id='00000000-0000-4000-8000-00000000fd01';
update public.profiles set role='admin',active=true
where id='00000000-0000-4000-8000-00000000fd02';
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000fd01',true);

insert into public.restaurant_services(id,business_date,period,opened_by)
values(
  '00000000-0000-4000-8000-00000000fd03',
  (now() at time zone 'Europe/Rome')::date,
  'cena',
  '00000000-0000-4000-8000-00000000fd02'
);
insert into public.menu_categories(id,name,slug,sort_order)
values('00000000-0000-4000-8000-00000000fd04','Lifecycle','table-lifecycle',950);
insert into public.menu_items(id,category_id,name,price,preparation_area)
values(
  '00000000-0000-4000-8000-00000000fd05',
  '00000000-0000-4000-8000-00000000fd04',
  'Acqua lifecycle',
  2,
  'bar'
);
insert into public.restaurant_tables(id,table_number) values
  ('00000000-0000-4000-8000-00000000fd06',9901),
  ('00000000-0000-4000-8000-00000000fd07',9902);

set local role authenticated;

do $$
declare
  snapshot jsonb;
  order_id uuid;
  failed boolean := false;
begin
  if exists (
    select 1 from public.orders
    where table_id='00000000-0000-4000-8000-00000000fd06'
  ) then raise exception 'opening a table created an order'; end if;

  snapshot:=public.start_table_order_with_item(
    '00000000-0000-4000-8000-00000000fd06',
    '00000000-0000-4000-8000-00000000fd08',
    '00000000-0000-4000-8000-00000000fd09',
    '00000000-0000-4000-8000-00000000fd05',
    2
  );
  order_id:=(snapshot->'order'->>'id')::uuid;
  if jsonb_array_length(snapshot->'items')<>1
    or (snapshot->'items'->0->>'quantity')::integer<>2
  then raise exception 'first item was not created atomically'; end if;

  snapshot:=public.start_table_order_with_item(
    '00000000-0000-4000-8000-00000000fd06',
    '00000000-0000-4000-8000-00000000fd08',
    '00000000-0000-4000-8000-00000000fd09',
    '00000000-0000-4000-8000-00000000fd05',
    2
  );
  if jsonb_array_length(snapshot->'items')<>1
    or (snapshot->'items'->0->>'quantity')::integer<>2
  then raise exception 'first item retry was duplicated'; end if;

  begin
    update public.orders set status='cancelled' where id=order_id;
  exception when others then
    failed:=true;
  end;
  if not failed then raise exception 'waiter bypassed draft discard RPC'; end if;

  perform public.discard_draft_order(order_id);
  if (select status from public.orders where id=order_id)<>'cancelled' then
    raise exception 'draft table was not cancelled';
  end if;

  failed:=false;
  begin
    perform public.start_table_order_with_item(
      '00000000-0000-4000-8000-00000000fd07',
      '00000000-0000-4000-8000-00000000fd10',
      '00000000-0000-4000-8000-00000000fd11',
      '00000000-0000-4000-8000-00000000fd12',
      1
    );
  exception when others then
    failed:=true;
  end;
  if not failed then raise exception 'invalid first product was accepted'; end if;
  if exists (
    select 1 from public.orders
    where table_id='00000000-0000-4000-8000-00000000fd07'
  ) then raise exception 'failed first item left an empty order'; end if;
end;
$$;

reset role;
select pass('table orders start with the first item and draft cancellation is safe');
select * from finish();
rollback;
