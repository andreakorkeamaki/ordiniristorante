begin;

-- Keep the existing storage convention: extra.quantity counts extras across
-- the whole row. No historical rows or amounts are rewritten by this migration.
create table private.order_edit_operations (
  operation_id uuid primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  created_by uuid not null references public.profiles(id),
  payload jsonb not null,
  created_at timestamptz not null default now()
);
alter table private.order_edit_operations enable row level security;
revoke all on private.order_edit_operations from public, anon, authenticated;

create or replace function private.prepare_order_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  item public.menu_items;
  source_item public.order_items;
  target_order uuid;
begin
  target_order := coalesce(new.order_id, old.order_id);
  perform 1 from public.orders where id = target_order for update;

  if tg_op = 'INSERT'
    and current_user not in ('authenticated', 'anon')
    and new.id::text = current_setting('appordini.clone_item_id', true)
  then
    select * into source_item from public.order_items
    where id = nullif(current_setting('appordini.clone_source_id', true), '')::uuid
      and order_id = new.order_id;
    if source_item.id is null then raise exception 'Variante sorgente non disponibile'; end if;
    new.menu_item_id := source_item.menu_item_id;
    new.item_name_snapshot := source_item.item_name_snapshot;
    new.item_price_snapshot := source_item.item_price_snapshot;
    new.ingredients_snapshot := source_item.ingredients_snapshot;
    new.preparation_area_snapshot := source_item.preparation_area_snapshot;
    new.created_by := auth.uid();
    new.version := 1;
  elsif tg_op = 'INSERT' then
    select * into item from public.menu_items
    where id = new.menu_item_id and active and available and visible_staff;
    if not found then
      raise exception 'Prodotto non disponibile';
    end if;

    new.item_name_snapshot = item.name;
    new.item_price_snapshot = item.price;
    new.ingredients_snapshot = item.ingredients;
    new.preparation_area_snapshot = item.preparation_area;
    new.created_by = (select auth.uid());
    new.version = 1;
  else
    new.order_id = old.order_id;
    new.menu_item_id = old.menu_item_id;
    new.item_name_snapshot = old.item_name_snapshot;
    new.item_price_snapshot = old.item_price_snapshot;
    new.ingredients_snapshot = old.ingredients_snapshot;
    new.preparation_area_snapshot = old.preparation_area_snapshot;
    new.created_by = old.created_by;
    new.created_at = old.created_at;
  end if;

  new.line_total = new.item_price_snapshot * new.quantity;
  new.updated_by = (select auth.uid());
  new.updated_at = now();
  if tg_op = 'UPDATE' then
    new.version = old.version + 1;
  end if;
  return new;
end;
$$;

create or replace function private.prepare_order_item_extra()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  extra public.menu_extras;
  source_extra public.order_item_extras;
  parent_order uuid;
begin
  select order_id into parent_order
  from public.order_items
  where id = coalesce(new.order_item_id, old.order_item_id);
  perform 1 from public.orders where id = parent_order for update;

  if tg_op = 'INSERT'
    and current_user not in ('authenticated', 'anon')
    and new.id::text = current_setting('appordini.clone_extra_id', true)
  then
    select e.* into source_extra from public.order_item_extras e
    join public.order_items i on i.id=e.order_item_id
    where e.id = nullif(current_setting('appordini.clone_source_extra_id', true), '')::uuid
      and i.order_id = parent_order;
    if source_extra.id is null then raise exception 'Extra sorgente non disponibile'; end if;
    new.menu_extra_id := source_extra.menu_extra_id;
    new.extra_name_snapshot := source_extra.extra_name_snapshot;
    new.extra_price_snapshot := source_extra.extra_price_snapshot;
    new.created_by := auth.uid();
  elsif tg_op = 'INSERT' then
    select * into extra from public.menu_extras
    where id = new.menu_extra_id and active and available and visible_staff;
    if not found then
      raise exception 'Extra non disponibile';
    end if;
    new.extra_name_snapshot = extra.name;
    new.extra_price_snapshot = extra.price;
    new.created_by = (select auth.uid());
  else
    new.order_item_id = old.order_item_id;
    new.menu_extra_id = old.menu_extra_id;
    new.extra_name_snapshot = old.extra_name_snapshot;
    new.extra_price_snapshot = old.extra_price_snapshot;
    new.created_by = old.created_by;
    new.created_at = old.created_at;
  end if;

  new.total = new.extra_price_snapshot * new.quantity;
  new.updated_at = now();
  return new;
