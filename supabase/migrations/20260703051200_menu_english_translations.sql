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
    ('Formula All You Can Eat', 'All You Can Eat', 'The whole table must take part. Includes: a selection of house starters, unlimited Roman pinsa served at the table with toppings chosen by the chef, French fries and Nutella pinsa.'),
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
