begin;

alter table public.restaurant_settings
  add column if not exists order_ticket_print_mode text not null default 'department_split';

alter table public.restaurant_settings
  drop constraint if exists restaurant_settings_order_ticket_print_mode_check,
  add constraint restaurant_settings_order_ticket_print_mode_check
    check (
      order_ticket_print_mode in (
        'legacy_three_copies',
        'department_split'
      )
    );

update public.restaurant_settings
set order_ticket_print_mode = coalesce(
  nullif(order_ticket_print_mode, ''),
  'department_split'
);

commit;
