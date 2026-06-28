begin;

create extension if not exists pgcrypto;

create type public.app_role as enum ('waiter', 'cashier', 'admin');
create type public.order_status as enum (
  'draft',
  'pending_cashier',
  'confirmed',
  'in_preparation',
  'bill_requested',
  'closed',
  'cancelled'
);
create type public.print_status as enum ('pending', 'printing', 'printed', 'failed', 'cancelled');
create type public.preparation_area as enum ('pizzeria', 'cucina', 'bar', 'cassa');

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role public.app_role not null default 'waiter',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.restaurant_settings (
  id uuid primary key default gen_random_uuid(),
  restaurant_name text not null,
  cover_charge numeric(10, 2) not null default 1.90 check (cover_charge >= 0),
  default_print_copies integer not null default 3 check (default_print_copies between 1 and 10),
  allergen_notice text,
  ticket_footer text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  table_number integer not null unique check (table_number > 0),
  display_name text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.menu_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_en text,
  slug text not null unique,
  description text,
  description_en text,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.menu_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.menu_categories(id) on delete restrict,
  name text not null,
  name_en text,
  description text,
  description_en text,
  ingredients text,
  ingredients_en text,
  price numeric(10, 2) not null check (price >= 0),
  active boolean not null default true,
  available boolean not null default true,
  visible_public boolean not null default true,
  visible_staff boolean not null default true,
  preparation_area public.preparation_area not null default 'cucina',
  allergens text[] not null default '{}',
  vegetarian boolean not null default false,
  vegan boolean not null default false,
  image_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index menu_items_category_sort_idx on public.menu_items(category_id, sort_order);
create index menu_items_public_idx on public.menu_items(category_id, sort_order)
where active and available and visible_public;

create table public.menu_extras (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.menu_categories(id) on delete set null,
  name text not null,
  price numeric(10, 2) not null check (price >= 0),
  active boolean not null default true,
  available boolean not null default true,
  visible_public boolean not null default true,
  visible_staff boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index menu_extras_category_idx on public.menu_extras(category_id, sort_order);

create sequence public.order_number_seq start 1;

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number bigint not null unique default nextval('public.order_number_seq'),
  table_id uuid not null references public.restaurant_tables(id) on delete restrict,
  status public.order_status not null default 'draft',
  cover_count integer not null default 0 check (cover_count between 0 and 99),
  cover_price_snapshot numeric(10, 2) not null check (cover_price_snapshot >= 0),
  subtotal numeric(10, 2) not null default 0 check (subtotal >= 0),
  cover_total numeric(10, 2) not null default 0 check (cover_total >= 0),
  total numeric(10, 2) not null default 0 check (total >= 0),
  general_notes text not null default '',
  version bigint not null default 1,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  updated_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_to_cashier_at timestamptz,
  closed_at timestamptz
);
create index orders_table_id_idx on public.orders(table_id);
create index orders_created_by_idx on public.orders(created_by);
create index orders_updated_by_idx on public.orders(updated_by);
create index orders_status_created_idx on public.orders(status, created_at desc);
create unique index orders_one_active_per_table_idx on public.orders(table_id)
where status in ('draft', 'pending_cashier', 'confirmed', 'in_preparation', 'bill_requested');

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  menu_item_id uuid references public.menu_items(id) on delete set null,
  item_name_snapshot text not null,
  item_price_snapshot numeric(10, 2) not null check (item_price_snapshot >= 0),
  ingredients_snapshot text,
  quantity integer not null default 1 check (quantity > 0),
  line_total numeric(10, 2) not null check (line_total >= 0),
  notes text not null default '',
  preparation_area_snapshot public.preparation_area not null,
  version bigint not null default 1,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  updated_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index order_items_order_id_idx on public.order_items(order_id);
create index order_items_menu_item_id_idx on public.order_items(menu_item_id);
create index order_items_updated_by_idx on public.order_items(updated_by);

create table public.order_item_extras (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete cascade,
  menu_extra_id uuid references public.menu_extras(id) on delete set null,
  extra_name_snapshot text not null,
  extra_price_snapshot numeric(10, 2) not null check (extra_price_snapshot >= 0),
  quantity integer not null default 1 check (quantity > 0),
  total numeric(10, 2) not null check (total >= 0),
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index order_item_extras_item_id_idx on public.order_item_extras(order_item_id);
create index order_item_extras_extra_id_idx on public.order_item_extras(menu_extra_id);

create table public.print_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  status public.print_status not null default 'pending',
  copies integer not null default 3 check (copies between 1 and 10),
  printer_target text not null default 'cashier',
  labels jsonb not null default '["COPIA PIZZERIA", "COPIA CUCINA", "COPIA CASSA"]'::jsonb,
  retry_count integer not null default 0 check (retry_count >= 0),
  error_message text,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  printed_at timestamptz
);
create index print_jobs_status_created_idx on public.print_jobs(status, created_at);
create index print_jobs_created_by_idx on public.print_jobs(created_by);

create table public.order_activity (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null default auth.uid(),
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index order_activity_order_created_idx on public.order_activity(order_id, created_at desc);
create index order_activity_user_id_idx on public.order_activity(user_id);

create or replace function private.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.profiles
  where id = (select auth.uid()) and active;
$$;

create or replace function private.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and active
  );
$$;

grant execute on function private.current_role() to authenticated;
grant execute on function private.is_active_staff() to authenticated;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
for each row execute function private.touch_updated_at();
create trigger settings_touch before update on public.restaurant_settings
for each row execute function private.touch_updated_at();
create trigger tables_touch before update on public.restaurant_tables
for each row execute function private.touch_updated_at();
create trigger categories_touch before update on public.menu_categories
for each row execute function private.touch_updated_at();
create trigger menu_items_touch before update on public.menu_items
for each row execute function private.touch_updated_at();
create trigger menu_extras_touch before update on public.menu_extras
for each row execute function private.touch_updated_at();
create trigger print_jobs_touch before update on public.print_jobs
for each row execute function private.touch_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, role, active)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), split_part(new.email, '@', 1)),
    'waiter',
    false
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function private.prepare_order()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  configured_cover numeric(10, 2);
begin
  if tg_op = 'INSERT' then
    select cover_charge into configured_cover
    from public.restaurant_settings
    order by created_at
    limit 1;
    new.cover_price_snapshot = coalesce(configured_cover, 1.90);
    new.created_by = (select auth.uid());
    new.version = 1;
  else
    new.order_number = old.order_number;
    new.table_id = old.table_id;
    new.cover_price_snapshot = old.cover_price_snapshot;
    new.created_by = old.created_by;
    new.created_at = old.created_at;

    if new.status <> old.status and private.current_role() = 'waiter' then
      if not (
        (old.status = 'draft' and new.status = 'pending_cashier')
        or (old.status = 'in_preparation' and new.status = 'bill_requested')
      ) then
        raise exception 'Transizione di stato non consentita al cameriere';
      end if;
    end if;
  end if;

  new.updated_by = (select auth.uid());
  new.updated_at = now();
  if tg_op = 'UPDATE' then
    new.version = old.version + 1;
  end if;
  return new;
