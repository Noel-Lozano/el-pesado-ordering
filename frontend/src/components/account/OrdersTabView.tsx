"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ButtonLink } from "@/components/ui/Button";
import { ReceiptIcon } from "@/components/ui/icons";
import { TabBar } from "@/components/ui/TabBar";
import { TopBar } from "@/components/ui/TopBar";
import { loadLastOrderId } from "@/lib/lastOrder";
import { strings } from "@/lib/strings";

// Pedidos tab. There's no "my orders" endpoint yet (ADR-004 Gaps; see
// listMyOrders in lib/api.ts), so it opens the last order placed on this
// device, or shows an empty state.
export function OrdersTabView() {
  const router = useRouter();
  const [hasNoOrder, setHasNoOrder] = useState(false);

  useEffect(() => {
    const lastOrderId = loadLastOrderId();
    if (lastOrderId === null) {
      // Storage is only readable after mount (hydration), hence the effect.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHasNoOrder(true);
    } else {
      router.replace(`/orders/${lastOrderId}`);
    }
  }, [router]);

  return (
    <>
      <TopBar title={strings.ordersTab.pageTitle} />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-10 text-center">
        {hasNoOrder ? (
          <>
            <span
              aria-hidden
              className="flex h-16 w-16 items-center justify-center rounded border-2 border-navy bg-yellow"
            >
              <ReceiptIcon size={32} />
            </span>
            <h2 className="font-display text-2xl font-normal">{strings.ordersTab.emptyTitle}</h2>
            <p className="font-semibold text-muted">{strings.ordersTab.emptyBody}</p>
            <ButtonLink href="/" className="w-full">
              {strings.ordersTab.seeMenu}
            </ButtonLink>
          </>
        ) : (
          <p role="status" className="font-bold">
            {strings.ordersTab.opening}
          </p>
        )}
      </main>
      <TabBar activeTab="orders" />
    </>
  );
}
