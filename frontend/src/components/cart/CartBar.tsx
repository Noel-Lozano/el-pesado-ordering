"use client";

import Link from "next/link";
import { useCart } from "@/context/CartContext";
import { formatMXN } from "@/lib/money";
import { strings } from "@/lib/strings";

// Floating "Ver pedido · N · $total" bar above the tab bar (mockup 01). Only
// shown once the cart has something in it; on desktop the cart sidebar
// replaces it.
export function CartBar() {
  const { hasLoaded, itemCount, subtotalCents } = useCart();

  if (!hasLoaded || itemCount === 0) {
    return null;
  }

  const total = formatMXN(subtotalCents);
  return (
    <div className="px-4 pb-3 lg:hidden">
      <Link
        href="/cart"
        aria-label={strings.cart.viewOrderLabel(itemCount, total)}
        className="mx-auto flex h-14 max-w-xl items-center justify-between rounded border-2 border-navy bg-orange px-4 text-navy shadow-hard active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
      >
        <span className="flex items-center gap-2.5">
          <span className="flex h-7 min-w-7 items-center justify-center rounded-sm bg-navy px-1 text-sm font-black text-yellow">
            {itemCount}
          </span>
          <span className="font-display text-[19px]">{strings.cart.viewOrder}</span>
        </span>
        <span className="text-[17px] font-black tabular-nums">{total}</span>
      </Link>
    </div>
  );
}
