// Shapes for POST /api/v1/orders and GET /api/v1/orders/:id. Money is
// integer centavos; times are ISO 8601 strings.

export type OrderStatus = "created" | "confirmed" | "preparing" | "ready" | "picked_up" | "no_show" | "cancelled";

export interface OrderItem {
  menuItemId: number;
  name: string;
  categoryName: string;
  quantity: number;
  priceAtOrderCents: number;
  notes: string | null;
}

export interface Order {
  id: number;
  status: OrderStatus;
  fulfillmentType: "asap" | "scheduled";
  requestedTime: string | null;
  estimatedReadyAt: string | null;
  paymentMethod: string;
  paymentStatus: string;
  totalCents: number;
  createdAt: string;
  customerName: string | null;
  phoneLast4: string;
  items: OrderItem[];
}

export interface CreateOrderItem {
  menuItemId: number;
  quantity: number;
  notes?: string;
}

// No prices: the server computes every total from the database.
export interface CreateOrderRequest {
  fulfillmentType: "asap" | "scheduled";
  requestedTime?: string;
  paymentMethod: "cash";
  customerName: string;
  items: CreateOrderItem[];
}
