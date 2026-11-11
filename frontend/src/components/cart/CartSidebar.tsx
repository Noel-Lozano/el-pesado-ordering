"use client";

import { QuantityStepper } from "@/components/cart/QuantityStepper";
import { ButtonLink } from "@/components/ui/Button";
import { useCart } from "@/context/CartContext";
import { formatMXN } from "@/lib/money";
import { strings } from "@/lib/strings";

// Desktop-only (≥1024px) cart next to the menu, from the desktop mockup. On
// phones the floating CartBar and /cart do this job. Checkout itself stays on
// its own route (ADR-004 §1).
export function CartSidebar() {
  const { lines, hasLoaded, itemCount, subtotalCents, setQuantity } = useCart();
  const total = formatMXN(subtotalCents);

  return (
    <aside
      aria-labelledby="carrito-lateral-titulo"
      className="sticky top-4 hidden max-h-[calc(100vh-2rem)] flex-col gap-3 self-start overflow-y-auto rounded border-2 border-navy bg-white p-4 shadow-hard lg:flex"
    >
      <h2 id="carrito-lateral-titulo" className="font-display text-[22px] font-normal">
        {strings.cartSidebar.title}
      </h2>

      {hasLoaded && lines.length === 0 && <p className="font-semibold text-muted">{strings.cartSidebar.empty}</p>}

      {lines.length > 0 && (
        <>
          <ul className="flex flex-col">
            {lines.map((line) => {
              const itemLabel = strings.cart.itemLabel(line.name, line.categoryName);
              return (
                <li key={line.menuItemId} className="flex items-center gap-3 border-b-[1.5px] border-line py-3">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="font-black">{line.name}</p>
                    <p className="text-[13px] font-semibold text-muted">{line.categoryName}</p>
                    <p className="text-sm font-black tabular-nums">{formatMXN(line.unitPriceCents * line.quantity)}</p>
                  </div>
                  <QuantityStepper
                    itemName={itemLabel}
                    quantity={line.quantity}
                    onDecrease={() => setQuantity(line.menuItemId, line.quantity - 1)}
                    onIncrease={() => setQuantity(line.menuItemId, line.quantity + 1)}
                  />
                </li>
              );
            })}
          </ul>
          <div className="flex justify-between text-[15px]">
            <span className="font-semibold text-muted">{strings.cartSidebar.subtotal(itemCount)}</span>
            <span className="font-extrabold tabular-nums">{total}</span>
          </div>
          <ButtonLink href="/checkout">{strings.cartSidebar.continue(total)}</ButtonLink>
        </>
      )}
    </aside>
  );
}
