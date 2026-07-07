begin;

update public.menu_items as item
set preparation_area = 'pizzeria'::public.preparation_area
from public.menu_categories as category
where category.id = item.category_id
  and category.slug = 'all-you-can-eat'
  and item.preparation_area <> 'pizzeria'::public.preparation_area;

commit;
