import { randomInt, randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// Full order-placement flow against the real database (coding_standards.md §8):
// verify code -> token -> POST /orders. Twilio is mocked; everything else is real.
// Only Date is faked, so pg's own timers keep working.

vi.mock("../lib/twilio.js", () => ({
  startWhatsAppVerification: vi.fn(async () => {}),
  isVerificationCodeApproved: vi.fn(async (_phone: string, code: string) => code === "123456"),
}));

const { createApp } = await import("../app.js");
const { pool } = await import("../db/pool.js");

const app = createApp();
// Unassigned +1 555-01xx range, randomized so parallel runs don't collide.
const TEST_PHONE = `+1555010${String(randomInt(0, 10_000)).padStart(4, "0")}`;
// Shop is Mon–Sat 07:30–15:30 in America/Ciudad_Juarez (UTC-6 until 2026-11-01).
const WEDNESDAY_1005 = new Date("2026-10-28T10:05:00-06:00");
const SUNDAY_1000 = new Date("2026-11-01T10:00:00-07:00");

interface MenuRow {
  id: number;
  price_cents: number;
}
let burrito: MenuRow;
let afterTwoItem: MenuRow;
let token: string;

async function menuItem(category: string, name: string): Promise<MenuRow> {
  const { rows } = await pool.query<MenuRow>(
    `SELECT id, price_cents FROM menu_items WHERE category = $1 AND name = $2 AND is_available`,
    [category, name],
  );
  if (!rows[0]) throw new Error(`Seeded menu item missing: ${category} / ${name}`);
  return rows[0];
}

function postOrder(body: object, idempotencyKey: string | null = randomUUID(), authToken: string | null = token) {
  let req = request(app).post("/api/v1/orders").send(body);
  if (idempotencyKey) req = req.set("Idempotency-Key", idempotencyKey);
  if (authToken) req = req.set("Authorization", `Bearer ${authToken}`);
  return req;
}

const asapBurrito = () => ({
  fulfillmentType: "asap",
  paymentMethod: "cash",
  customerName: "Prueba Integración",
  // A client-sent price must be ignored; it isn't even part of the schema.
  items: [{ menuItemId: burrito.id, quantity: 2, notes: "sin cebolla", unitPriceCents: 1 }],
});

// Tokens last 24h, so a test that jumps the clock days ahead needs a token
// issued at that time.
async function tokenIssuedAt(instant: Date): Promise<string> {
  vi.setSystemTime(instant);
  const res = await request(app).post("/api/v1/auth/verify-code").send({ phone: TEST_PHONE, code: "123456" });
  return res.body.token as string;
}

async function countOrders(): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.phone = $1`,
    [TEST_PHONE],
  );
  return rows[0]?.n ?? 0;
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(WEDNESDAY_1005);
  burrito = await menuItem("Burritos", "Frijoles con queso");
  afterTwoItem = await menuItem("Después de las 2 PM", "Burrito de Discada");
});

afterEach(() => {
  vi.setSystemTime(WEDNESDAY_1005);
});

afterAll(async () => {
  vi.useRealTimers();
  await pool.query(
    `DELETE FROM order_items WHERE order_id IN (
       SELECT o.id FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.phone = $1)`,
    [TEST_PHONE],
  );
  await pool.query(`DELETE FROM orders WHERE customer_id IN (SELECT id FROM customers WHERE phone = $1)`, [
    TEST_PHONE,
  ]);
  await pool.query(`DELETE FROM customers WHERE phone = $1`, [TEST_PHONE]);
  await pool.end();
});

describe("POST /auth/send-code and /auth/verify-code (Twilio mocked)", () => {
  it("sends a code", async () => {
    const res = await request(app).post("/api/v1/auth/send-code").send({ phone: TEST_PHONE });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "sent" });
  });

  it("rejects a wrong code", async () => {
    const res = await request(app).post("/api/v1/auth/verify-code").send({ phone: TEST_PHONE, code: "000000" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_code");
  });

  it("issues a token for an approved code and creates the customer", async () => {
    const res = await request(app).post("/api/v1/auth/verify-code").send({ phone: TEST_PHONE, code: "123456" });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
    token = res.body.token;
  });
});

describe("POST /orders", () => {
  it("requires a token", async () => {
    const res = await postOrder(asapBurrito(), randomUUID(), null);
    expect(res.status).toBe(401);
  });

  it("requires a UUID Idempotency-Key", async () => {
    expect((await postOrder(asapBurrito(), null)).body.error.code).toBe("validation_error");
    expect((await postOrder(asapBurrito(), "not-a-uuid")).body.error.code).toBe("validation_error");
  });

  it("creates an order priced from the database and returns it", async () => {
    const res = await postOrder(asapBurrito());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: "created",
      fulfillmentType: "asap",
      requestedTime: null,
      paymentMethod: "cash",
      paymentStatus: "unpaid",
      totalCents: burrito.price_cents * 2,
      customerName: "Prueba Integración",
      phoneLast4: TEST_PHONE.slice(-4),
      items: [
        {
          menuItemId: burrito.id,
          name: "Frijoles con queso",
          categoryName: "Burritos",
          quantity: 2,
          priceAtOrderCents: burrito.price_cents,
          notes: "sin cebolla",
        },
      ],
    });
  });

  it("returns the same order for a repeated Idempotency-Key, without a duplicate", async () => {
    const key = randomUUID();
    const before = await countOrders();
    const first = await postOrder(asapBurrito(), key);
    const second = await postOrder(asapBurrito(), key);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id);
    expect(await countOrders()).toBe(before + 1);
  });

  it("creates exactly one order when the same key arrives concurrently", async () => {
    const key = randomUUID();
    const before = await countOrders();
    const results = await Promise.all([postOrder(asapBurrito(), key), postOrder(asapBurrito(), key)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 201]);
    expect(results[0]?.body.id).toBe(results[1]?.body.id);
    expect(await countOrders()).toBe(before + 1);
  });

  it("replays an existing order even after the shop has closed", async () => {
    const key = randomUUID();
    const created = await postOrder(asapBurrito(), key);
    const sundayToken = await tokenIssuedAt(SUNDAY_1000);
    const replay = await postOrder(asapBurrito(), key, sundayToken);
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(created.body.id);
  });

  it("only accepts cash for now", async () => {
    const res = await postOrder({ ...asapBurrito(), paymentMethod: "card" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("payment_method_unavailable");
  });

  it("rejects new orders while the shop is closed", async () => {
    const sundayToken = await tokenIssuedAt(SUNDAY_1000);
    const res = await postOrder(asapBurrito(), randomUUID(), sundayToken);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("shop_closed");
  });

  it("enforces available_from: ASAP at 10:05 fails, scheduled 14:00 works", async () => {
    const items = [{ menuItemId: afterTwoItem.id, quantity: 1 }];
    const asap = await postOrder({ fulfillmentType: "asap", paymentMethod: "cash", items });
    expect(asap.status).toBe(409);
    expect(asap.body.error.code).toBe("item_not_available_yet");

    const requestedTime = new Date("2026-10-28T14:00:00-06:00").toISOString();
    const scheduled = await postOrder({ fulfillmentType: "scheduled", requestedTime, paymentMethod: "cash", items });
    expect(scheduled.status).toBe(201);
    expect(scheduled.body.requestedTime).toBe(requestedTime);
  });

  it("rejects unknown items, duplicate lines, long notes, and bad quantities", async () => {
    const base = { fulfillmentType: "asap", paymentMethod: "cash" };
    const unknown = await postOrder({ ...base, items: [{ menuItemId: 99_999_999, quantity: 1 }] });
    expect(unknown.body.error.code).toBe("menu_item_unavailable");

    const duplicate = await postOrder({
      ...base,
      items: [
        { menuItemId: burrito.id, quantity: 1 },
        { menuItemId: burrito.id, quantity: 1 },
      ],
    });
    expect(duplicate.body.error.code).toBe("validation_error");

    const longNote = await postOrder({
      ...base,
      items: [{ menuItemId: burrito.id, quantity: 1, notes: "x".repeat(141) }],
    });
    expect(longNote.body.error.code).toBe("validation_error");

    const tooMany = await postOrder({ ...base, items: [{ menuItemId: burrito.id, quantity: 21 }] });
    expect(tooMany.body.error.code).toBe("validation_error");
  });

  it("returns requestedClockTime in shop time for scheduled orders", async () => {
    const requestedTime = new Date("2026-10-28T11:45:00-06:00").toISOString();
    const res = await postOrder({
      fulfillmentType: "scheduled",
      requestedTime,
      paymentMethod: "cash",
      items: [{ menuItemId: burrito.id, quantity: 1 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.requestedClockTime).toBe("11:45");
  });

  it("rejects requestedTime on ASAP orders and requires it on scheduled ones", async () => {
    const items = [{ menuItemId: burrito.id, quantity: 1 }];
    const asapWithTime = await postOrder({
      fulfillmentType: "asap",
      requestedTime: new Date().toISOString(),
      paymentMethod: "cash",
      items,
    });
    expect(asapWithTime.body.error.code).toBe("validation_error");
    const scheduledWithout = await postOrder({ fulfillmentType: "scheduled", paymentMethod: "cash", items });
    expect(scheduledWithout.body.error.code).toBe("validation_error");
  });
});

describe("GET /orders/:id", () => {
  let orderId: number;
  let otherCustomerToken: string;
  const OTHER_PHONE = `+1555011${String(randomInt(0, 10_000)).padStart(4, "0")}`;

  beforeAll(async () => {
    orderId = (await postOrder(asapBurrito())).body.id;
    const res = await request(app).post("/api/v1/auth/verify-code").send({ phone: OTHER_PHONE, code: "123456" });
    otherCustomerToken = res.body.token;
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM customers WHERE phone = $1`, [OTHER_PHONE]);
  });

  const getOrder = (id: string | number, authToken: string | null = token) => {
    const req = request(app).get(`/api/v1/orders/${id}`);
    return authToken ? req.set("Authorization", `Bearer ${authToken}`) : req;
  };

  it("returns the customer's own order in the same shape POST returned", async () => {
    const res = await getOrder(orderId);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: orderId, status: "created", totalCents: burrito.price_cents * 2 });
    expect(res.body.items[0]).toMatchObject({ menuItemId: burrito.id, categoryName: "Burritos" });
  });

  it("reflects status changes made by staff", async () => {
    await pool.query(`UPDATE orders SET status = 'ready', updated_at = now() WHERE id = $1`, [orderId]);
    expect((await getOrder(orderId)).body.status).toBe("ready");
  });

  it("answers 404 for another customer's order, same as a missing one", async () => {
    const foreign = await getOrder(orderId, otherCustomerToken);
    const missing = await getOrder(99_999_999);
    expect(foreign.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(foreign.body).toEqual(missing.body);
  });

  it("requires a token and a numeric id", async () => {
    expect((await getOrder(orderId, null)).status).toBe(401);
    expect((await getOrder("abc")).body.error.code).toBe("validation_error");
  });
});
