import { Router } from "express";
import type { DatabaseError } from "pg";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { logEvent, maskPhone } from "../lib/log.js";
import { findOrderIdByIdempotencyKey, getOrderForCustomer } from "../lib/orderQueries.js";
import { assertItemsAvailableAt, resolvePickupMinutes } from "../lib/pickupRules.js";
import { computeOrderTotal } from "../lib/pricing.js";
import { AppError } from "../middleware/errorHandler.js";
import { requireVerifiedPhone } from "../middleware/requireVerifiedPhone.js";

export const ordersRouter = Router();

const MAX_QUANTITY_PER_LINE = 20;
const MAX_LINES_PER_ORDER = 50;
const NOTES_MAX_LENGTH = 140;
const CUSTOMER_NAME_MAX_LENGTH = 60;
// Cash at pickup is the only payment method until Stripe (Phase 3).
const ENABLED_PAYMENT_METHODS = new Set(["cash"]);
const IDEMPOTENCY_UNIQUE_INDEX = "orders_customer_idempotency_key_uniq";
const PG_UNIQUE_VIOLATION = "23505";

const idempotencyKeySchema = z.uuid({ message: "Idempotency-Key header must be a UUID" });

const orderItemSchema = z.object({
  menuItemId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
  notes: z.string().trim().max(NOTES_MAX_LENGTH).optional(),
});

const createOrderSchema = z
  .object({
    fulfillmentType: z.enum(["asap", "scheduled"]),
    requestedTime: z.iso.datetime().optional(),
    paymentMethod: z.enum(["card", "oxxo", "bank_transfer", "cash"]),
    customerName: z.string().trim().min(1).max(CUSTOMER_NAME_MAX_LENGTH).optional(),
    items: z.array(orderItemSchema).min(1).max(MAX_LINES_PER_ORDER),
  })
  .refine((body) => (body.fulfillmentType === "scheduled") === (body.requestedTime !== undefined), {
    message: "requestedTime is required for scheduled orders and not allowed for ASAP orders",
    path: ["requestedTime"],
  })
  .refine((body) => new Set(body.items.map((item) => item.menuItemId)).size === body.items.length, {
    message: "Each menu item may appear only once",
    path: ["items"],
  });

type CreateOrderBody = z.infer<typeof createOrderSchema>;

interface MenuItemRow {
  id: number;
  price_cents: number;
  is_available: boolean;
  available_from: string | null;
}

function isIdempotencyConflict(err: unknown): boolean {
  const dbError = err as Partial<DatabaseError>;
  return dbError.code === PG_UNIQUE_VIOLATION && dbError.constraint === IDEMPOTENCY_UNIQUE_INDEX;
}

async function insertOrder(
  customerId: number,
  idempotencyKey: string,
  body: CreateOrderBody,
  pickupMinutes: number,
): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const menuItemIds = body.items.map((item) => item.menuItemId);
    const { rows: menuItems } = await client.query<MenuItemRow>(
      `SELECT id, price_cents, is_available, to_char(available_from, 'HH24:MI') AS available_from
       FROM menu_items WHERE id = ANY($1)`,
      [menuItemIds],
    );
    const menuItemsById = new Map(menuItems.map((item) => [item.id, item]));

    for (const item of body.items) {
      const menuItem = menuItemsById.get(item.menuItemId);
      if (!menuItem || !menuItem.is_available || menuItem.price_cents <= 0) {
        throw new AppError("menu_item_unavailable", `Menu item ${item.menuItemId} is not available`, 400);
      }
    }
    assertItemsAvailableAt(
      pickupMinutes,
      menuItems.map((item) => ({ id: item.id, availableFrom: item.available_from })),
    );

    const totalCents = computeOrderTotal(
      body.items,
      new Map(menuItems.map((item) => [item.id, item.price_cents])),
    );

    // The latest name given is the one staff match at pickup (with the last 4 phone digits).
    const { rows: customerRows } = await client.query<{ phone: string }>(
      `UPDATE customers SET name = COALESCE($2, name), updated_at = now() WHERE id = $1 RETURNING phone`,
      [customerId, body.customerName ?? null],
    );
    const customer = customerRows[0];
    if (!customer) {
      throw new AppError("unauthorized", "Customer no longer exists", 401);
    }

    const { rows: orderRows } = await client.query<{ id: number }>(
      `INSERT INTO orders (customer_id, channel, fulfillment_type, requested_time, payment_method, total_cents, idempotency_key)
       VALUES ($1, 'online', $2, $3, $4, $5, $6)
       RETURNING id`,
      [customerId, body.fulfillmentType, body.requestedTime ?? null, body.paymentMethod, totalCents, idempotencyKey],
    );
    const orderId = orderRows[0]?.id;
    if (orderId === undefined) {
      throw new AppError("internal_error", "Failed to create order record", 500);
    }

    for (const item of body.items) {
      await client.query(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, price_at_order_cents, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, item.menuItemId, item.quantity, menuItemsById.get(item.menuItemId)!.price_cents, item.notes || null],
      );
    }

    await client.query("COMMIT");

    logEvent("info", "order_status_changed", {
      orderId,
      customerId,
      phone: maskPhone(customer.phone),
      from: null,
      to: "created",
      channel: "online",
      fulfillmentType: body.fulfillmentType,
      totalCents,
    });
    return orderId;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

ordersRouter.post("/", requireVerifiedPhone, async (req, res, next) => {
  try {
    const idempotencyKey = idempotencyKeySchema.parse(req.get("Idempotency-Key"));
    const body = createOrderSchema.parse(req.body);
    const customerId = req.customer!.customerId;

    if (!ENABLED_PAYMENT_METHODS.has(body.paymentMethod)) {
      throw new AppError("payment_method_unavailable", "Only cash at pickup is available right now", 400);
    }

    // A retry of an order we already created returns that order, even if the
    // shop has closed or an item has changed since.
    const existingOrderId = await findOrderIdByIdempotencyKey(pool, customerId, idempotencyKey);
    if (existingOrderId !== null) {
      res.status(200).json(await getOrderForCustomer(pool, existingOrderId, customerId));
      return;
    }

    const pickupMinutes = resolvePickupMinutes(
      new Date(),
      body.fulfillmentType,
      body.requestedTime ? new Date(body.requestedTime) : null,
    );

    let orderId: number;
    let status = 201;
    try {
      orderId = await insertOrder(customerId, idempotencyKey, body, pickupMinutes);
    } catch (err) {
      // Two requests with the same key raced past the lookup above; the
      // unique index let exactly one insert win. Return that one.
      if (!isIdempotencyConflict(err)) {
        throw err;
      }
      const winnerId = await findOrderIdByIdempotencyKey(pool, customerId, idempotencyKey);
      if (winnerId === null) {
        throw err;
      }
      orderId = winnerId;
      status = 200;
    }

    res.status(status).json(await getOrderForCustomer(pool, orderId, customerId));
  } catch (err) {
    next(err);
  }
});

const orderIdParamSchema = z.coerce.number().int().positive();

// Polled every 15 s by the customer's status page. Another customer's order
// gets the same 404 as a missing one, so order ids can't be probed.
ordersRouter.get("/:id", requireVerifiedPhone, async (req, res, next) => {
  try {
    const orderId = orderIdParamSchema.parse(req.params.id);
    const order = await getOrderForCustomer(pool, orderId, req.customer!.customerId);
    if (!order) {
      throw new AppError("not_found", "Order not found", 404);
    }
    res.json(order);
  } catch (err) {
    next(err);
  }
});
