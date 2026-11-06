// All price display goes through formatMXN. Amounts are always integer
// centavos, never floats (coding_standards.md §3).

const CENTAVOS_PER_PESO = 100;

const wholePesoFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const pesoWithCentavosFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// 3000 -> "$30", 4550 -> "$45.50". Whole pesos drop the ".00" to match the
// menu board.
export function formatMXN(cents: number): string {
  if (!Number.isInteger(cents)) {
    throw new Error(`formatMXN expects integer centavos, got ${cents}`);
  }

  const formatter = cents % CENTAVOS_PER_PESO === 0 ? wholePesoFormatter : pesoWithCentavosFormatter;
  return formatter.format(cents / CENTAVOS_PER_PESO);
}
