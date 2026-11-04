import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// Lets POST /orders recognize a retried request (double tap, flaky mobile
// network) and return the order it already created instead of a duplicate.
// The client sends one UUID per checkout as the Idempotency-Key header.
// Keys are scoped per customer; existing rows (and non-online channels) have none.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn('orders', {
    idempotency_key: { type: 'uuid' },
  });
  pgm.createIndex('orders', ['customer_id', 'idempotency_key'], {
    name: 'orders_customer_idempotency_key_uniq',
    unique: true,
    where: 'idempotency_key IS NOT NULL',
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('orders', ['customer_id', 'idempotency_key'], { name: 'orders_customer_idempotency_key_uniq' });
  pgm.dropColumn('orders', 'idempotency_key');
}
