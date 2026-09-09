begin;
select plan(1);

-- All fixtures roll back. Exercise the public RPC as authenticated staff,
-- including the SQL implementation, pricing triggers and role boundaries.
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-4000-8000-00000000ef01','order-edit-admin@test.invalid','{}'),
 ('00000000-0000-4000-8000-00000000ef02','order-edit-waiter@test.invalid','{}');
update public.profiles set role='admin',active=true where id='00000000-0000-4000-8000-00000000ef01';
update public.profiles set role='waiter',active=true where id='00000000-0000-4000-8000-00000000ef02';
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ef01',true);
insert into public.restaurant_services(id,business_date,period,opened_by)
 values('00000000-0000-4000-8000-00000000ef03',(now() at time zone 'Europe/Rome')::date,'cena','00000000-0000-4000-8000-00000000ef01');
insert into public.menu_categories(id,name,slug,sort_order)
 values('00000000-0000-4000-8000-00000000ef04','Test pizzas','test-stock',900);
insert into public.menu_items(id,category_id,name,price,preparation_area)
 values('00000000-0000-4000-8000-00000000ef05','00000000-0000-4000-8000-00000000ef04','Pizza test',10,'pizzeria');
insert into public.menu_extras(id,name,price)
 values('00000000-0000-4000-8000-00000000ef06','Salame test',2);
insert into public.restaurant_tables(id,table_number)
 values('00000000-0000-4000-8000-00000000ef07',9875);
update public.menu_items set stock_quantity=2 where id='00000000-0000-4000-8000-00000000ef05';
set local role authenticated;

do $$
declare
  o public.orders;
  failed boolean := false;
  product uuid := '00000000-0000-4000-8000-00000000ef05';
  item uuid := gen_random_uuid();
  variant uuid := gen_random_uuid();
  operation uuid := gen_random_uuid();
  payload jsonb;
begin
  select * into o from public.get_or_create_active_order('00000000-0000-4000-8000-00000000ef07');
  payload := jsonb_build_object('type','add','item_id',item,'menu_item_id',product,'quantity',2);
  perform public.apply_order_edit(o.id,operation,payload);
  perform public.apply_order_edit(o.id,operation,payload);
  if (select stock_quantity from public.menu_items where id=product) <> 0 then raise exception 'Reservation or idempotency failed'; end if;
  set constraints all immediate;
  set constraints all deferred;

  begin
    perform public.apply_order_edit(o.id,gen_random_uuid(),jsonb_build_object('type','add','item_id',gen_random_uuid(),'menu_item_id',product,'quantity',1));
    set constraints all immediate;
  exception when raise_exception then
    if sqlerrm not like 'Quantità disponibile insufficiente%' then raise; end if;
    failed := true;
  end;
  if not failed then raise exception 'Overselling was allowed'; end if;
  if (select stock_quantity from public.menu_items where id=product) <> 0 then raise exception 'Failed edit did not roll back'; end if;

  perform public.apply_order_edit(o.id,gen_random_uuid(),jsonb_build_object('type','note','item_id',item,'new_item_id',variant,'notes','Test','expected_quantity',2));
  set constraints all immediate;
  set constraints all deferred;
  if (select stock_quantity from public.menu_items where id=product) <> 0 then raise exception 'Splitting consumed stock'; end if;

  perform public.apply_order_edit(o.id,gen_random_uuid(),jsonb_build_object('type','remove','item_ids',jsonb_build_array(variant)));
  if (select stock_quantity from public.menu_items where id=product) <> 1 then raise exception 'Removal did not restore stock'; end if;
  perform public.discard_draft_order(o.id);
  if (select stock_quantity from public.menu_items where id=product) <> 2 then raise exception 'Cancellation did not restore stock'; end if;

  update public.menu_items set stock_quantity=null where id=product;
  select * into o from public.get_or_create_active_order('00000000-0000-4000-8000-00000000ef07');
  perform public.apply_order_edit(o.id,gen_random_uuid(),jsonb_build_object('type','add','item_id',gen_random_uuid(),'menu_item_id',product,'quantity',999));
  if (select stock_quantity from public.menu_items where id=product) is not null then raise exception 'Unlimited stock changed'; end if;
  set constraints all immediate;
end;
$$;
reset role;
select pass('Stock: reservation, retries, overselling, variant splits, removal, cancellation, unlimited');
select * from finish();
rollback;
