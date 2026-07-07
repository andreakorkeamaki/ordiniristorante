import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../legacy/app.js", import.meta.url), "utf8");
const translationSql = fs.readFileSync(
  new URL(
    "../supabase/migrations/20260703051200_menu_english_translations.sql",
    import.meta.url,
  ),
  "utf8",
);
const seedTranslationSql = translationSql.replace(
  "The whole table must take part.",
  "Available for the number of guests selected.",
);
const constants = source.slice(0, source.indexOf("const app ="));
const context = {};
vm.createContext(context);
vm.runInContext(`${constants}\nglobalThis.seedMenu = MENU;`, context);

const menu = context.seedMenu;
const uuid = (number) =>
  `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const text = (value) =>
  value == null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const boolean = (value) => (value ? "true" : "false");
const areaForCategory = (categoryId) => {
  if (["bianche", "rosse", "speciali", "all-you-can-eat"].includes(categoryId)) {
    return "pizzeria";
  }
  if (categoryId === "bevande") return "bar";
  if (categoryId === "extra") return "cassa";
  return "cucina";
};

const categoryIds = new Map();
const statements = [
  "-- Generated from the original app.js menu. Re-run with: node scripts/generate-seed.mjs",
  "begin;",
  "",
  `insert into public.restaurant_settings (
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
  allergen_notice = excluded.allergen_notice;`,
  "",
];

menu.forEach((category, index) => {
  const id = uuid(100 + index + 1);
  categoryIds.set(category.id, id);
  statements.push(
    `insert into public.menu_categories (
  id, name, slug, description, sort_order, active
) values (
  '${id}', ${text(category.name)}, ${text(category.id)}, ${text(category.description)}, ${index}, true
)
on conflict (id) do update set
  name = excluded.name,
  slug = excluded.slug,
  description = excluded.description,
  sort_order = excluded.sort_order;`,
    "",
  );
});

let productNumber = 1000;
menu.forEach((category) => {
  category.products.forEach((product, index) => {
    productNumber += 1;
    const id = uuid(productNumber);
    const categoryId = categoryIds.get(category.id);
    if (category.id === "extra") {
      statements.push(
        `insert into public.menu_extras (
  id, category_id, name, price, active, available, visible_public, visible_staff, sort_order
) values (
  '${id}', '${categoryId}', ${text(product.name)}, ${product.price.toFixed(2)},
  true, ${boolean(!product.soldOut)}, true, true, ${index}
)
on conflict (id) do update set
  category_id = excluded.category_id,
  name = excluded.name,
  price = excluded.price,
  active = excluded.active,
  available = excluded.available,
  sort_order = excluded.sort_order;`,
        "",
      );
      return;
    }

    statements.push(
      `insert into public.menu_items (
  id, category_id, name, price, active, available, visible_public, visible_staff,
  preparation_area, sort_order, ingredients
) values (
  '${id}', '${categoryId}', ${text(product.name)}, ${product.price.toFixed(2)},
  true, ${boolean(!product.soldOut)}, true, true, ${text(areaForCategory(category.id))},
  ${index}, ${text(product.description)}
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
  ingredients = excluded.ingredients;`,
      "",
    );
  });
});

for (let tableNumber = 1; tableNumber <= 31; tableNumber += 1) {
  statements.push(
    `insert into public.restaurant_tables (id, table_number, active)
values ('${uuid(2000 + tableNumber)}', ${tableNumber}, true)
on conflict (id) do update set table_number = excluded.table_number, active = true;`,
  );
}

statements.push("", seedTranslationSql.trim(), "", "commit;", "");
fs.writeFileSync(
  new URL("../supabase/seed.sql", import.meta.url),
  statements.join("\n"),
  "utf8",
);
