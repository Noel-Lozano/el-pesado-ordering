"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { VerifyForm } from "@/components/checkout/VerifyForm";
import { useCart } from "@/context/CartContext";
import { clearCheckoutDraft, loadCheckoutDraft } from "@/lib/checkoutDraft";
import { strings } from "@/lib/strings";
import type { Order } from "@/types/order";

// Gate for /checkout/verify. Needs the saved cart and the checkout draft; once
// an order is placed it stops redirecting, so clearing the cart doesn't bounce
// the customer to /cart while navigating to their order.
export function VerifyView() {
  const router = useRouter();
  const { lines, hasLoaded, clearCart } = useCart();
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
    clearCheckoutDraft();
    clearCart();
    // replace, not push: "back" from the order page must not return here and resubmit.
    router.replace(`/orders/${order.id}`);
  }

  if (placedOrderId !== null) {
    return <p className="py-12 text-center text-lg font-semibold">{strings.verify.redirecting}</p>;
  }
  if (!hasLoaded || redirectTo !== null || draft === null) {
    return <p className="py-12 text-center text-zinc-600 dark:text-zinc-400">{strings.verify.loading}</p>;
  }

  return <VerifyForm draft={draft} lines={lines} onOrderPlaced={handleOrderPlaced} />;
}
