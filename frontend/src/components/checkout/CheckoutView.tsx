"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { getMenu } from "@/lib/api";
import { strings } from "@/lib/strings";
import type { MenuResponse } from "@/types/menu";

type MenuState = { status: "loading" } | { status: "error" } | { status: "ready"; menu: MenuResponse };

// Gate for /checkout: waits for the saved cart and a fresh copy of the menu
// (for shop hours and item availability), then mounts the form. Mounting the
// form only on the client lets it read the saved draft in its initial state.
export function CheckoutView() {
  const router = useRouter();
  const { lines, hasLoaded } = useCart();
  // The form prefills a returning customer's phone from the stored login.
  const { hasLoaded: hasAuthLoaded } = useAuth();
  const [menuState, setMenuState] = useState<MenuState>({ status: "loading" });

  const loadMenu = useCallback(() => {
    getMenu()
      .then((menu) => setMenuState({ status: "ready", menu }))
      .catch(() => setMenuState({ status: "error" }));
  }, []);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  const isCartEmpty = hasLoaded && lines.length === 0;
  useEffect(() => {
    if (isCartEmpty) {
      router.replace("/cart");
    }
  }, [isCartEmpty, router]);

  if (!hasLoaded || !hasAuthLoaded || isCartEmpty || menuState.status === "loading") {
    return <p className="py-12 text-center text-zinc-600 dark:text-zinc-400">{strings.checkout.loading}</p>;
  }

  if (menuState.status === "error") {
    return (
      <div className="flex flex-col items-center gap-4 py-12 text-center">
        <p>{strings.checkout.menuLoadError}</p>
        <button
          type="button"
          onClick={() => {
            setMenuState({ status: "loading" });
            loadMenu();
          }}
          className="min-h-11 rounded-full bg-red-700 px-6 font-semibold text-white active:bg-red-800"
        >
          {strings.checkout.retry}
        </button>
        <Link href="/cart" className="flex min-h-11 items-center font-medium underline underline-offset-4">
          {strings.checkout.backToCart}
        </Link>
      </div>
    );
  }

  return <CheckoutForm menu={menuState.menu} lines={lines} />;
}
