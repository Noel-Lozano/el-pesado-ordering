"use client";

import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { formatMXN } from "@/lib/money";
import { strings } from "@/lib/strings";

// Sticky bottom bar on the menu page: "Ver carrito (3) · $240". Sits in the
// thumb zone and only appears once the cart has something in it.
export function CartBar() {
  const { hasLoaded, itemCount, subtotalCents } = useCart();

  if (!hasLoaded || itemCount === 0) {
    return null;
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
      <Link
        href="/cart"
        className="mx-auto flex min-h-14 max-w-2xl items-center justify-center rounded-full bg-red-700 px-6 text-lg font-bold text-white shadow-lg active:bg-red-800"
      >
        {strings.cart.viewCart(itemCount, formatMXN(subtotalCents))}
      </Link>
    </div>
  );
}
