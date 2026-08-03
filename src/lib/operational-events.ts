export const OPERATIONAL_EVENTS = [
  "order_item_add_failed",
  "order_details_update_failed",
  "order_item_quantity_change_failed",
  "order_item_remove_failed",
  "order_item_note_update_failed",
  "order_item_extra_add_failed",
  "order_item_extra_remove_failed",
  "order_submit_failed",
  "print_job_cancel_failed",
] as const;

export type OperationalEvent = (typeof OPERATIONAL_EVENTS)[number];
