import type { Pool, PoolClient } from "pg";

// The order as the customer sees it. Returned by POST /orders (new or
// replayed) and GET /orders/:id, so both always agree.

type Db = Pool | PoolClient;

export interface OrderItemResponse {
  menuItemId: number;
  name: string;
  // Names repeat across categories ("Frijoles con queso" burrito vs montada).
  categoryName: string;
  quantity: number;
  priceAtOrderCents: number;
  notes: string | null;
}

export interface OrderResponse {
  id: number;
  status: string;
  fulfillmentType: string;
  requestedTime: string | null;
  estimatedReadyAt: string | null;
  paymentMethod: string;
  paymentStatus: string;
  totalCents: number;
  createdAt: string;
  customerName: string | null;
  phoneLast4: string;
  items: OrderItemResponse[];
}

interface OrderRow {
  id: number;
  status: string;
  fulfillment_type: string;
  requested_time: Date | null;
  estimated_ready_at: Date | null;
  payment_method: string;
  payment_status: string;
  total_cents: number;
  created_at: Date;
  customer_name: string | null;
  phone: string;
}

interface OrderItemRow {
  menu_item_id: number;
  name: string;
  category: string;
  quantity: number;
  price_at_order_cents: number;
  notes: string | null;
}

const PHONE_SUFFIX_LENGTH = 4;

// Scoped by customer: another customer's order id is indistinguishable from
// one that doesn't exist.
export async function getOrderForCustomer(db: Db, orderId: number, customerId: number): Promise<OrderResponse | null> {
  const { rows: orderRows } = await db.query<OrderRow>(
    `SELECT o.id, o.status, o.fulfillment_type, o.requested_time, o.estimated_ready_at,
            o.payment_method, o.payment_status, o.total_cents, o.created_at,
            c.name AS customer_name, c.phone
     FROM orders o
     JOIN customers c ON c.id = o.customer_id
     WHERE o.id = $1 AND o.customer_id = $2`,
    [orderId, customerId],
  );
  const order = orderRows[0];
  if (!order) {
    return null;
  }

  const { rows: itemRows } = await db.query<OrderItemRow>(
    `SELECT oi.menu_item_id, m.name, m.category, oi.quantity, oi.price_at_order_cents, oi.notes
     FROM order_items oi
     JOIN menu_items m ON m.id = oi.menu_item_id
     WHERE oi.order_id = $1
     ORDER BY oi.id`,
    [orderId],
  );

  return {
    id: order.id,
    status: order.status,
    fulfillmentType: order.fulfillment_type,
    requestedTime: order.requested_time?.toISOString() ?? null,
    estimatedReadyAt: order.estimated_ready_at?.toISOString() ?? null,
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    totalCents: order.total_cents,
    createdAt: order.created_at.toISOString(),
    customerName: order.customer_name,
    phoneLast4: order.phone.slice(-PHONE_SUFFIX_LENGTH),
    items: itemRows.map((row) => ({
      menuItemId: row.menu_item_id,
      name: row.name,
      categoryName: row.category,
      quantity: row.quantity,
      priceAtOrderCents: row.price_at_order_cents,
      notes: row.notes,
    })),
  };
}

export async function findOrderIdByIdempotencyKey(
  db: Db,
  customerId: number,
  idempotencyKey: string,
): Promise<number | null> {
  const { rows } = await db.query<{ id: number }>(
    `SELECT id FROM orders WHERE customer_id = $1 AND idempotency_key = $2`,
    [customerId, idempotencyKey],
  );
  return rows[0]?.id ?? null;
}
