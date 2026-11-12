/**
 * backend/scripts/seed-menu.ts
 *
 * Seeds / syncs the menu_items table from the menu board.
 *
 *   npm run seed:menu -- --dry-run  -> runs everything, then ROLLBACK
 *   npm run seed:menu               -> applies changes
 *
 * Requires the menu-display migration (display_order, available_from,
 * unique (category, name)) to have run first.
 *
 * Design notes:
 *  - Idempotent: safe to run again any time prices change. Rows are matched
 *    on (category, name) and updated in place, so their ids never change and
 *    past orders that reference them stay valid.
 *  - Items no longer on the board are switched off (is_available = false),
 *    never DELETEd, for the same reason.
 *  - Prices are written in pesos here and converted to centavos (price_cents)
 *    in one place: the params line in main().
 *  - image_url is never overwritten, so photos you upload later survive a re-seed.
 *  - Everything runs in one transaction: all of it lands, or none of it does.
 */
import 'dotenv/config';
import { Pool } from 'pg';
import type { MenuCategory as Category } from '../src/lib/menuCategories.js';

const TABLE = 'menu_items';
const DRY_RUN = process.argv.includes('--dry-run');

interface MenuItem {
  category: Category;
  name: string;
  price: number; // MXN, whole pesos (as on the board)
  description: string;
  availableFrom?: string | null; // 'HH:MM'; omitted = available all day
}

// ---------------------------------------------------------------------------
// Shared fillings: written once, reused by burritos and montadas.
// ---------------------------------------------------------------------------
const FILLINGS: Record<string, string> = {
  'Frijoles con queso': 'frijoles refritos con queso derretido',
  'Frijoles con asadero': 'frijoles refritos con queso asadero bien derretidito',
  'Huevo con jamón': 'huevo revuelto con jamón',
  'Huevo con chorizo': 'huevo revuelto con chorizo',
  Winnie: 'salchicha guisada en salsita de tomate con chile',
  Arriero: 'carne de res guisada al estilo arriero, con chile y papa',
  Mole: 'carne deshebrada bañada en mole casero',
  Verde: 'carne de puerco en chile verde',
  'Papa con chile y queso': 'papa guisada con chile verde y queso',
  Picadillo: 'picadillo de res con papa y verduras',
  'Chicharrón de cuero': 'chicharrón de cuero en salsa roja',
  'Rajas con queso': 'rajas de chile poblano con queso',
  Asado: 'asado de puerco en chile colorado, estilo Chihuahua',
  'Chicharrón prensado': 'chicharrón prensado en salsa verde',
  'Deshebrada a la Mexicana': 'carne deshebrada a la mexicana con tomate, cebolla y chile',
  Relleno: 'chile relleno de queso, capeado',
  Milanesa: 'milanesa de res empanizada',
  Discada: 'discada norteña con carnes mixtas, tocino y chorizo',
  Bistec: 'bistec de res asado con cebollita',
  'Colita de pavo': 'colita de pavo adobada y bien doradita',
};

const burrito = (name: string, price: number): MenuItem => ({
  category: 'Burritos',
  name,
  price,
  description: `Burrito de ${FILLINGS[name]}, envuelto en tortilla de harina.`,
});

const montada = (name: string, price: number): MenuItem => ({
  category: 'Montadas',
  name,
  price,
  description: `Montada de ${FILLINGS[name]}, con queso gratinado encima.`,
});

const extra = (name: string, price: number, description: string): MenuItem => ({
  category: 'Extras',
  name,
  price,
  description,
});

