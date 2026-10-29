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
  cart: {
    pageTitle: "Tu carrito",
    add: "Agregar",
    // "Frijoles con queso (Montadas)": names repeat across categories.
    itemLabel: (name: string, categoryName: string) => `${name} (${categoryName})`,
    addLabel: (name: string) => `Agregar ${name} al carrito`,
    increaseLabel: (name: string) => `Agregar uno más de ${name}`,
    decreaseLabel: (name: string) => `Quitar uno de ${name}`,
    quantityLabel: (name: string, quantity: number) => `${quantity} de ${name} en el carrito`,
    remove: "Quitar",
    removeLabel: (name: string) => `Quitar ${name} del carrito`,
    unitPrice: (price: string) => `${price} c/u`,
    noteLabel: "Instrucciones (opcional)",
    notePlaceholder: "Ej. sin cebolla, extra salsa",
    noteCounter: (used: number, max: number) => `${used}/${max}`,
    subtotal: "Subtotal",
    totalDisclaimer: "El total final se confirma al hacer tu pedido.",
    paymentNote: "Pagas en efectivo al recoger.",
    checkout: "Continuar con el pedido",
    backToMenu: "Seguir pidiendo",
    emptyTitle: "Tu carrito está vacío",
    emptyBody: "Agrega algo del menú para empezar.",
    loading: "Cargando tu carrito…",
    viewCart: (itemCount: number, total: string) => `Ver carrito (${itemCount}) · ${total}`,
  },
  errors: {
    menuLoad: {
      title: "No pudimos cargar el menú",
      body: "Revisa tu conexión e inténtalo de nuevo.",
      retry: "Intentar de nuevo",
    },
  },
} as const;
