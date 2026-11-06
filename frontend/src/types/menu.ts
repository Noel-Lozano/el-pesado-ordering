// Shapes returned by GET /api/v1/menu. Prices are integer centavos (MXN).

export interface MenuItem {
  id: number;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  // "HH:MM" in the shop's timezone, or null if the item is sold all day.
  availableFrom: string | null;
}

export interface MenuCategory {
  name: string;
  items: MenuItem[];
}

export interface ShopDayHours {
  // 0 = Sunday ... 6 = Saturday.
  dayOfWeek: number;
  open: string;
  close: string;
}

export interface ShopInfo {
  timezone: string;
  hours: ShopDayHours[];
}

export interface MenuResponse {
  shop: ShopInfo;
  categories: MenuCategory[];
}
