import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

// OXXO is no longer a payment method (ADR-006). The API already rejects it;
// this makes the database reject it too. Fails, rather than silently
// rewriting data, if any order was ever saved with 'oxxo'.
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint('orders', 'orders_payment_method_check');
  pgm.addConstraint(
    'orders',
    'orders_payment_method_check',
    "CHECK (payment_method IN ('card', 'bank_transfer', 'cash'))",
  );
}

// Restores the constraint exactly as 01_init-core-schema created it.
export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint('orders', 'orders_payment_method_check');
  pgm.addConstraint(
    'orders',
    'orders_payment_method_check',
    "CHECK (payment_method IN ('card', 'oxxo', 'bank_transfer', 'cash'))",
  );
}
