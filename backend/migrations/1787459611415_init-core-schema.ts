import type { ColumnDefinitions, MigrationBuilder } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('customers', {
    id: 'id',
    phone: { type: 'text', notNull: true },
    phone_verified: { type: 'boolean', notNull: true, default: false },
    name: { type: 'text' },
    no_show_count: { type: 'integer', notNull: true, default: 0 },
    is_blocked: { type: 'boolean', notNull: true, default: false },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('customers', 'customers_phone_unique', 'UNIQUE(phone)');

  pgm.createTable('menu_items', {
    id: 'id',
    name: { type: 'text', notNull: true },
    description: { type: 'text' },
    price_cents: { type: 'integer', notNull: true },
    image_url: { type: 'text' },
    category: { type: 'text', notNull: true },
    is_available: { type: 'boolean', notNull: true, default: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createTable('capacity_slots', {
    id: 'id',
    day_of_week: { type: 'smallint' },
    date: { type: 'date' },
    start_time: { type: 'time', notNull: true },
    end_time: { type: 'time', notNull: true },
    max_orders: { type: 'integer', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint(
    'capacity_slots',
    'capacity_slots_day_or_date',
    'CHECK ((day_of_week IS NOT NULL) <> (date IS NOT NULL))',
  );

  pgm.createTable('orders', {
    id: 'id',
    customer_id: {
      type: 'integer',
      notNull: true,
      references: 'customers',
      onDelete: 'RESTRICT',
    },
    channel: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true, default: 'created' },
    fulfillment_type: { type: 'text', notNull: true },
    requested_time: { type: 'timestamptz', notNull: true },
    estimated_ready_at: { type: 'timestamptz' },
    payment_method: { type: 'text', notNull: true },
    payment_status: { type: 'text', notNull: true, default: 'unpaid' },
    currency_paid: { type: 'text' },
    total_cents: { type: 'integer', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('orders', 'orders_channel_check', "CHECK (channel IN ('online', 'phone', 'in_store'))");
  pgm.addConstraint(
    'orders',
    'orders_status_check',
    "CHECK (status IN ('created', 'confirmed', 'preparing', 'ready', 'picked_up', 'no_show', 'cancelled'))",
  );
  pgm.addConstraint(
    'orders',
    'orders_fulfillment_type_check',
    "CHECK (fulfillment_type IN ('asap', 'scheduled'))",
  );
  pgm.addConstraint(
    'orders',
    'orders_payment_method_check',
    "CHECK (payment_method IN ('card', 'oxxo', 'bank_transfer', 'cash'))",
  );
  pgm.addConstraint(
    'orders',
    'orders_payment_status_check',
    "CHECK (payment_status IN ('unpaid', 'awaiting_payment', 'paid'))",
  );
  pgm.addConstraint('orders', 'orders_currency_paid_check', "CHECK (currency_paid IN ('MXN', 'USD'))");
  pgm.createIndex('orders', 'customer_id');

  pgm.createTable('order_items', {
    id: 'id',
    order_id: {
      type: 'integer',
      notNull: true,
      references: 'orders',
      onDelete: 'CASCADE',
    },
    menu_item_id: {
      type: 'integer',
      notNull: true,
      references: 'menu_items',
      onDelete: 'RESTRICT',
    },
    quantity: { type: 'integer', notNull: true },
    price_at_order_cents: { type: 'integer', notNull: true },
    notes: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
  pgm.createIndex('order_items', 'order_id');
  pgm.createIndex('order_items', 'menu_item_id');
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('order_items');
  pgm.dropTable('orders');
  pgm.dropTable('capacity_slots');
  pgm.dropTable('menu_items');
  pgm.dropTable('customers');
}
