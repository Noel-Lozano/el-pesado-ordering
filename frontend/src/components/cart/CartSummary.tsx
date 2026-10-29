import { formatMXN } from "@/lib/money";
import { strings } from "@/lib/strings";

interface CartSummaryProps {
  subtotalCents: number;
}

export function CartSummary({ subtotalCents }: CartSummaryProps) {
  return (
    <section className="flex flex-col gap-1 rounded-xl bg-zinc-100 p-4 dark:bg-zinc-900">
      <div className="flex items-baseline justify-between text-xl font-bold">
        <span>{strings.cart.subtotal}</span>
        <span className="tabular-nums">{formatMXN(subtotalCents)}</span>
      </div>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{strings.cart.totalDisclaimer}</p>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">{strings.cart.paymentNote}</p>
    </section>
  );
}
