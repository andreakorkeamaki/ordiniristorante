create or replace function private.invalidate_category_translations()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.name is distinct from old.name then
    new.name_en := null;
  end if;
  if new.description is distinct from old.description then
    new.description_en := null;
  end if;
  return new;
end;
$$;

create or replace function private.invalidate_menu_item_translations()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.name is distinct from old.name then
    new.name_en := null;
  end if;
  if new.description is distinct from old.description then
    new.description_en := null;
  end if;
  if new.ingredients is distinct from old.ingredients then
    new.ingredients_en := null;
  end if;
  return new;
end;
$$;

create or replace function private.invalidate_menu_extra_translations()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.name is distinct from old.name then
    new.name_en := null;
  end if;
  return new;
end;
$$;

create or replace function private.invalidate_settings_translations()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.allergen_notice is distinct from old.allergen_notice then
    new.allergen_notice_en := null;
  end if;
  return new;
end;
$$;

drop trigger if exists categories_invalidate_translations
on public.menu_categories;
create trigger categories_invalidate_translations
before update of name, description on public.menu_categories
for each row execute function private.invalidate_category_translations();

drop trigger if exists menu_items_invalidate_translations
on public.menu_items;
create trigger menu_items_invalidate_translations
before update of name, description, ingredients on public.menu_items
for each row execute function private.invalidate_menu_item_translations();

drop trigger if exists menu_extras_invalidate_translations
on public.menu_extras;
create trigger menu_extras_invalidate_translations
before update of name on public.menu_extras
for each row execute function private.invalidate_menu_extra_translations();

drop trigger if exists settings_invalidate_translations
on public.restaurant_settings;
create trigger settings_invalidate_translations
before update of allergen_notice on public.restaurant_settings
for each row execute function private.invalidate_settings_translations();