// ---------------------------------------------------------------------------
// The menu, in the same order as the board (array order = display_order).
// ---------------------------------------------------------------------------
const MENU: MenuItem[] = [
  // BURRITOS
  burrito('Frijoles con queso', 30),
  burrito('Huevo con jamón', 35),
  burrito('Huevo con chorizo', 35),
  burrito('Winnie', 35),
  burrito('Arriero', 40),
  burrito('Mole', 40),
  burrito('Verde', 40),
  burrito('Papa con chile y queso', 40),
  burrito('Picadillo', 40),
  burrito('Chicharrón de cuero', 40),
  burrito('Rajas con queso', 40),
  burrito('Frijoles con asadero', 45),
  burrito('Asado', 45),
  burrito('Chicharrón prensado', 45),
  burrito('Deshebrada a la Mexicana', 50),
  burrito('Relleno', 55),
  burrito('Milanesa', 70),

  // MONTADAS
  {
    category: 'Montadas',
    name: 'Quesadilla sencilla',
    price: 45,
    description: 'Quesadilla de harina con puro queso derretido, sencilla y sabrosa.',
  },
  montada('Frijoles con queso', 50),
  montada('Frijoles con asadero', 60),
  montada('Huevo con jamón', 60),
  montada('Huevo con chorizo', 60),
  montada('Winnie', 60),
  montada('Arriero', 65),
  montada('Mole', 65),
  montada('Verde', 65),
  montada('Papa con chile y queso', 65),
  montada('Picadillo', 65),
  montada('Chicharrón de cuero', 65),
  montada('Rajas con queso', 65),
  montada('Deshebrada a la Mexicana', 65),
  montada('Asado', 65),
  montada('Chicharrón prensado', 65),
  montada('Relleno', 70),
  montada('Milanesa', 80),

  // DESAYUNOS
  {
    category: 'Desayunos',
    name: 'Sencillo',
    price: 100,
    description: 'Desayuno completo: dos huevos al gusto, frijolitos, papas y tortillas de harina.',
  },
  {
    category: 'Desayunos',
    name: 'Omelette',
    price: 110,
    description: 'Omelette esponjadito con jamón, queso y verduras, con frijoles y tortillas.',
  },
  {
    category: 'Desayunos',
    name: 'Relleno',
    price: 110,
    description: 'Chile relleno de queso con huevos al gusto, frijoles y tortillas.',
  },

  // DESPUÉS DE LAS 2 PM
  ...(['Discada', 'Bistec', 'Colita de pavo'] as const).flatMap((f): MenuItem[] => [
    {
      category: 'Después de las 2 PM',
      name: `Burrito de ${f}`,
      price: f === 'Colita de pavo' ? 70 : 65,
      description: `Burrito de ${FILLINGS[f]}. Disponible después de las 2 PM.`,
      availableFrom: '14:00',
    },
    {
      category: 'Después de las 2 PM',
      name: `Montada de ${f}`,
      price: f === 'Colita de pavo' ? 85 : 80,
      description: `Montada de ${FILLINGS[f]}, con queso gratinado. Disponible después de las 2 PM.`,
      availableFrom: '14:00',
    },
  ]),

  // EXTRAS
  extra('Agua', 10, 'Agua natural embotellada, bien fría.'),
  extra('Tortilla', 10, 'Tortilla de harina extra, calientita.'),
  extra('Kool-Aid', 15, 'Kool-Aid bien helado del sabor del día.'),
  extra('Papitas', 20, 'Bolsita de papitas pa’l antojo.'),
  extra('Panecillos', 20, 'Pancito dulce para acompañar.'),
  extra('Té Brisk', 30, 'Té helado Brisk.'),
  extra('Refresco 355 ml', 30, 'Refresco de lata, bien frío.'),
  extra('Refresco 600 ml', 35, 'Refresco de botella de 600 ml, bien frío.'),
  extra('Fuze Tea', 35, 'Té helado Fuze Tea.'),
  extra('Arizona', 35, 'Bebida Arizona, varios sabores.'),
  extra('Jugos', 35, 'Jugo embotellado, varios sabores.'),
];

// ---------------------------------------------------------------------------
// Validation: fail loudly before touching the database.
// ---------------------------------------------------------------------------
function validate(menu: MenuItem[]): void {
  const seen = new Set<string>();
  for (const item of menu) {
    const key = `${item.category}::${item.name}`;
    if (seen.has(key)) throw new Error(`Duplicate menu item: ${key}`);
    seen.add(key);
    if (!Number.isInteger(item.price) || item.price <= 0)
      throw new Error(`Bad price for ${key}: ${item.price}`);
    if (!item.description || item.description.includes('undefined'))
      throw new Error(`Missing description for ${key} (filling not in FILLINGS?)`);
    if (item.availableFrom && !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.availableFrom))
      throw new Error(`Bad availableFrom for ${key}: ${item.availableFrom} (use 'HH:MM')`);
  }
}

async function main(): Promise<void> {
  validate(MENU);

  // SSL comes from DATABASE_URL (e.g. ?sslmode=no-verify for Supabase), the
  // same as the app's pool in src/db/pool.ts, so this also works against a
  // local or CI Postgres that has no SSL.
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL, // Session Pooler string
  });
  const client = await pool.connect();

  // display_order restarts per category, in steps of 10 so you can slot
  // an item in later without renumbering everything.
  const orderCounter: Partial<Record<Category, number>> = {};
  let inserted = 0;
  let updated = 0;

  try {
    await client.query('BEGIN');

    for (const item of MENU) {
      const displayOrder = (orderCounter[item.category] = (orderCounter[item.category] ?? 0) + 10);
      const params = [
        item.category,             // $1
        item.name,                 // $2
        item.price * 100,          // $3  pesos -> centavos
        item.description,          // $4
        displayOrder,              // $5
        item.availableFrom ?? null // $6
      ];

      const res = await client.query(
        `UPDATE ${TABLE}
            SET price_cents = $3, description = $4, display_order = $5,
                available_from = $6, is_available = true, updated_at = now()
          WHERE category = $1 AND name = $2`,
        params,
      );

      if (res.rowCount && res.rowCount > 0) {
        updated++;
      } else {
        await client.query(
          `INSERT INTO ${TABLE} (category, name, price_cents, description, display_order, available_from, is_available)
           VALUES ($1, $2, $3, $4, $5, $6, true)`,
          params,
        );
        inserted++;
      }
    }

    // Switch off anything that's no longer on the board.
    const retired = await client.query<{ category: string; name: string }>(
      `UPDATE ${TABLE}
          SET is_available = false, updated_at = now()
        WHERE is_available = true
          AND (category, name) NOT IN (
            SELECT * FROM unnest($1::text[], $2::text[])
          )
        RETURNING category, name`,
      [MENU.map((i) => i.category), MENU.map((i) => i.name)],
    );

    console.log(`Inserted: ${inserted} | Updated: ${updated} | Deactivated: ${retired.rowCount}`);
    retired.rows.forEach((r) => console.log(`  - deactivated: ${r.category} / ${r.name}`));

    if (DRY_RUN) {
      await client.query('ROLLBACK');
      console.log('Dry run: rolled back, nothing was saved.');
    } else {
      await client.query('COMMIT');
      console.log(`Done. ${MENU.length} available menu items.`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});