end;
$$;

create trigger orders_prepare
before insert or update on public.orders
for each row execute function private.prepare_order();

create or replace function private.prepare_order_item()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  item public.menu_items;
  target_order uuid;
begin
  target_order := coalesce(new.order_id, old.order_id);
  perform 1 from public.orders where id = target_order for update;

  if tg_op = 'INSERT' then
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

create trigger order_items_prepare
before insert or update on public.order_items
for each row execute function private.prepare_order_item();

create or replace function private.prepare_order_item_extra()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  extra public.menu_extras;
  parent_order uuid;
begin
  select order_id into parent_order
  from public.order_items
  where id = coalesce(new.order_item_id, old.order_item_id);
  perform 1 from public.orders where id = parent_order for update;

  if tg_op = 'INSERT' then
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

create trigger order_item_extras_prepare
before insert or update on public.order_item_extras
for each row execute function private.prepare_order_item_extra();

create or replace function private.recalculate_order_totals(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item_total numeric(10, 2);
begin
  select coalesce(sum(oi.line_total + coalesce(extra.total, 0)), 0)
  into item_total
  from public.order_items oi
  left join (
    select order_item_id, sum(total) as total
    from public.order_item_extras
    group by order_item_id
  ) extra on extra.order_item_id = oi.id
  where oi.order_id = p_order_id;

  update public.orders
  set subtotal = item_total,
      cover_total = cover_count * cover_price_snapshot,
      total = item_total + (cover_count * cover_price_snapshot),
      updated_by = coalesce((select auth.uid()), updated_by),
      updated_at = now(),
      version = version + 1
  where id = p_order_id;
end;
$$;

create or replace function private.refresh_order_from_item()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.recalculate_order_totals(coalesce(new.order_id, old.order_id));
  return coalesce(new, old);
end;
$$;

create trigger order_items_recalculate
after insert or update or delete on public.order_items
for each row execute function private.refresh_order_from_item();

create or replace function private.refresh_order_from_extra()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent_order uuid;
begin
  select order_id into parent_order
  from public.order_items
  where id = coalesce(new.order_item_id, old.order_item_id);
  if parent_order is not null then
    perform private.recalculate_order_totals(parent_order);
  end if;
  return coalesce(new, old);
end;
$$;

create trigger order_extras_recalculate
after insert or update or delete on public.order_item_extras
for each row execute function private.refresh_order_from_extra();

create or replace function private.refresh_order_from_cover()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.cover_count is distinct from old.cover_count then
    new.cover_total = new.cover_count * new.cover_price_snapshot;
    new.total = new.subtotal + new.cover_total;
  end if;
  return new;
end;
$$;

create trigger order_cover_recalculate
before update of cover_count on public.orders
for each row execute function private.refresh_order_from_cover();

create or replace function private.log_order_activity(
  p_order_id uuid,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.order_activity(order_id, user_id, action, payload)
  values (p_order_id, (select auth.uid()), p_action, p_payload);
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.current_role() to authenticated;
grant execute on function private.is_active_staff() to authenticated;
grant execute on function private.log_order_activity(uuid, text, jsonb) to authenticated;

create or replace function public.get_or_create_active_order(p_table_id uuid)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.orders;
begin
  if not private.is_active_staff() then
    raise exception 'Utente non autorizzato';
  end if;

  select * into result from public.orders
  where table_id = p_table_id
    and status in ('draft', 'pending_cashier', 'confirmed', 'in_preparation', 'bill_requested')
  limit 1;

  if result.id is null then
    begin
      insert into public.orders(table_id, cover_price_snapshot)
      values (p_table_id, 0)
      returning * into result;
      perform private.log_order_activity(result.id, 'order_created');
    exception when unique_violation then
      select * into result from public.orders
      where table_id = p_table_id
        and status in ('draft', 'pending_cashier', 'confirmed', 'in_preparation', 'bill_requested')
      limit 1;
    end;
  end if;

  return result;
end;
$$;

create or replace function public.add_order_item(
  p_order_id uuid,
  p_menu_item_id uuid,
  p_notes text default ''
)
returns public.order_items
language plpgsql
security invoker
set search_path = ''
as $$
declare result public.order_items;
begin
  insert into public.order_items(order_id, menu_item_id, quantity, notes)
  values (p_order_id, p_menu_item_id, 1, coalesce(p_notes, ''))
  returning * into result;
  perform private.log_order_activity(p_order_id, 'item_added', jsonb_build_object('item_id', result.id));
  return result;
end;
$$;

create or replace function public.change_order_item_quantity(
  p_item_id uuid,
  p_delta integer
)
returns public.order_items
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.order_items;
  parent_order uuid;
begin
  if p_delta = 0 then raise exception 'Variazione non valida'; end if;
  select order_id into parent_order from public.order_items where id = p_item_id;
  update public.order_items
  set quantity = quantity + p_delta
  where id = p_item_id and quantity + p_delta > 0
  returning * into result;

  if result.id is null and p_delta < 0 then
    delete from public.order_items where id = p_item_id returning order_id into parent_order;
    perform private.log_order_activity(parent_order, 'item_removed', jsonb_build_object('item_id', p_item_id));
    return null;
  end if;

  perform private.log_order_activity(parent_order, 'item_quantity_changed', jsonb_build_object('item_id', p_item_id, 'delta', p_delta));
  return result;
end;
$$;

create or replace function public.set_order_item_notes(
  p_item_id uuid,
  p_notes text,
  p_expected_version bigint
)
returns public.order_items
language plpgsql
security invoker
set search_path = ''
as $$
declare result public.order_items;
begin
  update public.order_items
  set notes = coalesce(p_notes, '')
  where id = p_item_id and version = p_expected_version
  returning * into result;
  if result.id is null then raise exception 'Conflitto: riga modificata da un altro utente'; end if;
  return result;
end;
$$;

create or replace function public.set_order_details(
  p_order_id uuid,
  p_cover_count integer,
  p_general_notes text,
  p_expected_version bigint
)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare result public.orders;
begin
  update public.orders
  set cover_count = p_cover_count, general_notes = coalesce(p_general_notes, '')
  where id = p_order_id and version = p_expected_version
  returning * into result;
  if result.id is null then raise exception 'Conflitto: ordine modificato da un altro utente'; end if;
  return result;
end;
$$;

create or replace function public.add_order_item_extra(
  p_item_id uuid,
  p_menu_extra_id uuid
)
returns public.order_item_extras
language plpgsql
security invoker
set search_path = ''
as $$
declare result public.order_item_extras;
begin
  insert into public.order_item_extras(order_item_id, menu_extra_id, quantity)
  values (p_item_id, p_menu_extra_id, 1)
  returning * into result;
  return result;
end;
$$;

create or replace function public.remove_order_item(p_item_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare parent_order uuid;
begin
  delete from public.order_items where id = p_item_id returning order_id into parent_order;
  perform private.log_order_activity(parent_order, 'item_removed', jsonb_build_object('item_id', p_item_id));
end;
$$;

create or replace function public.send_order_to_cashier(p_order_id uuid)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare
  result public.orders;
  configured_copies integer;
begin
  if not exists (select 1 from public.order_items where order_id = p_order_id) then
    raise exception 'La comanda è vuota';
  end if;

  update public.orders
  set status = 'pending_cashier', sent_to_cashier_at = now()
  where id = p_order_id and status = 'draft'
  returning * into result;
  if result.id is null then raise exception 'Ordine già inviato o non disponibile'; end if;

  select default_print_copies into configured_copies
  from public.restaurant_settings order by created_at limit 1;

  insert into public.print_jobs(order_id, status, copies)
  values (p_order_id, 'pending', coalesce(configured_copies, 3))
  on conflict (order_id) do update
    set status = 'pending', copies = excluded.copies, error_message = null, updated_at = now();

  perform private.log_order_activity(p_order_id, 'sent_to_cashier');
  return result;
end;
$$;

create or replace function public.confirm_order(p_order_id uuid)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare result public.orders;
begin
  if private.current_role() not in ('cashier', 'admin') then raise exception 'Non autorizzato'; end if;
  update public.orders set status = 'confirmed'
  where id = p_order_id and status = 'pending_cashier'
  returning * into result;
  if result.id is null then raise exception 'Ordine non confermabile'; end if;
  perform private.log_order_activity(p_order_id, 'confirmed');
  return result;
end;
$$;

create or replace function public.request_print(p_order_id uuid)
returns public.print_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare result public.print_jobs;
begin
  if private.current_role() not in ('cashier', 'admin') then raise exception 'Non autorizzato'; end if;
  update public.orders set status = 'confirmed'
  where id = p_order_id and status in ('pending_cashier', 'confirmed');
  update public.print_jobs
  set status = 'pending', error_message = null
  where order_id = p_order_id
  returning * into result;
  perform private.log_order_activity(p_order_id, 'print_requested');
  return result;
end;
$$;

create or replace function public.mark_printed(p_order_id uuid)
returns public.print_jobs
language plpgsql
security invoker
set search_path = ''
as $$
declare result public.print_jobs;
begin
  if private.current_role() not in ('cashier', 'admin') then raise exception 'Non autorizzato'; end if;
  update public.print_jobs
  set status = 'printed', printed_at = now(), error_message = null
  where order_id = p_order_id
  returning * into result;
  update public.orders set status = 'in_preparation'
  where id = p_order_id and status in ('pending_cashier', 'confirmed');
  perform private.log_order_activity(p_order_id, 'printed');
  return result;
end;
$$;

create or replace function public.request_bill(p_order_id uuid)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare result public.orders;
begin
  update public.orders set status = 'bill_requested'
  where id = p_order_id and status = 'in_preparation'
  returning * into result;
  if result.id is null then raise exception 'Impossibile richiedere il conto'; end if;
  perform private.log_order_activity(p_order_id, 'bill_requested');
  return result;
end;
$$;

create or replace function public.cancel_order(p_order_id uuid)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare result public.orders;
begin
  if private.current_role() not in ('cashier', 'admin') then raise exception 'Non autorizzato'; end if;
  update public.orders set status = 'cancelled', closed_at = now()
  where id = p_order_id and status not in ('closed', 'cancelled')
  returning * into result;
  update public.print_jobs set status = 'cancelled' where order_id = p_order_id;
  perform private.log_order_activity(p_order_id, 'cancelled');
  return result;
end;
$$;

create or replace function public.close_order(p_order_id uuid)
returns public.orders
language plpgsql
security invoker
set search_path = ''
as $$
declare result public.orders;
begin
  if private.current_role() not in ('cashier', 'admin') then raise exception 'Non autorizzato'; end if;
  update public.orders set status = 'closed', closed_at = now()
  where id = p_order_id and status not in ('closed', 'cancelled')
  returning * into result;
  perform private.log_order_activity(p_order_id, 'closed');
  return result;
end;
$$;

alter table public.profiles enable row level security;
alter table public.restaurant_settings enable row level security;
alter table public.restaurant_tables enable row level security;
alter table public.menu_categories enable row level security;
alter table public.menu_items enable row level security;
alter table public.menu_extras enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_item_extras enable row level security;
alter table public.print_jobs enable row level security;
alter table public.order_activity enable row level security;

create policy profiles_staff_select on public.profiles for select to authenticated
using (private.is_active_staff() and (active or private.current_role() = 'admin'));
create policy profiles_admin_all on public.profiles for all to authenticated
using (private.current_role() = 'admin') with check (private.current_role() = 'admin');

create policy settings_public_select on public.restaurant_settings for select to anon, authenticated
using (true);
create policy settings_admin_all on public.restaurant_settings for all to authenticated
using (private.current_role() = 'admin') with check (private.current_role() = 'admin');

create policy tables_staff_select on public.restaurant_tables for select to authenticated
using (private.is_active_staff() and (active or private.current_role() = 'admin'));
create policy tables_admin_all on public.restaurant_tables for all to authenticated
using (private.current_role() = 'admin') with check (private.current_role() = 'admin');

create policy categories_public_select on public.menu_categories for select to anon
using (active);
create policy categories_staff_select on public.menu_categories for select to authenticated
using (private.is_active_staff());
create policy categories_admin_all on public.menu_categories for all to authenticated
using (private.current_role() = 'admin') with check (private.current_role() = 'admin');

create policy menu_items_public_select on public.menu_items for select to anon
using (active and available and visible_public);
create policy menu_items_staff_select on public.menu_items for select to authenticated
using (private.is_active_staff() and (visible_staff or private.current_role() = 'admin'));
create policy menu_items_admin_all on public.menu_items for all to authenticated
using (private.current_role() = 'admin') with check (private.current_role() = 'admin');

create policy menu_extras_public_select on public.menu_extras for select to anon
using (active and available and visible_public);
create policy menu_extras_staff_select on public.menu_extras for select to authenticated
using (private.is_active_staff() and (visible_staff or private.current_role() = 'admin'));
create policy menu_extras_admin_all on public.menu_extras for all to authenticated
using (private.current_role() = 'admin') with check (private.current_role() = 'admin');

create policy orders_staff_select on public.orders for select to authenticated
using (
  private.is_active_staff()
  and (
    status not in ('closed', 'cancelled')
    or private.current_role() in ('cashier', 'admin')
  )
);
create policy orders_staff_insert on public.orders for insert to authenticated
with check (private.is_active_staff() and status = 'draft');
create policy orders_staff_update on public.orders for update to authenticated
using (private.is_active_staff())
with check (private.is_active_staff());

create policy order_items_staff_select on public.order_items for select to authenticated
using (private.is_active_staff());
create policy order_items_staff_insert on public.order_items for insert to authenticated
with check (
  private.is_active_staff()
  and exists (
    select 1 from public.orders
    where id = order_id
      and (status = 'draft' or private.current_role() in ('cashier', 'admin'))
  )
);
create policy order_items_staff_update on public.order_items for update to authenticated
using (
  private.is_active_staff()
  and exists (
    select 1 from public.orders
    where id = order_id
      and (status = 'draft' or private.current_role() in ('cashier', 'admin'))
  )
)
with check (private.is_active_staff());
create policy order_items_staff_delete on public.order_items for delete to authenticated
using (
  private.is_active_staff()
  and exists (
    select 1 from public.orders
    where id = order_id
      and (status = 'draft' or private.current_role() in ('cashier', 'admin'))
  )
);

create policy order_extras_staff_select on public.order_item_extras for select to authenticated
using (private.is_active_staff());
create policy order_extras_staff_write on public.order_item_extras for all to authenticated
using (private.is_active_staff()) with check (private.is_active_staff());

create policy print_jobs_staff_select on public.print_jobs for select to authenticated
using (private.is_active_staff());
create policy print_jobs_waiter_insert on public.print_jobs for insert to authenticated
with check (
  private.is_active_staff()
  and created_by = (select auth.uid())
  and exists (
    select 1 from public.orders
    where id = order_id and status = 'pending_cashier'
  )
);
create policy print_jobs_cashier_update on public.print_jobs for update to authenticated
using (private.current_role() in ('cashier', 'admin'))
with check (private.current_role() in ('cashier', 'admin'));

create policy activity_staff_select on public.order_activity for select to authenticated
using (private.is_active_staff());

revoke all on all tables in schema public from anon, authenticated;
grant select on public.restaurant_settings, public.menu_categories, public.menu_items, public.menu_extras to anon;
grant select on public.profiles, public.restaurant_settings, public.restaurant_tables,
  public.menu_categories, public.menu_items, public.menu_extras, public.orders,
  public.order_items, public.order_item_extras, public.print_jobs, public.order_activity
to authenticated;
grant insert on public.orders to authenticated;
grant update (cover_count, general_notes, status, version, updated_by, updated_at, sent_to_cashier_at, closed_at)
  on public.orders to authenticated;
grant insert (order_id, menu_item_id, quantity, notes) on public.order_items to authenticated;
grant update (quantity, notes, version, updated_by, updated_at) on public.order_items to authenticated;
grant delete on public.order_items to authenticated;
grant insert (order_item_id, menu_extra_id, quantity) on public.order_item_extras to authenticated;
grant update (quantity, updated_at) on public.order_item_extras to authenticated;
grant delete on public.order_item_extras to authenticated;
grant insert (order_id, status, copies, printer_target, labels) on public.print_jobs to authenticated;
grant update (status, copies, printer_target, labels, retry_count, error_message, updated_at, printed_at)
  on public.print_jobs to authenticated;
grant insert, update, delete on public.restaurant_settings, public.restaurant_tables,
  public.menu_categories, public.menu_items, public.menu_extras, public.profiles
to authenticated;
grant usage, select on sequence public.order_number_seq to authenticated;
grant usage, select on sequence public.order_activity_id_seq to authenticated;

revoke all on function public.get_or_create_active_order(uuid) from public;
revoke all on function public.add_order_item(uuid, uuid, text) from public;
revoke all on function public.change_order_item_quantity(uuid, integer) from public;
revoke all on function public.set_order_item_notes(uuid, text, bigint) from public;
revoke all on function public.set_order_details(uuid, integer, text, bigint) from public;
revoke all on function public.add_order_item_extra(uuid, uuid) from public;
revoke all on function public.remove_order_item(uuid) from public;
revoke all on function public.send_order_to_cashier(uuid) from public;
revoke all on function public.confirm_order(uuid) from public;
revoke all on function public.request_print(uuid) from public;
revoke all on function public.mark_printed(uuid) from public;
revoke all on function public.request_bill(uuid) from public;
revoke all on function public.cancel_order(uuid) from public;
revoke all on function public.close_order(uuid) from public;

grant execute on function public.get_or_create_active_order(uuid) to authenticated;
grant execute on function public.add_order_item(uuid, uuid, text) to authenticated;
grant execute on function public.change_order_item_quantity(uuid, integer) to authenticated;
grant execute on function public.set_order_item_notes(uuid, text, bigint) to authenticated;
grant execute on function public.set_order_details(uuid, integer, text, bigint) to authenticated;
grant execute on function public.add_order_item_extra(uuid, uuid) to authenticated;
grant execute on function public.remove_order_item(uuid) to authenticated;
grant execute on function public.send_order_to_cashier(uuid) to authenticated;
grant execute on function public.confirm_order(uuid) to authenticated;
grant execute on function public.request_print(uuid) to authenticated;
grant execute on function public.mark_printed(uuid) to authenticated;
grant execute on function public.request_bill(uuid) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
grant execute on function public.close_order(uuid) to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'menu_categories', 'menu_items', 'menu_extras', 'restaurant_tables',
    'orders', 'order_items', 'order_item_extras', 'print_jobs'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end;
$$;

create policy "active staff can receive table presence"
on realtime.messages
for select
to authenticated
using (
  private.is_active_staff()
  and realtime.topic() like 'table:%'
);

create policy "active staff can send table presence"
on realtime.messages
for insert
to authenticated
with check (
  private.is_active_staff()
  and realtime.topic() like 'table:%'
);

commit;
