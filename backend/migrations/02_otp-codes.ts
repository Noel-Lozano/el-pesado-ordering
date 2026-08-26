import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
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
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('otp_codes');
}
