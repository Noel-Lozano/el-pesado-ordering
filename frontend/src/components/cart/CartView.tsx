"use client";

import { useEffect, useMemo, useState } from "react";
import { CartLine } from "@/components/cart/CartLine";
import { CartSummary } from "@/components/cart/CartSummary";
import { PickupCard } from "@/components/cart/PickupCard";
import { BottomActionBar } from "@/components/ui/BottomActionBar";
import { ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { TopBar } from "@/components/ui/TopBar";
import { useCart, useCartReconcile } from "@/context/CartContext";
import { getMenu } from "@/lib/api";
import { loadCheckoutDraft } from "@/lib/checkoutDraft";
import { listMenuItems } from "@/lib/menuGrouping";
import { formatMXN } from "@/lib/money";
import type { Pickup } from "@/lib/pickup";
import { describePickup } from "@/lib/pickupLabel";
import { strings } from "@/lib/strings";
import type { MenuResponse } from "@/types/menu";

const ASAP: Pickup = { kind: "asap" };

// Screen 03 · Tu pedido.
export function CartView() {
  const { lines, hasLoaded, itemCount, subtotalCents } = useCart();
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [pendingRemovalId, setPendingRemovalId] = useState<number | null>(null);
  const [isNoticeDismissed, setIsNoticeDismissed] = useState(false);
  const droppedNames = useCartReconcile(menu?.categories ?? null);

  // The menu is only needed to re-validate the cart and for photos, so a
  // failure here is silent: the cart still works, and checkout re-checks.
  useEffect(() => {
    let isCurrent = true;
    getMenu()
      .then((loaded) => {
        if (isCurrent) setMenu(loaded);
      })
      .catch(() => undefined);
    return () => {
      isCurrent = false;
    };
  }, []);

  const imageUrlById = useMemo(
    () => new Map((menu ? listMenuItems(menu.categories) : []).map(({ item }) => [item.id, item.imageUrl])),
    [menu],
  );
  // Read after the cart has loaded, i.e. on the client after mount.
  const pickup = hasLoaded ? (loadCheckoutDraft()?.pickup ?? ASAP) : ASAP;
  const pickupLabel = menu ? describePickup(pickup, menu.shop.timezone) : strings.order.pickupAsap;
  const total = formatMXN(subtotalCents);

  return (
    <>
      <TopBar title={strings.cart.pageTitle} back={{ href: "/", label: strings.cart.backLabel }} />

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-4 px-4 pb-6 pt-5">
        {droppedNames.length > 0 && !isNoticeDismissed && (
          <Notice onDismiss={() => setIsNoticeDismissed(true)}>{strings.menu.droppedNotice(droppedNames)}</Notice>
        )}

        {!hasLoaded && (
          <p role="status" className="py-12 text-center font-bold text-muted">
            {strings.cart.loading}
          </p>
        )}

        {hasLoaded && lines.length === 0 && (
          <section className="flex flex-col items-center gap-4 py-12 text-center">
            <h2 className="font-display text-2xl font-normal">{strings.cart.emptyTitle}</h2>
            <p className="font-semibold text-muted">{strings.cart.emptyBody}</p>
            <ButtonLink href="/" className="w-full">
              {strings.cart.seeMenu}
            </ButtonLink>
          </section>
        )}

        {hasLoaded && lines.length > 0 && (
          <>
            <PickupCard pickupLabel={pickupLabel} />
            <ul className="divide-y-[1.5px] divide-line rounded border-2 border-navy px-3.5">
              {lines.map((line) => (
                <li key={line.menuItemId}>
                  <CartLine
                    line={line}
                    imageUrl={imageUrlById.get(line.menuItemId) ?? null}
                    isConfirmingRemoval={pendingRemovalId === line.menuItemId}
                    onRequestRemoval={() => setPendingRemovalId(line.menuItemId)}
                    onCancelRemoval={() => setPendingRemovalId(null)}
                  />
                </li>
              ))}
            </ul>
            <CartSummary itemCount={itemCount} subtotalCents={subtotalCents} />
          </>
        )}
      </main>

      {hasLoaded && lines.length > 0 && (
        <BottomActionBar>
          <ButtonLink href="/checkout">{strings.cart.continue(total)}</ButtonLink>
        </BottomActionBar>
      )}
    </>
  );
}
