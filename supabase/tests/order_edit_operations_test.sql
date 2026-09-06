begin;
select plan(1);

-- All fixtures roll back. Exercise the public RPC as authenticated staff,
-- including the SQL implementation, pricing triggers and role boundaries.
insert into auth.users(id,email,raw_user_meta_data) values
 ('00000000-0000-4000-8000-00000000ee01','order-edit-admin@test.invalid','{}'),
 ('00000000-0000-4000-8000-00000000ee02','order-edit-waiter@test.invalid','{}');
update public.profiles set role='admin',active=true where id='00000000-0000-4000-8000-00000000ee01';
update public.profiles set role='waiter',active=true where id='00000000-0000-4000-8000-00000000ee02';
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-00000000ee01',true);
insert into public.restaurant_services(id,business_date,period,opened_by)
 values('00000000-0000-4000-8000-00000000ee03',(now() at time zone 'Europe/Rome')::date,'cena','00000000-0000-4000-8000-00000000ee01');
insert into public.menu_categories(id,name,slug,sort_order)
 values('00000000-0000-4000-8000-00000000ee04','Test pizzas','test-order-edit',900);
insert into public.menu_items(id,category_id,name,price,preparation_area)
 values('00000000-0000-4000-8000-00000000ee05','00000000-0000-4000-8000-00000000ee04','Pizza test',10,'pizzeria');
insert into public.menu_extras(id,name,price)
 values('00000000-0000-4000-8000-00000000ee06','Salame test',2);
insert into public.restaurant_tables(id,table_number)
 values('00000000-0000-4000-8000-00000000ee07',9876);
set local role authenticated;

do $$
declare
  o public.orders;
  s jsonb;
  extra_id uuid;
  failed boolean;
  extra_edit jsonb := '{"type":"extra","item_id":"00000000-0000-4000-8000-00000000ee10","extra_id":"00000000-0000-4000-8000-00000000ee06","new_item_id":"00000000-0000-4000-8000-00000000ee11","expected_quantity":5}'::jsonb;
