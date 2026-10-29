import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns('menu_items', {
    display_order: { type: 'integer', notNull: true, default: 0 },
    available_from: { type: 'time' }, // null = available all day
  });
  pgm.addConstraint('menu_items', 'menu_items_category_name_key', {
    unique: ['category', 'name'],
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint('menu_items', 'menu_items_category_name_key');
  pgm.dropColumns('menu_items', ['display_order', 'available_from']);
}