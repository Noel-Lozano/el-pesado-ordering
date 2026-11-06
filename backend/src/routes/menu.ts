import { Router } from "express";
import { pool } from "../db/pool.js";
import { MENU_CATEGORY_ORDER } from "../lib/menuCategories.js";
import { SHOP_HOURS, SHOP_TIMEZONE } from "../lib/shopHours.js";

export const menuRouter = Router();

interface MenuItemRow {
  id: number;
  name: string;
  description: string | null;
  price_cents: number;
  image_url: string | null;
  category: string;
  available_from: string | null;
}

interface MenuItemResponse {
  id: number;
  name: string;
  description: string | null;
  priceCents: number;
  imageUrl: string | null;
  availableFrom: string | null;
}

interface MenuCategoryResponse {
  name: string;
  items: MenuItemResponse[];
}

// Only items that are switched on AND have a real price are served, so an
// item seeded without a price can never go live by accident.
menuRouter.get("/", async (_req, res, next) => {
  try {
    const { rows } = await pool.query<MenuItemRow>(
      `SELECT id, name, description, price_cents, image_url, category,
              to_char(available_from, 'HH24:MI') AS available_from
       FROM menu_items
       WHERE is_available AND price_cents > 0
       ORDER BY array_position($1::text[], category) NULLS LAST, category, display_order, id`,
      [MENU_CATEGORY_ORDER],
    );

    // Rows arrive sorted by category, so grouping only needs to watch for the
    // category name changing.
    const categories: MenuCategoryResponse[] = [];
    for (const row of rows) {
      let current = categories[categories.length - 1];
      if (!current || current.name !== row.category) {
        current = { name: row.category, items: [] };
        categories.push(current);
      }
      current.items.push({
        id: row.id,
        name: row.name,
        description: row.description,
        priceCents: row.price_cents,
        imageUrl: row.image_url,
        availableFrom: row.available_from,
      });
    }

    res.json({
      shop: { timezone: SHOP_TIMEZONE, hours: SHOP_HOURS },
      categories,
    });
  } catch (err) {
    next(err);
  }
});
