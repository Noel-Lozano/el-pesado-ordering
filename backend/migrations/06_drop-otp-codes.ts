import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Twilio Verify now generates, stores, and checks verification codes
// (ADR-003), so our own otp_codes table is no longer used.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('otp_codes');
}

// Recreates the table exactly as 02_otp-codes did (plus RLS from 04), so
// rolling back to the ADR-001 flow is possible. Codes themselves are not restored.
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('otp_codes', {
    id: 'id',
    phone: { type: 'text', notNull: true },
    code_hash: { type: 'text', notNull: true },
    attempts: { type: 'integer', notNull: true, default: 0 },
    expires_at: { type: 'timestamptz', notNull: true },
    consumed_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('otp_codes', 'phone');
  pgm.sql('ALTER TABLE public.otp_codes ENABLE ROW LEVEL SECURITY');
}
