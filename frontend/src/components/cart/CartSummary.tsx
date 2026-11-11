import { CashIcon } from "@/components/ui/icons";
import { formatMXN } from "@/lib/money";
import { strings } from "@/lib/strings";

interface CartSummaryProps {
  itemCount: number;
  subtotalCents: number;
}

// Subtotal / Total in MXN and the cash-on-pickup note (mockup 03). The total
// is display-only: the server recomputes it from menu prices (ADR-004 §4).
export function CartSummary({ itemCount, subtotalCents }: CartSummaryProps) {
  const total = formatMXN(subtotalCents);
  return (
    <>
      <section className="flex flex-col gap-2.5 rounded border-2 border-navy p-3.5">
        <div className="flex justify-between text-[15px]">
          <span className="font-semibold text-muted">{strings.cart.subtotalCount(itemCount)}</span>
          <span className="font-extrabold tabular-nums">{total}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="font-display text-[22px]">{strings.cart.total}</span>
          <span className="font-display text-2xl tabular-nums">{strings.cart.totalWithCurrency(total)}</span>
        </div>
        <p className="text-xs font-semibold text-muted">{strings.cart.totalDisclaimer}</p>
      </section>

      <div className="flex items-center gap-2.5 rounded border-[1.5px] border-dashed border-navy bg-paper px-3.5 py-3">
        <CashIcon />
        <p className="text-sm font-bold">{strings.cart.payCashNote}</p>
      </div>
    </>
  );
}