begin
  select * into o from public.get_or_create_active_order('00000000-0000-4000-8000-00000000ee07');
  s:=public.apply_order_edit(o.id,'00000000-0000-4000-8000-00000000ee20',
    '{"type":"add","item_id":"00000000-0000-4000-8000-00000000ee10","menu_item_id":"00000000-0000-4000-8000-00000000ee05","quantity":5}');
  if (s->'order'->>'subtotal')::numeric<>50 then raise exception 'bulk add total'; end if;
  if not exists (
    select 1 from public.order_activity
    where order_id=o.id and action='item_added'
      and payload @> '{"item_id":"00000000-0000-4000-8000-00000000ee10","quantity":5}'::jsonb
  ) then raise exception 'bulk add print activity'; end if;
  s:=public.apply_order_edit(o.id,'00000000-0000-4000-8000-00000000ee20',
    '{"type":"add","item_id":"00000000-0000-4000-8000-00000000ee10","menu_item_id":"00000000-0000-4000-8000-00000000ee05","quantity":5}');
  if (
    select count(*) from public.order_activity
    where order_id=o.id and action='item_added'
      and payload @> '{"item_id":"00000000-0000-4000-8000-00000000ee10","quantity":5}'::jsonb
  )<>1 then raise exception 'bulk add retry duplicated print activity'; end if;
  s:=public.apply_order_edit(o.id,'00000000-0000-4000-8000-00000000ee21',extra_edit);
  if jsonb_array_length(s->'items')<>2 or (s->'order'->>'subtotal')::numeric<>52 then raise exception 'split extra'; end if;
  if (select quantity from public.order_items where id='00000000-0000-4000-8000-00000000ee10')<>4 then raise exception 'split preserves four plain'; end if;
  s:=public.apply_order_edit(o.id,'00000000-0000-4000-8000-00000000ee22',
    '{"type":"quantity","item_ids":["00000000-0000-4000-8000-00000000ee11"],"delta":4}');
  if (s->'order'->>'subtotal')::numeric<>100 then raise exception 'variant quantity scales extra'; end if;
  if not exists (
    select 1 from public.order_activity
    where order_id=o.id and action='item_quantity_changed'
      and payload @> '{"item_id":"00000000-0000-4000-8000-00000000ee11","delta":4}'::jsonb
  ) then raise exception 'quantity increase print activity'; end if;
  if (select quantity from public.order_item_extras where order_item_id='00000000-0000-4000-8000-00000000ee11')<>5 then raise exception 'extra physical quantity'; end if;
  s:=public.apply_order_edit(o.id,'00000000-0000-4000-8000-00000000ee21',extra_edit);
  if (s->'order'->>'subtotal')::numeric<>100 or jsonb_array_length(s->'items')<>2 then raise exception 'retry fresh snapshot without duplicate'; end if;
  -- Copy already-ordered snapshots even if catalogue price/availability changes.
  update public.menu_items set price=99,available=false where id='00000000-0000-4000-8000-00000000ee05';
  update public.menu_extras set price=77,available=false where id='00000000-0000-4000-8000-00000000ee06';
  s:=public.apply_order_edit(o.id,'00000000-0000-4000-8000-00000000ee23',
    '{"type":"note","item_id":"00000000-0000-4000-8000-00000000ee11","new_item_id":"00000000-0000-4000-8000-00000000ee12","notes":"Ben cotta","expected_notes":"","expected_quantity":5}');
  if (s->'order'->>'subtotal')::numeric<>100 then raise exception 'note split preserves historical price'; end if;
  select id into extra_id from public.order_item_extras where order_item_id='00000000-0000-4000-8000-00000000ee12';
  s:=public.apply_order_edit(o.id,'00000000-0000-4000-8000-00000000ee24',jsonb_build_object(
    'type','remove_extra','item_id','00000000-0000-4000-8000-00000000ee12','extra_id',extra_id,'new_item_id',gen_random_uuid(),'expected_quantity',1));
  if (s->'order'->>'subtotal')::numeric<>98 then raise exception 'remove extra on quantity one'; end if;
  failed:=false;
  begin
    perform public.apply_order_edit(o.id,gen_random_uuid(),'{"type":"note","item_id":"00000000-0000-4000-8000-00000000ee12","notes":"Conflict","expected_notes":"wrong","new_item_id":"00000000-0000-4000-8000-00000000ee13"}');
  exception when others then failed:=true; end;
  if not failed then raise exception 'note conflict was accepted'; end if;
  failed:=false;
  begin
    perform public.apply_order_edit(o.id,gen_random_uuid(),'{"type":"quantity","item_ids":["00000000-0000-4000-8000-00000000ee12"],"delta":1,"expected_variants":{"00000000-0000-4000-8000-00000000ee12":{"notes":"wrong","extras":[]}}}');
  exception when others then failed:=true; end;
  if not failed then raise exception 'variant conflict was accepted'; end if;
  s:=public.apply_order_edit(o.id,gen_random_uuid(),'{"type":"details","cover_count":5,"expected_cover_count":0,"general_notes":"Together","expected_general_notes":""}');
  if (s->'order'->>'total')::numeric<>(98+5*(s->'order'->>'cover_price_snapshot')::numeric) then raise exception 'cover total'; end if;
  s:=public.apply_order_edit(o.id,gen_random_uuid(),'{"type":"remove","item_ids":["00000000-0000-4000-8000-00000000ee10","00000000-0000-4000-8000-00000000ee12"]}');
  if jsonb_array_length(s->'items')<>1 or (s->'order'->>'subtotal')::numeric<>48 then raise exception 'remove selected group'; end if;
  failed:=false;
  begin
    perform public.apply_order_edit(o.id,gen_random_uuid(),'{"type":"extra","item_id":"00000000-0000-4000-8000-00000000ee11","extra_id":"00000000-0000-4000-8000-00000000ee06","new_item_id":"00000000-0000-4000-8000-00000000ee14"}');
  exception when others then failed:=true; end;
  if not failed then raise exception 'unavailable new extra was accepted'; end if;
  if (public.get_order_edit_snapshot(o.id)->'order'->>'subtotal')::numeric<>48 then raise exception 'failed transaction changed total'; end if;
  -- Same operation id with a different body must fail.
  failed:=false;
  begin
    perform public.apply_order_edit(o.id,'00000000-0000-4000-8000-00000000ee21','{"type":"details","cover_count":0}');
  exception when others then failed:=true; end;
  if not failed then raise exception 'operation identity reused'; end if;
end;
$$;
reset role;
select pass('atomic order edits: bulk quantities, variants, extras, snapshots, conflicts, rollback and retry');
select * from finish();
rollback;
