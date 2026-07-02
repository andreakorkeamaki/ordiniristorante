export type AppRole = "waiter" | "cashier" | "admin";
export type OrderStatus =
  | "draft"
  | "pending_cashier"
  | "confirmed"
  | "in_preparation"
  | "bill_requested"
  | "closed"
  | "cancelled";
export type PrintStatus = "pending" | "printing" | "printed" | "failed" | "cancelled";
export type PrintJobType = "new_order" | "order_update" | "cancellation" | "reprint";
export type PreparationArea = "pizzeria" | "cucina" | "bar" | "cassa";
export type ServicePeriod = "pranzo" | "cena" | "recupero";

export interface Profile {
  id: string;
  full_name: string;
  role: AppRole;
  active: boolean;
}

export interface RestaurantSettings {
  id: string;
  restaurant_name: string;
  cover_charge: number;
  default_print_copies: number;
  allergen_notice: string | null;
  ticket_footer: string | null;
}

export interface MenuCategory {
  id: string;
  name: string;
  name_en: string | null;
  slug: string;
  description: string | null;
  sort_order: number;
  active: boolean;
}

export interface MenuItem {
  id: string;
  category_id: string;
  name: string;
  name_en: string | null;
  description: string | null;
  description_en: string | null;
  ingredients: string | null;
  ingredients_en: string | null;
  price: number;
  active: boolean;
  available: boolean;
  visible_public: boolean;
  visible_staff: boolean;
  preparation_area: PreparationArea;
  allergens: string[];
  vegetarian: boolean;
  vegan: boolean;
  image_url: string | null;
  sort_order: number;
}

export interface MenuExtra {
  id: string;
  category_id: string | null;
  name: string;
  price: number;
  active: boolean;
  available: boolean;
  sort_order: number;
}

export interface RestaurantTable {
  id: string;
  table_number: number;
  display_name: string | null;
  active: boolean;
}

export interface RestaurantService {
  id: string;
  business_date: string;
  period: ServicePeriod;
  opened_by: string;
  closed_by: string | null;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItemExtra {
  id: string;
  order_item_id: string;
  extra_name_snapshot: string;
  extra_price_snapshot: number;
  quantity: number;
  total: number;
}

export interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id: string | null;
  item_name_snapshot: string;
  item_price_snapshot: number;
  ingredients_snapshot: string | null;
  quantity: number;
  line_total: number;
  notes: string;
  preparation_area_snapshot: PreparationArea;
  version: number;
  category_slug?: string | null;
  extras: OrderItemExtra[];
}

export interface Order {
  id: string;
  order_number: number;
  table_id: string;
  service_id: string | null;
  status: OrderStatus;
  cover_count: number;
  cover_price_snapshot: number;
  subtotal: number;
  cover_total: number;
  total: number;
  general_notes: string;
  version: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  sent_to_cashier_at: string | null;
  closed_at: string | null;
  table?: RestaurantTable;
  waiter?: Pick<Profile, "id" | "full_name">;
  items?: OrderItem[];
}

export interface PrintJob {
  id: string;
  order_id: string;
  job_type: PrintJobType;
  idempotency_key: string;
  status: PrintStatus;
  copies: number;
  printer_target: string;
  labels: string[];
  retry_count: number;
  error_message: string | null;
  printnode_job_id: number | null;
  processing_started_at: string | null;
  submitted_at: string | null;
  failed_at: string | null;
  last_attempt_at: string | null;
  manual_fallback: boolean;
  created_at: string;
  updated_at: string;
  printed_at: string | null;
}

export interface MenuData {
  settings: RestaurantSettings;
  categories: MenuCategory[];
  items: MenuItem[];
  extras: MenuExtra[];
}
