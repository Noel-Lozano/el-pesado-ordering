import { formatClockTime } from "@/lib/time";

// All UI copy lives here. The UI is Spanish-first; adding English later means
// adding a sibling file with the same shape, not editing components.

export const strings = {
  app: {
    name: "Burritos El Pesado",
    tagline: "Pide en línea y recoge en tienda",
    description: "Pide tus burritos en línea y recógelos en tienda, sin filas.",
  },
  menu: {
    categoriesNavLabel: "Categorías del menú",
    empty: "Por ahora no hay platillos disponibles. Vuelve más tarde.",
    availableFrom: (hhmm: string) => `Disponible después de las ${formatClockTime(hhmm)}`,
  },
  errors: {
    menuLoad: {
      title: "No pudimos cargar el menú",
      body: "Revisa tu conexión e inténtalo de nuevo.",
      retry: "Intentar de nuevo",
    },
  },
} as const;
