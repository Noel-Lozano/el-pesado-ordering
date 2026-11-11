"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { Button, ButtonLink } from "@/components/ui/Button";
import { TopBar } from "@/components/ui/TopBar";
import { useAuth } from "@/context/AuthContext";
import { useCart, useCartReconcile } from "@/context/CartContext";
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
  // Refreshes prices so the summary matches what the server will charge.
  useCartReconcile(menuState.status === "ready" ? menuState.menu.categories : null);

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

  let content;
  if (!hasLoaded || !hasAuthLoaded || isCartEmpty || menuState.status === "loading") {
    content = (
      <p role="status" className="py-12 text-center font-bold text-muted">
        {strings.checkout.loading}
      </p>
    );
  } else if (menuState.status === "error") {
    content = (
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 py-12 text-center">
        <p className="font-bold">{strings.checkout.menuLoadError}</p>
        <Button
          className="w-full"
          onClick={() => {
            setMenuState({ status: "loading" });
            loadMenu();
          }}
        >
          {strings.checkout.retry}
        </Button>
        <ButtonLink href="/cart" variant="secondary" className="w-full">
          {strings.checkout.backToCart}
        </ButtonLink>
      </div>
    );
  } else {
    content = <CheckoutForm menu={menuState.menu} lines={lines} />;
  }

  return (
    <>
      <TopBar title={strings.checkout.pageTitle} back={{ href: "/cart", label: strings.checkout.backLabel }} />
      <main className="flex flex-1 flex-col">{content}</main>
    </>
  );
}
