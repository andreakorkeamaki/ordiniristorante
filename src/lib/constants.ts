export const DEFAULT_SETTINGS = {
  id: "00000000-0000-0000-0000-000000000001",
  restaurant_name: "La Sagretta",
  cover_charge: 1.9,
  lunch_service_enabled: false,
  dine_in_print_copies: 3,
  takeaway_print_copies: 3,
  order_ticket_print_mode: "department_split",
  sort_active_tables_first: true,
  allergen_notice:
    "Per allergie o intolleranze chiedi informazioni al personale prima di ordinare.",
  allergen_notice_en:
    "If you have any food allergies or intolerances, please ask our staff for information before ordering.",
  ticket_footer: null,
} as const;

export const QUICK_NOTES = [
  "Senza mozzarella",
  "Senza pomodoro",
  "Senza cipolla",
  "Senza glutine",
  "Ben cotta",
  "Poco cotta",
  "Allergia",
  "Da dividere",
  "Aggiungi ingrediente",
] as const;

export const ACTIVE_ORDER_STATUSES = [
  "draft",
  "pending_cashier",
  "confirmed",
  "in_preparation",
  "bill_requested",
] as const;

export const ORDER_STATUS_LABELS = {
  draft: "Ordine in corso",
  pending_cashier: "Inviato alla cassa",
  confirmed: "In attesa di stampa",
  in_preparation: "Stampato / in lavorazione",
  bill_requested: "Conto richiesto",
  closed: "Chiuso",
  cancelled: "Annullato",
} as const;
