"use client";

import { QuantityStepper } from "@/components/cart/QuantityStepper";
import { useCart } from "@/context/CartContext";
import { type CartLine as CartLineData, NOTE_MAX_LENGTH } from "@/context/cartReducer";
import { formatMXN } from "@/lib/money";
import { strings } from "@/lib/strings";

interface CartLineProps {
  line: CartLineData;
}

export function CartLine({ line }: CartLineProps) {
  const { setQuantity, setNote, removeItem } = useCart();
  const noteId = `nota-${line.menuItemId}`;
  const itemLabel = strings.cart.itemLabel(line.name, line.categoryName);

  return (
    <article className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{line.categoryName}</p>
          <h2 className="text-lg font-semibold leading-snug">{line.name}</h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            {strings.cart.unitPrice(formatMXN(line.unitPriceCents))}
          </p>
        </div>
        <p className="shrink-0 text-lg font-bold tabular-nums">{formatMXN(line.unitPriceCents * line.quantity)}</p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <QuantityStepper
          itemName={itemLabel}
          quantity={line.quantity}
          onDecrease={() => setQuantity(line.menuItemId, line.quantity - 1)}
          onIncrease={() => setQuantity(line.menuItemId, line.quantity + 1)}
        />
        <button
          type="button"
          onClick={() => removeItem(line.menuItemId)}
          aria-label={strings.cart.removeLabel(itemLabel)}
          className="min-h-11 px-3 font-medium text-red-700 underline-offset-4 active:underline dark:text-red-400"
        >
          {strings.cart.remove}
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <label htmlFor={noteId} className="text-sm font-medium">
            {strings.cart.noteLabel}
          </label>
          <span className="text-xs tabular-nums text-zinc-500">
            {strings.cart.noteCounter(line.note.length, NOTE_MAX_LENGTH)}
          </span>
        </div>
        <textarea
          id={noteId}
          value={line.note}
          onChange={(event) => setNote(line.menuItemId, event.target.value)}
          maxLength={NOTE_MAX_LENGTH}
          rows={2}
          placeholder={strings.cart.notePlaceholder}
          // 16px text stops iOS Safari from zooming in when the field is focused.
          className="w-full resize-none rounded-lg border border-zinc-300 bg-transparent p-3 text-base dark:border-zinc-700"
        />
      </div>
    </article>
  );
}
