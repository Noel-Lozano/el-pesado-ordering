"use client";

import Link from "next/link";
import { CartLine } from "@/components/cart/CartLine";
import { CartSummary } from "@/components/cart/CartSummary";
import { useCart } from "@/context/CartContext";
import { strings } from "@/lib/strings";

const primaryButtonClass =
  "flex min-h-14 items-center justify-center rounded-full bg-red-700 px-6 text-lg font-bold text-white active:bg-red-800";

export function CartView() {
  const { lines, hasLoaded, subtotalCents } = useCart();

  if (!hasLoaded) {
    return <p className="py-12 text-center text-zinc-600 dark:text-zinc-400">{strings.cart.loading}</p>;
  }

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <h2 className="text-xl font-bold">{strings.cart.emptyTitle}</h2>
        <p className="text-zinc-600 dark:text-zinc-400">{strings.cart.emptyBody}</p>
        <Link href="/" className={primaryButtonClass}>
          {strings.cart.backToMenu}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {lines.map((line) => (
          <li key={line.menuItemId}>
            <CartLine line={line} />
          </li>
        ))}
      </ul>
      <CartSummary subtotalCents={subtotalCents} />
      <Link href="/checkout" className={primaryButtonClass}>
        {strings.cart.checkout}
      </Link>
      <Link href="/" className="flex min-h-11 items-center justify-center font-medium underline underline-offset-4">
        {strings.cart.backToMenu}
      </Link>
    </div>
  );
}