end;
$$;


-- A private implementation can preserve price/cost snapshots when splitting
-- an existing pizza; the public wrapper remains security invoker. All access
-- checks below mirror the existing order RLS and are checked before replay.
create or replace function private.order_edit_snapshot(p_order_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select jsonb_build_object(
    'order', to_jsonb(o),
    'items', coalesce((select jsonb_agg(to_jsonb(i) || jsonb_build_object(
      'extras', coalesce((select jsonb_agg(to_jsonb(e) order by e.created_at,e.id)
        from public.order_item_extras e where e.order_item_id=i.id),'[]'::jsonb)
    ) order by i.created_at,i.id) from public.order_items i where i.order_id=o.id),'[]'::jsonb),
    'update_print_status', (select j.status from public.print_jobs j where j.order_id=o.id
      and j.job_type='order_update' order by j.created_at desc,j.id desc limit 1)
  ) from public.orders o where o.id=p_order_id;
$$;
revoke all on function private.order_edit_snapshot(uuid) from public,anon;
grant execute on function private.order_edit_snapshot(uuid) to authenticated;

create or replace function public.get_order_edit_snapshot(p_order_id uuid)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.order_edit_snapshot(p_order_id);
$$;
revoke all on function public.get_order_edit_snapshot(uuid) from public,anon;
grant execute on function public.get_order_edit_snapshot(uuid) to authenticated;

create or replace function private.apply_order_edit(p_order_id uuid,p_operation_id uuid,p_edit jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  target public.orders;
  source public.order_items;
  line public.order_items;
  addition public.order_item_extras;
  prior private.order_edit_operations;
  expected_variant jsonb;
  actual_variant jsonb;
  variant_key text;
  kind text := p_edit->>'type';
  ids uuid[];
  target_id uuid;
  new_id uuid;
  new_extra_id uuid;
  remove_id uuid;
  n integer;
  delta integer;
  remaining integer;
  decrease integer;
  text_note text;
  saved_clone_item text := coalesce(current_setting('appordini.clone_item_id',true),'');
  saved_clone_source text := coalesce(current_setting('appordini.clone_source_id',true),'');
  saved_clone_extra text := coalesce(current_setting('appordini.clone_extra_id',true),'');
  saved_clone_source_extra text := coalesce(current_setting('appordini.clone_source_extra_id',true),'');
begin
  if not private.is_active_staff() then raise exception 'Utente non autorizzato'; end if;
  if p_operation_id is null or p_edit is null or jsonb_typeof(p_edit)<>'object' then
    raise exception 'Operazione non valida';
  end if;
  select * into target from public.orders where id=p_order_id for update;
  if target.id is null or (target.order_type='takeaway' and private.current_role() not in ('cashier','admin'))
    or (target.status='closed' and private.current_role()='waiter') then
    raise exception 'Ordine non disponibile';
  end if;
  select * into prior from private.order_edit_operations where operation_id=p_operation_id;
  if found then
    if prior.order_id<>p_order_id or prior.created_by<>auth.uid() or prior.payload<>p_edit then
      raise exception 'Identificativo operazione già utilizzato';
    end if;
    -- A retry must return current data, not an old snapshot hiding another operator's changes.
    return private.order_edit_snapshot(p_order_id);
  end if;
  if target.status not in ('draft','pending_cashier','confirmed','in_preparation','bill_requested') then
    raise exception 'Ordine non modificabile';
  end if;
  if not exists (select 1 from public.restaurant_services s where s.id=target.service_id
    and s.closed_at is null and s.business_date=(now() at time zone 'Europe/Rome')::date) then
    raise exception 'Il servizio non è operativo';
  end if;

  -- Compare the selected variant, not its version: quantity taps queued by
  -- this operator can safely precede a note without hiding another operator's edit.
  if p_edit ? 'expected_variants' then
    for variant_key, expected_variant in select key,value from jsonb_each(p_edit->'expected_variants') loop
      select jsonb_build_object('notes',i.notes,'extras',coalesce((
        select jsonb_agg(jsonb_build_object('name',e.name,'price',e.price,'quantity',e.quantity))
        from (select extra_name_snapshot as name,extra_price_snapshot as price,
          sum(quantity)::numeric/i.quantity as quantity from public.order_item_extras
          where order_item_id=i.id group by extra_name_snapshot,extra_price_snapshot) e
      ),'[]'::jsonb)) into actual_variant from public.order_items i where i.id=variant_key::uuid and i.order_id=p_order_id;
      if actual_variant is null or actual_variant->>'notes' is distinct from expected_variant->>'notes'
        or not ((actual_variant->'extras') @> (expected_variant->'extras') and (expected_variant->'extras') @> (actual_variant->'extras')) then
        raise exception 'La variante è stata modificata da un altro operatore. Rileggi la comanda.';
      end if;
    end loop;
  end if;

  if kind='add' then
    n := (p_edit->>'quantity')::integer;
    if n is null or n<1 or n>999 then raise exception 'Quantità non valida'; end if;
    insert into public.order_items(id,order_id,menu_item_id,quantity,notes)
      values ((p_edit->>'item_id')::uuid,p_order_id,(p_edit->>'menu_item_id')::uuid,n,'');
  elsif kind in ('quantity','remove') then
    if jsonb_typeof(p_edit->'item_ids') is distinct from 'array' then raise exception 'Righe obbligatorie'; end if;
    select array_agg(value::uuid order by ordinal) into ids
      from jsonb_array_elements_text(p_edit->'item_ids') with ordinality as v(value,ordinal);
    if coalesce(cardinality(ids),0)=0 or cardinality(ids)>999 then raise exception 'Righe non valide'; end if;
    if (select count(*) from public.order_items where order_id=p_order_id and id=any(ids))<>cardinality(ids) then
      raise exception 'Una riga è cambiata. Rileggi la comanda.';
    end if;
    if kind='remove' then
      delete from public.order_items where order_id=p_order_id and id=any(ids);
    else
      delta := (p_edit->>'delta')::integer;
      if delta is null or abs(delta)>999 then raise exception 'Variazione non valida'; end if;
      remaining := abs(delta);
      foreach target_id in array ids loop
        exit when remaining=0;
        select * into line from public.order_items where id=target_id and order_id=p_order_id;
        decrease := least(remaining,line.quantity);
        n := case when delta>0 then line.quantity+remaining else line.quantity-decrease end;
        if n>999 then raise exception 'Quantità massima 999'; end if;
        if n=0 then
          delete from public.order_items where id=line.id;
        else
          -- Legacy mixed rows cannot be guessed into per-pizza variants.
          if exists(select 1 from public.order_item_extras where order_item_id=line.id and quantity % line.quantity<>0) then
            raise exception 'Questa vecchia riga ha extra su quantità diverse. Separala prima di cambiare quantità.';
          end if;
          update public.order_item_extras set quantity=quantity/line.quantity*n where order_item_id=line.id;
          update public.order_items set quantity=n where id=line.id;
        end if;
        remaining := case when delta>0 then 0 else remaining-decrease end;
      end loop;
      if remaining>0 then raise exception 'Quantità insufficiente'; end if;
    end if;
  elsif kind in ('note','extra','remove_extra') then
    select * into source from public.order_items where id=(p_edit->>'item_id')::uuid and order_id=p_order_id;
    if source.id is null then raise exception 'Riga non disponibile'; end if;
    if p_edit ? 'expected_quantity' and source.quantity<>(p_edit->>'expected_quantity')::integer then
      raise exception 'La quantità è stata modificata da un altro operatore. Rileggi la comanda.';
    end if;
    if p_edit ? 'expected_notes' and source.notes is distinct from (p_edit->>'expected_notes') then
      raise exception 'La nota è stata modificata da un altro operatore. Rileggi la comanda.';
    end if;
    text_note := case when kind='note' then coalesce(p_edit->>'notes','') else source.notes end;
    if char_length(text_note)>300 then raise exception 'Nota troppo lunga'; end if;
    if kind='remove_extra' then
      remove_id := (p_edit->>'extra_id')::uuid;
      if not exists(select 1 from public.order_item_extras where id=remove_id and order_item_id=source.id) then
        raise exception 'Extra non disponibile';
      end if;
    end if;
    target_id := source.id;
    if source.quantity>1 then
      if exists(select 1 from public.order_item_extras where order_item_id=source.id and quantity % source.quantity<>0) then
        raise exception 'Questa vecchia riga ha extra su quantità diverse. Rileggi la comanda prima di modificarla.';
      end if;
      new_id := (p_edit->>'new_item_id')::uuid;
      if new_id is null then raise exception 'Identificativo variante obbligatorio'; end if;
      perform set_config('appordini.clone_item_id',new_id::text,true);
      perform set_config('appordini.clone_source_id',source.id::text,true);
      insert into public.order_items(id,order_id,menu_item_id,quantity,notes)
        values(new_id,p_order_id,source.menu_item_id,1,text_note);
      -- Preserve historic cost snapshots when merely splitting an existing sale.
      update private.order_item_cost_snapshots c set unit_cost=old.unit_cost,captured_at=old.captured_at
        from private.order_item_cost_snapshots old where c.order_item_id=new_id and old.order_item_id=source.id;
      for addition in select * from public.order_item_extras where order_item_id=source.id loop
        if addition.id is distinct from remove_id then
          new_extra_id := gen_random_uuid();
          perform set_config('appordini.clone_extra_id',new_extra_id::text,true);
          perform set_config('appordini.clone_source_extra_id',addition.id::text,true);
          insert into public.order_item_extras(id,order_item_id,menu_extra_id,quantity)
            values(new_extra_id,new_id,addition.menu_extra_id,addition.quantity/source.quantity);
          update private.order_item_extra_cost_snapshots c set unit_cost=old.unit_cost,captured_at=old.captured_at
            from private.order_item_extra_cost_snapshots old where c.order_item_extra_id=new_extra_id and old.order_item_extra_id=addition.id;
        end if;
        update public.order_item_extras set quantity=addition.quantity/source.quantity*(source.quantity-1) where id=addition.id;
      end loop;
      update public.order_items set quantity=source.quantity-1 where id=source.id;
      target_id := new_id;
    elsif kind='note' then
      update public.order_items set notes=text_note where id=source.id;
    elsif kind='remove_extra' then
      delete from public.order_item_extras where id=remove_id;
    end if;
    -- Only copied snapshots bypass catalogue checks. A NEW extra must still be available.
    perform set_config('appordini.clone_item_id',saved_clone_item,true);
    perform set_config('appordini.clone_source_id',saved_clone_source,true);
    perform set_config('appordini.clone_extra_id',saved_clone_extra,true);
    perform set_config('appordini.clone_source_extra_id',saved_clone_source_extra,true);
    if kind='extra' then
      insert into public.order_item_extras(order_item_id,menu_extra_id,quantity)
        values(target_id,(p_edit->>'extra_id')::uuid,1);
    end if;
  elsif kind='details' then
    if p_edit ? 'expected_general_notes' and target.general_notes is distinct from p_edit->>'expected_general_notes' then
      raise exception 'La nota generale è stata modificata da un altro operatore. Rileggi la comanda.';
    end if;
    if p_edit ? 'expected_cover_count' and target.cover_count<>(p_edit->>'expected_cover_count')::integer then
      raise exception 'I coperti sono cambiati. Rileggi la comanda.';
    end if;
    n := case when p_edit ? 'cover_count' then (p_edit->>'cover_count')::integer else target.cover_count end;
    text_note := case when p_edit ? 'general_notes' then coalesce(p_edit->>'general_notes','') else target.general_notes end;
    if n is null or n<0 or n>99 or char_length(text_note)>500 then raise exception 'Dati comanda non validi'; end if;
    update public.orders set cover_count=n,general_notes=text_note where id=p_order_id;
  else raise exception 'Operazione non supportata';
  end if;
  perform private.log_order_activity(p_order_id,'order_edited',jsonb_build_object('operation_id',p_operation_id,'type',kind));
  insert into private.order_edit_operations(operation_id,order_id,created_by,payload)
    values(p_operation_id,p_order_id,auth.uid(),p_edit);
  return private.order_edit_snapshot(p_order_id);
end;
$$;
revoke all on function private.apply_order_edit(uuid,uuid,jsonb) from public,anon;
grant execute on function private.apply_order_edit(uuid,uuid,jsonb) to authenticated;
create or replace function public.apply_order_edit(p_order_id uuid,p_operation_id uuid,p_edit jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select private.apply_order_edit(p_order_id,p_operation_id,p_edit);
$$;
revoke all on function public.apply_order_edit(uuid,uuid,jsonb) from public,anon;
grant execute on function public.apply_order_edit(uuid,uuid,jsonb) to authenticated;
commit;
