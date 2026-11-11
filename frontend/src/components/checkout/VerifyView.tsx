"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { VerifyForm } from "@/components/checkout/VerifyForm";
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

  if (placedOrderId !== null) {
    return <p className="py-12 text-center text-lg font-semibold">{strings.verify.redirecting}</p>;
  }
  if (!hasLoaded || !auth.hasLoaded || now === null || redirectTo !== null || draft === null) {
    return <p className="py-12 text-center text-zinc-600 dark:text-zinc-400">{strings.verify.loading}</p>;
  }

  const rememberedToken =
    auth.token !== null && auth.phone === draft.phone && isTokenUsable(auth.token, now) ? auth.token : null;

  return <VerifyForm draft={draft} lines={lines} rememberedToken={rememberedToken} onOrderPlaced={handleOrderPlaced} />;
}
