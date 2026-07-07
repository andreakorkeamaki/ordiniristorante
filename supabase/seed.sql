-- Generated from the original app.js menu. Re-run with: node scripts/generate-seed.mjs
begin;

insert into public.restaurant_settings (
  id, restaurant_name, cover_charge, dine_in_print_copies, takeaway_print_copies, order_ticket_print_mode, allergen_notice
) values (
  '00000000-0000-0000-0000-000000000001',
  'La Sagretta',
  1.90,
  3,
  3,
  'department_split',
  'Per allergie o intolleranze chiedi informazioni al personale prima di ordinare.'
)
on conflict (id) do update set
  restaurant_name = excluded.restaurant_name,
  cover_charge = excluded.cover_charge,
  dine_in_print_copies = excluded.dine_in_print_copies,
  takeaway_print_copies = excluded.takeaway_print_copies,
  order_ticket_print_mode = excluded.order_ticket_print_mode,
  allergen_notice = excluded.allergen_notice;

insert into public.menu_categories (
  id, name, slug, description, sort_order, active
) values (
  '00000000-0000-4000-8000-000000000101', 'Antipasti e fritti', 'antipasti', null, 0, true
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.menu_categories (
  id, name, slug, description, sort_order, active
) values (
  '00000000-0000-4000-8000-000000000102', 'Pinse bianche', 'bianche', null, 1, true
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.menu_categories (
  id, name, slug, description, sort_order, active
) values (
  '00000000-0000-4000-8000-000000000103', 'Pinse rosse', 'rosse', null, 2, true
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.menu_categories (
  id, name, slug, description, sort_order, active
) values (
  '00000000-0000-4000-8000-000000000104', 'Pinse speciali', 'speciali', null, 3, true
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.menu_categories (
  id, name, slug, description, sort_order, active
) values (
  '00000000-0000-4000-8000-000000000105', 'Formula All You Can Eat', 'all-you-can-eat', 'Ordinabile per il numero di persone desiderato. Include: antipastino misto della casa, pinsa romana non stop servita al tavolo a scelta dello chef, patatine fritte e pinsa con la Nutella.', 4, true
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.menu_categories (
  id, name, slug, description, sort_order, active
) values (
  '00000000-0000-4000-8000-000000000106', 'I Sapori di Mare', 'sapori-mare', null, 5, true
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.menu_categories (
  id, name, slug, description, sort_order, active
) values (
  '00000000-0000-4000-8000-000000000107', 'Per i più piccoli e non solo', 'bimbi', null, 6, true
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.menu_categories (
  id, name, slug, description, sort_order, active
) values (
  '00000000-0000-4000-8000-000000000108', 'Dolci', 'dolci', null, 7, true
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.menu_categories (
  id, name, slug, description, sort_order, active
) values (
  '00000000-0000-4000-8000-000000000109', 'Bevande', 'bevande', null, 8, true
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.menu_categories (
  id, name, slug, description, sort_order, active
) values (
  '00000000-0000-4000-8000-000000000110', 'Extra e modifiche', 'extra', null, 9, true
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  sort_order = excluded.sort_order;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000000101', 'Tris di bruschette miste', 5.00,
  true, true, true, true, 'cucina',
  0, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001002', '00000000-0000-4000-8000-000000000101', 'Tagliere La Sagretta', 12.00,
  true, true, true, true, 'cucina',
  1, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001003', '00000000-0000-4000-8000-000000000101', 'Tagliere XL', 20.00,
  true, true, true, true, 'cucina',
  2, 'Mix di salumi, formaggi e bruschette'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001004', '00000000-0000-4000-8000-000000000101', 'Hummus con pane bruscato', 9.00,
  true, true, true, true, 'cucina',
  3, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001005', '00000000-0000-4000-8000-000000000101', 'Mix di formaggi', 10.00,
  true, true, true, true, 'cucina',
  4, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001006', '00000000-0000-4000-8000-000000000101', 'Supplì artigianale', 2.50,
  true, true, true, true, 'cucina',
  5, 'Al pezzo'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001007', '00000000-0000-4000-8000-000000000101', 'Crocchette alla napoletana', 2.50,
  true, true, true, true, 'cucina',
  6, 'Al pezzo'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001008', '00000000-0000-4000-8000-000000000101', 'Olive ascolane', 5.00,
  true, true, true, true, 'cucina',
  7, '6 pezzi'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001009', '00000000-0000-4000-8000-000000000101', 'Crocchette cacio e pepe', 5.00,
  true, true, true, true, 'cucina',
  8, '4 pezzi'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001010', '00000000-0000-4000-8000-000000000101', 'Mozzarelline panate', 5.00,
  true, true, true, true, 'cucina',
  9, '6 pezzi'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001011', '00000000-0000-4000-8000-000000000101', 'Triangoli di cheddar e nacho', 5.00,
  true, false, true, true, 'cucina',
  10, '5 pezzi'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001012', '00000000-0000-4000-8000-000000000101', 'Crocchette di jalapeños e cheddar', 5.00,
  true, true, true, true, 'cucina',
  11, '5 pezzi'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001013', '00000000-0000-4000-8000-000000000101', 'Patatine fritte', 5.00,
  true, true, true, true, 'cucina',
  12, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001014', '00000000-0000-4000-8000-000000000101', 'Patatine dolci fritte', 5.00,
  true, false, true, true, 'cucina',
  13, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001015', '00000000-0000-4000-8000-000000000102', 'Focaccia', 6.00,
  true, true, true, true, 'pizzeria',
  0, 'Olio, sale'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001016', '00000000-0000-4000-8000-000000000102', 'Focaccia + Crudo', 8.00,
  true, true, true, true, 'pizzeria',
  1, 'Olio, sale, prosciutto crudo'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001017', '00000000-0000-4000-8000-000000000102', 'Crostino', 8.00,
  true, true, true, true, 'pizzeria',
  2, 'Mozzarella, prosciutto cotto, olio evo'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001018', '00000000-0000-4000-8000-000000000102', 'Patate e Salsiccia', 9.00,
  true, true, true, true, 'pizzeria',
  3, 'Patate, salsiccia, mozzarella, olio evo'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001019', '00000000-0000-4000-8000-000000000102', 'Cotto e Patate', 9.00,
  true, true, true, true, 'pizzeria',
  4, 'Mozzarella, prosciutto cotto, patate'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001020', '00000000-0000-4000-8000-000000000102', 'Boscaiola', 9.00,
  true, true, true, true, 'pizzeria',
  5, 'Mozzarella, salsiccia, funghi, olio evo'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001021', '00000000-0000-4000-8000-000000000102', 'Quattro Formaggi', 9.00,
  true, true, true, true, 'pizzeria',
  6, 'Mix di quattro formaggi, gorgonzola'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001022', '00000000-0000-4000-8000-000000000102', 'Speck e Provola', 9.00,
  true, true, true, true, 'pizzeria',
  7, 'Mozzarella, speck, provola'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001023', '00000000-0000-4000-8000-000000000102', 'Broccoli e Salsiccia', 9.00,
  true, true, true, true, 'pizzeria',
  8, 'Mozzarella, broccoli, salsiccia'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001024', '00000000-0000-4000-8000-000000000102', 'Tonno e Cipolla', 8.00,
  true, true, true, true, 'pizzeria',
  9, 'Mozzarella, tonno, cipolla, olive'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001025', '00000000-0000-4000-8000-000000000102', 'Gamberetti e Zucchine', 10.00,
  true, true, true, true, 'pizzeria',
  10, 'Mozzarella, gamberetti, zucchine'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001026', '00000000-0000-4000-8000-000000000103', 'Marinara', 6.00,
  true, true, true, true, 'pizzeria',
  0, 'Pomodoro, aglio, origano, olio evo'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001027', '00000000-0000-4000-8000-000000000103', 'Margherita', 7.50,
  true, true, true, true, 'pizzeria',
  1, 'Pomodoro, mozzarella, basilico'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001028', '00000000-0000-4000-8000-000000000103', 'Diavola', 9.00,
  true, true, true, true, 'pizzeria',
  2, 'Pomodoro, mozzarella, salame piccante'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001029', '00000000-0000-4000-8000-000000000103', 'Napoli', 8.00,
  true, true, true, true, 'pizzeria',
  3, 'Pomodoro, mozzarella, capperi, olive, basilico, origano'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001030', '00000000-0000-4000-8000-000000000103', 'Quattro Stagioni', 10.50,
  true, true, true, true, 'pizzeria',
  4, 'Pomodoro, mozzarella, prosciutto, funghi, carciofini, olive'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001031', '00000000-0000-4000-8000-000000000103', 'Verdure Grigliate', 8.50,
  true, true, true, true, 'pizzeria',
  5, 'Pomodoro, verdure grigliate miste, mozzarella'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001032', '00000000-0000-4000-8000-000000000103', 'Gorgonzola e Diavola Rossa', 9.00,
  true, true, true, true, 'pizzeria',
  6, 'Pomodoro, gorgonzola, salame piccante, mozzarella'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001033', '00000000-0000-4000-8000-000000000103', 'Würstel e Patatine', 9.00,
  true, true, true, true, 'pizzeria',
  7, 'Pomodoro, würstel di pollo e tacchino, patatine fritte, mozzarella'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001034', '00000000-0000-4000-8000-000000000104', 'Crudo, Rucola, Pachino, Bufala', 12.00,
  true, true, true, true, 'pizzeria',
  0, 'Mozzarella di bufala DOP, prosciutto crudo, rucola, pomodorini'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001035', '00000000-0000-4000-8000-000000000104', 'Bresaola, Rucola, Grana', 12.00,
  true, true, true, true, 'pizzeria',
  1, 'Mozzarella, bresaola IGP, rucola, grana stagionato 12 mesi, olio evo'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001036', '00000000-0000-4000-8000-000000000104', 'Melanzane, Bufala, Pachino, Basilico', 12.00,
  true, true, true, true, 'pizzeria',
  2, 'Mozzarella di bufala DOP, melanzane grigliate, pachino, basilico fresco'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001037', '00000000-0000-4000-8000-000000000104', 'Gorgonzola, Pere, Noci', 13.00,
  true, true, true, true, 'pizzeria',
  3, 'Mozzarella, gorgonzola DOP, pere, noci'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001038', '00000000-0000-4000-8000-000000000104', 'La Regina', 13.00,
  true, true, true, true, 'pizzeria',
  4, 'Pomodoro, mozzarella di bufala DOP, pomodorini, prosciutto crudo, basilico fresco'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001039', '00000000-0000-4000-8000-000000000104', 'Amatriciana', 13.00,
  true, true, true, true, 'pizzeria',
  5, 'Pomodoro, pecorino romano, guanciale croccante di Amatrice, basilico fresco'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001040', '00000000-0000-4000-8000-000000000104', 'Zucchine, Guanciale e Stracciatella', 13.00,
  true, true, true, true, 'pizzeria',
  6, 'Zucchine, guanciale, stracciatella'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001041', '00000000-0000-4000-8000-000000000104', 'Gamberetti, Insalata, Pomodoro, Salsa Rosa e Stracciatella', 13.00,
  true, true, true, true, 'pizzeria',
  7, 'Pomodoro, salsa rosa, gamberetti, insalata iceberg, stracciatella di burrata'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001042', '00000000-0000-4000-8000-000000000104', 'Insalata, Pomodorini, Tonno, Bufala, Mayo', 11.00,
  true, true, true, true, 'pizzeria',
  8, 'Tonno, bufala DOP, pomodorini, insalata iceberg, maionese'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001043', '00000000-0000-4000-8000-000000000104', 'Rucola, Pomodorini, Bufala, Salmone', 13.00,
  true, true, true, true, 'pizzeria',
  9, 'Salmone affumicato, bufala DOP, pomodorini, rucola'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001044', '00000000-0000-4000-8000-000000000104', 'Cubetti di Melanzana Fritta, Pomodorini e Bufala', 12.00,
  true, true, true, true, 'pizzeria',
  10, 'Bufala DOP, melanzane fritte a cubetti, pomodorini'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001045', '00000000-0000-4000-8000-000000000105', 'All You Can Eat · Adulti', 16.90,
  true, true, true, true, 'pizzeria',
  0, 'Prezzo per persona'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001046', '00000000-0000-4000-8000-000000000105', 'All You Can Eat · Bambini', 12.90,
  true, true, true, true, 'pizzeria',
  1, 'Prezzo per persona'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001047', '00000000-0000-4000-8000-000000000106', 'Antipasto di mare della casa', 15.00,
  true, true, true, true, 'cucina',
  0, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001048', '00000000-0000-4000-8000-000000000106', 'Tris di mare', 15.00,
  true, true, true, true, 'cucina',
  1, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001049', '00000000-0000-4000-8000-000000000106', 'Frittura calamari e gamberi piccola', 9.90,
  true, true, true, true, 'cucina',
  2, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001050', '00000000-0000-4000-8000-000000000106', 'Frittura calamari e gamberi grande', 16.90,
  true, true, true, true, 'cucina',
  3, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001051', '00000000-0000-4000-8000-000000000106', 'Grigliata di mare', 23.00,
  true, true, true, true, 'cucina',
  4, 'Non sempre disponibile'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001052', '00000000-0000-4000-8000-000000000107', 'Cotoletta e patatine', 12.00,
  true, true, true, true, 'cucina',
  0, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001053', '00000000-0000-4000-8000-000000000107', 'Hamburger e patatine', 12.00,
  true, true, true, true, 'cucina',
  1, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001054', '00000000-0000-4000-8000-000000000107', 'Pasta al ragù bimbi', 7.00,
  true, true, true, true, 'cucina',
  2, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001055', '00000000-0000-4000-8000-000000000108', 'Tiramisù fatto in casa', 5.00,
  true, true, true, true, 'cucina',
  0, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001056', '00000000-0000-4000-8000-000000000108', 'Panna cotta · Frutti di bosco', 5.00,
  true, true, true, true, 'cucina',
  1, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001057', '00000000-0000-4000-8000-000000000108', 'Panna cotta · Nutella', 5.00,
  true, true, true, true, 'cucina',
  2, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001058', '00000000-0000-4000-8000-000000000108', 'Panna cotta · Nutella e rum', 5.00,
  true, true, true, true, 'cucina',
  3, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001059', '00000000-0000-4000-8000-000000000108', 'Panna cotta · Caramello', 5.00,
  true, true, true, true, 'cucina',
  4, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001060', '00000000-0000-4000-8000-000000000108', 'Cheesecake · Frutti di bosco', 5.00,
  true, true, true, true, 'cucina',
  5, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001061', '00000000-0000-4000-8000-000000000108', 'Cheesecake · Nutella', 5.00,
  true, true, true, true, 'cucina',
  6, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001062', '00000000-0000-4000-8000-000000000108', 'Cheesecake · Nutella e rum', 5.00,
  true, true, true, true, 'cucina',
  7, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001063', '00000000-0000-4000-8000-000000000108', 'Cheesecake · Caramello', 5.00,
  true, true, true, true, 'cucina',
  8, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001064', '00000000-0000-4000-8000-000000000108', 'Mattoncino · Yogurt, panna e pinoli', 5.00,
  true, true, true, true, 'cucina',
  9, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001065', '00000000-0000-4000-8000-000000000108', 'Tartufo bianco', 5.00,
  true, false, true, true, 'cucina',
  10, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001066', '00000000-0000-4000-8000-000000000108', 'Tartufo nero', 5.00,
  true, true, true, true, 'cucina',
  11, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001067', '00000000-0000-4000-8000-000000000108', 'Tartufo pistacchio', 5.00,
  true, true, true, true, 'cucina',
  12, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001068', '00000000-0000-4000-8000-000000000108', 'Macedonia', 5.00,
  true, true, true, true, 'cucina',
  13, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001069', '00000000-0000-4000-8000-000000000108', 'Dolce del giorno', 5.00,
  true, true, true, true, 'cucina',
  14, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001070', '00000000-0000-4000-8000-000000000108', 'Pinsa con la Nutella', 10.00,
  true, true, true, true, 'cucina',
  15, 'Consigliata per 4-6 persone'
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001071', '00000000-0000-4000-8000-000000000109', 'Acqua naturale', 2.00,
  true, true, true, true, 'bar',
  0, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001072', '00000000-0000-4000-8000-000000000109', 'Acqua frizzante', 2.00,
  true, true, true, true, 'bar',
  1, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001073', '00000000-0000-4000-8000-000000000109', 'Coca-Cola', 3.00,
  true, true, true, true, 'bar',
  2, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001074', '00000000-0000-4000-8000-000000000109', 'Coca-Cola Zero', 3.00,
  true, true, true, true, 'bar',
  3, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001075', '00000000-0000-4000-8000-000000000109', 'Fanta', 3.00,
  true, true, true, true, 'bar',
  4, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001076', '00000000-0000-4000-8000-000000000109', 'Birra piccola', 4.00,
  true, true, true, true, 'bar',
  5, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001077', '00000000-0000-4000-8000-000000000109', 'Birra media', 6.00,
  true, true, true, true, 'bar',
  6, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001078', '00000000-0000-4000-8000-000000000109', 'Calice di vino', 5.00,
  true, true, true, true, 'bar',
  7, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '00000000-0000-4000-8000-000000001079', '00000000-0000-4000-8000-000000000109', 'Caffè', 1.50,
  true, true, true, true, 'bar',
  8, null
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  visible_public = excluded.visible_public,
  visible_staff = excluded.visible_staff,
  preparation_area = excluded.preparation_area,
  sort_order = excluded.sort_order,
  ingredients = excluded.ingredients;

insert into public.menu_extras (
  id, category_id, name, price, active, available, visible_public, visible_staff, sort_order
) values (
  '00000000-0000-4000-8000-000000001080', '00000000-0000-4000-8000-000000000110', 'Aggiunta da €1', 1.00,
  true, true, true, true, 0
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  sort_order = excluded.sort_order;

insert into public.menu_extras (
  id, category_id, name, price, active, available, visible_public, visible_staff, sort_order
) values (
  '00000000-0000-4000-8000-000000001081', '00000000-0000-4000-8000-000000000110', 'Aggiunta da €2', 2.00,
  true, true, true, true, 1
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  sort_order = excluded.sort_order;

insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002001', 1, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002002', 2, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002003', 3, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002004', 4, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002005', 5, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002006', 6, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002007', 7, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002008', 8, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002009', 9, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002010', 10, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002011', 11, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002012', 12, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002013', 13, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002014', 14, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002015', 15, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002016', 16, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002017', 17, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002018', 18, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002019', 19, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002020', 20, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002021', 21, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002022', 22, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002023', 23, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002024', 24, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002025', 25, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002026', 26, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002027', 27, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002028', 28, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002029', 29, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002030', 30, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;
insert into public.restaurant_tables (id, table_number, active)
values ('00000000-0000-4000-8000-000000002031', 31, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;

-- Keep this version aligned with the migration recorded by the linked project.
alter table public.menu_extras add column if not exists name_en text;
alter table public.restaurant_settings add column if not exists allergen_notice_en text;

update public.menu_categories as category
set name_en = translation.name_en, description_en = translation.description_en
from (
  values
    ('Antipasti e fritti', 'Starters and Fried Specialties', null::text),
    ('Pinse bianche', 'White Pinse', null::text),
    ('Pinse rosse', 'Red Pinse', null::text),
    ('Pinse speciali', 'Special Pinse', null::text),
    ('Formula All You Can Eat', 'All You Can Eat', 'Available for the number of guests selected. Includes: a selection of house starters, unlimited Roman pinsa served at the table with toppings chosen by the chef, French fries and Nutella pinsa.'),
    ('I Sapori di Mare', 'Flavours of the Sea', null::text),
    ('Per i più piccoli e non solo', 'For Kids and More', null::text),
    ('Dolci', 'Desserts', null::text),
    ('Extra e modifiche', 'Extras and Changes', null::text),
    ('Bevande', 'Drinks', null::text),
    ('amari', 'Digestifs', null::text)
) as translation(name, name_en, description_en)
where category.name = translation.name;

update public.menu_items as item
set name_en = translation.name_en, ingredients_en = translation.ingredients_en
from (
  values
    ('Tris di bruschette miste', 'Mixed Bruschetta Trio', '3 mixed bruschettas'),
    ('Tagliere La Sagretta', 'La Sagretta Sharing Board', 'Cured meats, cheeses and honey'),
    ('Tagliere XL', 'XL Sharing Board', 'Selection of cured meats, cheeses, bruschettas and assorted tastings'),
    ('Hummus con pane bruscato', 'Hummus with Toasted Bread', null::text),
    ('Mix di formaggi', 'Cheese Selection', null::text),
    ('Supplì artigianale', 'Homemade Supplì', 'Each'),
    ('Crocchette alla napoletana', 'Neapolitan-Style Croquettes', 'Each'),
    ('Olive ascolane', 'Ascoli-Style Stuffed Olives', '6 pieces'),
    ('Crocchette cacio e pepe', 'Cacio e Pepe Croquettes', '4 pieces'),
    ('Mozzarelline panate', 'Breaded Mozzarella Bites', '6 pieces'),
    ('Triangoli di cheddar e nacho', 'Cheddar and Nacho Triangles', '5 pieces'),
    ('Crocchette di jalapeños e cheddar', 'Jalapeño and Cheddar Croquettes', '5 pieces'),
    ('Patatine fritte', 'French Fries', null::text),
    ('Patatine dolci fritte', 'Sweet Potato Fries', null::text),
    ('Mortadella alla brace', 'Grilled Mortadella', null::text),
    ('Focaccia', 'Focaccia', 'Extra virgin olive oil, salt'),
    ('Focaccia + Crudo', 'Focaccia with Prosciutto Crudo', 'Extra virgin olive oil, salt, prosciutto crudo'),
    ('Crostino', 'Crostino', 'Mozzarella, cooked ham, extra virgin olive oil'),
    ('Patate e Salsiccia', 'Potato and Sausage', 'Potatoes, sausage, mozzarella, extra virgin olive oil'),
    ('Cotto e Patate', 'Cooked Ham and Potatoes', 'Mozzarella, cooked ham, potatoes'),
    ('Boscaiola', 'Boscaiola', 'Mozzarella, sausage, mushrooms, extra virgin olive oil'),
    ('Quattro Formaggi', 'Four Cheese', 'Four-cheese blend, Gorgonzola'),
    ('Speck e Provola', 'Speck and Provola', 'Mozzarella, speck, provola'),
    ('Broccoli e Salsiccia', 'Broccoli and Sausage', 'Mozzarella, broccoli, sausage'),
    ('Tonno e Cipolla', 'Tuna and Onion', 'Mozzarella, tuna, onion, olives'),
    ('Gamberetti e Zucchine', 'Shrimp and Zucchini', 'Mozzarella, shrimp, zucchini'),
    ('Focaccia + Mortadella', 'Focaccia with Mortadella', null::text),
    ('Marinara', 'Marinara', 'Tomato, garlic, oregano, extra virgin olive oil'),
    ('Margherita', 'Margherita', 'Tomato, mozzarella, basil'),
    ('Diavola', 'Diavola', 'Tomato, mozzarella, spicy salami'),
    ('Napoli', 'Napoli', 'Tomato, mozzarella, capers, olives, basil, oregano'),
    ('Quattro Stagioni', 'Four Seasons', 'Tomato, mozzarella, ham, mushrooms, artichoke hearts, olives'),
    ('Verdure Grigliate', 'Grilled Vegetables', 'Tomato, mixed grilled vegetables, mozzarella'),
    ('Gorgonzola e Diavola Rossa', 'Gorgonzola and Spicy Salami', 'Tomato, Gorgonzola, spicy salami, mozzarella'),
    ('Würstel e Patatine', 'Würstel and Fries', 'Tomato, chicken and turkey Würstel, French fries, mozzarella'),
    ('Crudo, Rucola, Pachino, Bufala', 'Prosciutto Crudo, Rocket, Cherry Tomatoes and Buffalo Mozzarella', 'DOP buffalo mozzarella, prosciutto crudo, rocket, cherry tomatoes'),
    ('Bresaola, Rucola, Grana', 'Bresaola, Rocket and Grana', 'Mozzarella, IGP bresaola, rocket, 12-month aged Grana cheese, extra virgin olive oil'),
    ('Melanzane, Bufala, Pachino, Basilico', 'Eggplant, Buffalo Mozzarella, Cherry Tomatoes and Basil', 'DOP buffalo mozzarella, grilled eggplant, Pachino cherry tomatoes, fresh basil'),
    ('Gorgonzola, Pere, Noci', 'Gorgonzola, Pears and Walnuts', 'Mozzarella, DOP Gorgonzola, pears, walnuts'),
    ('La Regina', 'La Regina', 'Tomato, DOP buffalo mozzarella, cherry tomatoes, prosciutto crudo, fresh basil'),
    ('Amatriciana', 'Amatriciana', 'Tomato, Pecorino Romano, crispy Amatrice guanciale, fresh basil'),
    ('Zucchine, Guanciale e Stracciatella', 'Zucchini, Guanciale and Stracciatella', 'Zucchini, guanciale, stracciatella'),
    ('Gamberetti, Insalata, Pomodoro, Salsa Rosa e Stracciatella', 'Shrimp, Lettuce, Tomato, Marie Rose Sauce and Stracciatella', 'Tomato, Marie Rose sauce, shrimp, iceberg lettuce, burrata stracciatella'),
    ('Insalata, Pomodorini, Tonno, Bufala, Mayo', 'Lettuce, Cherry Tomatoes, Tuna, Buffalo Mozzarella and Mayo', 'Tuna, DOP buffalo mozzarella, cherry tomatoes, iceberg lettuce, mayonnaise'),
    ('Rucola, Pomodorini, Bufala, Salmone', 'Rocket, Cherry Tomatoes, Buffalo Mozzarella and Salmon', 'Smoked salmon, DOP buffalo mozzarella, cherry tomatoes, rocket'),
    ('Cubetti di Melanzana Fritta, Pomodorini e Bufala', 'Diced Fried Eggplant, Cherry Tomatoes and Buffalo Mozzarella', 'DOP buffalo mozzarella, diced fried eggplant, cherry tomatoes'),
    ('All You Can Eat · Adulti', 'All You Can Eat · Adults', 'Price per person'),
    ('All You Can Eat · Bambini', 'All You Can Eat · Children', 'Price per person'),
    ('Antipasto di mare della casa', 'House Seafood Starter', null::text),
    ('Tris di mare', 'Seafood Trio', null::text),
    ('Frittura calamari e gamberi piccola', 'Small Fried Calamari and Shrimp', null::text),
    ('Frittura calamari e gamberi grande', 'Large Fried Calamari and Shrimp', null::text),
    ('Grigliata di mare', 'Mixed Seafood Grill', 'Subject to availability'),
    ('Cotoletta e patatine', 'Chicken Cutlet and Fries', null::text),
    ('Hamburger e patatine', 'Burger and Fries', null::text),
    ('Pasta al ragù bimbi', 'Kids'' Pasta with Meat Sauce', null::text),
    ('Tiramisù fatto in casa', 'Homemade Tiramisu', null::text),
    ('Panna cotta · Frutti di bosco', 'Panna Cotta · Mixed Berries', null::text),
    ('Panna cotta · Nutella', 'Panna Cotta · Nutella', null::text),
    ('Panna cotta · Nutella e rum', 'Panna Cotta · Nutella and Rum', null::text),
    ('Panna cotta · Caramello', 'Panna Cotta · Caramel', null::text),
    ('Cheesecake · Frutti di bosco', 'Cheesecake · Mixed Berries', null::text),
    ('Cheesecake · Nutella', 'Cheesecake · Nutella', null::text),
    ('Cheesecake · Nutella e rum', 'Cheesecake · Nutella and Rum', null::text),
    ('Cheesecake · Caramello', 'Cheesecake · Caramel', null::text),
    ('Mattoncino · Yogurt, panna e pinoli', 'Mattoncino · Yogurt, Cream and Pine Nuts', null::text),
    ('Tartufo bianco', 'White Tartufo', null::text),
    ('Tartufo nero', 'Chocolate Tartufo', null::text),
    ('Tartufo pistacchio', 'Pistachio Tartufo', null::text),
    ('Macedonia', 'Fresh Fruit Salad', null::text),
    ('Dolce del giorno', 'Dessert of the Day', null::text),
    ('Pinsa con la Nutella', 'Pinsa with Nutella', 'Recommended for 4–6 people'),
    ('Acqua naturale', 'Still Water', null::text),
    ('Acqua frizzante', 'Sparkling Water', null::text),
    ('Coca-Cola', 'Coca-Cola', null::text),
    ('Coca-Cola Zero', 'Coca-Cola Zero', null::text),
    ('Fanta', 'Fanta', null::text),
    ('Birra  piccola spina', 'Small Draft Beer', null::text),
    ('Birra media media', 'Medium Draft Beer', null::text),
    ('Calice di vino', 'Glass of Wine', null::text),
    ('Caffè', 'Espresso', null::text),
    ('Acqua piccola naturale', 'Small Still Water', null::text),
    ('Acqua leggermente piccola', 'Small Lightly Sparkling Water', null::text),
    ('Bibita lattina coca cola', 'Canned Coca-Cola', null::text),
    ('Bibita lattina coca zero', 'Canned Coca-Cola Zero', null::text),
    ('vino frizzantino spina 0.5 l', 'Sparkling House Wine on Tap · 0.5 L', null::text),
    ('Vino frizzantino spina 1 l', 'Sparkling House Wine on Tap · 1 L', null::text),
    ('Birra moretti baffo d''oro spina 0.5l', 'Moretti Baffo d''Oro Draft Beer · 0.5 L', null::text),
    ('Birra moretti baffo d''oro spina 1l', 'Moretti Baffo d''Oro Draft Beer · 1 L', null::text),
    ('Drink ', 'Drink', null::text),
    ('Vino traminer bianco', 'Traminer White Wine', null::text),
    ('Vino satrico bianco ', 'Satricò White Wine', null::text),
    ('Vino rosso nero d''avola', 'Nero d''Avola Red Wine', null::text),
    ('Coca grande', 'Large Coca-Cola', null::text),
    ('Amari', 'Digestifs', null::text)
) as translation(name, name_en, ingredients_en)
where item.name = translation.name;

update public.menu_extras as extra
set name_en = translation.name_en
from (
  values
    ('Aggiunta da €1', 'Extra · €1'),
    ('Aggiunta da €2', 'Extra · €2'),
    ('aggiunta da €3', 'Extra · €3')
) as translation(name, name_en)
where extra.name = translation.name;

update public.restaurant_settings
set allergen_notice_en =
  'If you have any food allergies or intolerances, please ask our staff for information before ordering.'
where allergen_notice is not null;

commit;
