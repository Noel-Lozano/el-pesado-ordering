import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Supabase exposes every public table through its Data API to the anon and
// authenticated roles. Nothing in this app uses that API — the backend
// connects directly as the table owner (postgres), which bypasses RLS — so
// enabling RLS with no policies closes the Data API without affecting the
// backend. Add policies only if a client ever talks to Supabase directly.
const TABLES = [
  'pgmigrations',
  'customers',
  'menu_items',
  'capacity_slots',
  'orders',
  'order_items',
  'otp_codes',
];

export async function up(pgm: MigrationBuilder): Promise<void> {
  for (const table of TABLES) {
    pgm.sql(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
  }
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  for (const table of TABLES) {
    pgm.sql(`ALTER TABLE public.${table} DISABLE ROW LEVEL SECURITY`);
  }
}
