"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { VerifyForm } from "@/components/checkout/VerifyForm";
import { TopBar } from "@/components/ui/TopBar";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";
import { useNow } from "@/hooks/useNow";
import { clearCheckoutDraft, loadCheckoutDraft } from "@/lib/checkoutDraft";
import { isTokenUsable } from "@/lib/jwt";
import { saveLastOrderId } from "@/lib/lastOrder";
import { strings } from "@/lib/strings";
import type { Order } from "@/types/order";

// Gate for /checkout/verify. Needs the saved cart and the checkout draft; once
// an order is placed it stops redirecting, so clearing the cart doesn't bounce
// the customer to /cart while navigating to their order.
export function VerifyView() {
  const router = useRouter();
  const { lines, hasLoaded, clearCart } = useCart();
  const auth = useAuth();
  const now = useNow();
  const [placedOrderId, setPlacedOrderId] = useState<number | null>(null);
  // Read once the cart has loaded, i.e. on the client after mount.
  const draft = hasLoaded ? loadCheckoutDraft() : null;

  const redirectTo =
    !hasLoaded || placedOrderId !== null ? null : lines.length === 0 ? "/cart" : draft === null ? "/checkout" : null;

  useEffect(() => {
    if (redirectTo) {
      router.replace(redirectTo);
    }
  }, [redirectTo, router]);

  function handleOrderPlaced(order: Order) {
    setPlacedOrderId(order.id);
    // So the Pedidos tab can reopen it.
    saveLastOrderId(order.id);
    clearCheckoutDraft();
    clearCart();
    // replace, not push: "back" from the order page must not return here and resubmit.
    router.replace(`/orders/${order.id}`);
  }

  let content;
  if (placedOrderId !== null) {
    content = (
      <p role="status" className="py-12 text-center text-lg font-black">
        {strings.verify.redirecting}
      </p>
    );
  } else if (!hasLoaded || !auth.hasLoaded || now === null || redirectTo !== null || draft === null) {
    content = (
      <p role="status" className="py-12 text-center font-bold text-muted">
        {strings.verify.loading}
      </p>
    );
  } else {
    const rememberedToken =
      auth.token !== null && auth.phone === draft.phone && isTokenUsable(auth.token, now) ? auth.token : null;
    content = (
      <VerifyForm draft={draft} lines={lines} rememberedToken={rememberedToken} onOrderPlaced={handleOrderPlaced} />
    );
  }

  return (
    <>
      <TopBar title={strings.verify.pageTitle} back={{ href: "/checkout", label: strings.verify.backLabel }} />
      <main className="flex flex-1 flex-col">{content}</main>
    </>
  );
}
