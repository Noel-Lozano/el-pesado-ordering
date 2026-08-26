import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { AppError } from "../middleware/errorHandler.js";
import { requireVerifiedPhone } from "../middleware/requireVerifiedPhone.js";

export const ordersRouter = Router();

const orderItemSchema = z.object({
  menuItemId: z.number().int().positive(),
  quantity: z.number().int().positive(),
  notes: z.string().optional(),
});

const createOrderSchema = z
  .object({
    fulfillmentType: z.enum(["asap", "scheduled"]),
    requestedTime: z.iso.datetime().optional(),
    paymentMethod: z.enum(["card", "oxxo", "bank_transfer", "cash"]),
    items: z.array(orderItemSchema).min(1),
  })
  .refine((body) => body.fulfillmentType === "asap" || body.requestedTime !== undefined, {
    message: "requestedTime is required for scheduled orders",
    path: ["requestedTime"],
  });

ordersRouter.post("/", requireVerifiedPhone, async (req, res, next) => {
  try {
    const body = createOrderSchema.parse(req.body);
    const customerId = req.customer!.customerId;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const menuItemIds = body.items.map((item) => item.menuItemId);
      const { rows: menuItems } = await client.query<{ id: number; price_cents: number; is_available: boolean }>(
        `SELECT id, price_cents, is_available FROM menu_items WHERE id = ANY($1)`,
        [menuItemIds],
      );
      const menuItemsById = new Map(menuItems.map((item) => [item.id, item]));

      for (const item of body.items) {
        const menuItem = menuItemsById.get(item.menuItemId);
        if (!menuItem || !menuItem.is_available) {
          throw new AppError("menu_item_unavailable", `Menu item ${item.menuItemId} is not available`, 400);
        }
      }

      const totalCents = body.items.reduce(
        (sum, item) => sum + menuItemsById.get(item.menuItemId)!.price_cents * item.quantity,
        0,
      );

      const { rows: orderRows } = await client.query<{ id: number }>(
        `INSERT INTO orders (customer_id, channel, fulfillment_type, requested_time, payment_method, total_cents)
         VALUES ($1, 'online', $2, $3, $4, $5)
         RETURNING id`,
        [customerId, body.fulfillmentType, body.requestedTime ?? null, body.paymentMethod, totalCents],
      );
      const orderRow = orderRows[0];
      if (!orderRow) {
        throw new AppError("internal_error", "Failed to create order record", 500);
      }
      const orderId = orderRow.id;

      for (const item of body.items) {
        const menuItem = menuItemsById.get(item.menuItemId)!;
        await client.query(
          `INSERT INTO order_items (order_id, menu_item_id, quantity, price_at_order_cents, notes)
           VALUES ($1, $2, $3, $4, $5)`,
          [orderId, item.menuItemId, item.quantity, menuItem.price_cents, item.notes ?? null],
        );
      }

      await client.query("COMMIT");

      res.status(201).json({ orderId, totalCents });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});
