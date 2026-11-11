"use client";

import { QuantityStepper } from "@/components/cart/QuantityStepper";
import { MenuImage } from "@/components/menu/MenuImage";
import { Button } from "@/components/ui/Button";
import { useCart } from "@/context/CartContext";
import { type CartLine as CartLineData, NOTE_MAX_LENGTH } from "@/context/cartReducer";
import { formatMXN } from "@/lib/money";
import { strings } from "@/lib/strings";

interface CartLineProps {
  line: CartLineData;
  imageUrl: string | null;
  // − at quantity 1 asks first instead of removing straight away.
  isConfirmingRemoval: boolean;
  onRequestRemoval: () => void;
  onCancelRemoval: () => void;
}

// "Burrito · sin cebolla": the variant (for Burrito/Montada pairs, whose
// names are identical) or category, then the note.
function lineMeta(line: CartLineData): string {
  const variantOrCategory = strings.cart.variantByCategory[line.categoryName] ?? line.categoryName;
  return [variantOrCategory, line.note].filter(Boolean).join(" · ");
}

// One row of mockup 03: thumbnail, name, meta, line total and stepper, with
// the note editable behind a disclosure.
export function CartLine({ line, imageUrl, isConfirmingRemoval, onRequestRemoval, onCancelRemoval }: CartLineProps) {
  const { setQuantity, setNote, removeItem } = useCart();
  const noteId = `nota-${line.menuItemId}`;
  const itemLabel = strings.cart.itemLabel(line.name, line.categoryName);

  const decrease = () => {
    if (line.quantity <= 1) {
      onRequestRemoval();
    } else {
      setQuantity(line.menuItemId, line.quantity - 1);
    }
  };

  return (
    <article className="flex flex-col gap-2 py-3.5">
      <div className="flex items-center gap-3">
        <MenuImage item={{ name: line.name, imageUrl }} categoryName={line.categoryName} size="thumb" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="text-[15px] font-black">{line.name}</h2>
          <p className="break-words text-[13px] font-semibold text-muted">{lineMeta(line)}</p>
          <p className="text-sm font-black tabular-nums">{formatMXN(line.unitPriceCents * line.quantity)}</p>
        </div>
        <QuantityStepper
          itemName={itemLabel}
          quantity={line.quantity}
          onDecrease={decrease}
          onIncrease={() => setQuantity(line.menuItemId, line.quantity + 1)}
        />
      </div>

      {isConfirmingRemoval && (
        <div role="alert" className="flex flex-col gap-2 rounded border-2 border-navy bg-paper p-3">
          <p className="font-bold">{strings.cart.confirmRemove(line.name)}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={onCancelRemoval}>
              {strings.cart.keep}
            </Button>
            <Button onClick={() => removeItem(line.menuItemId)} aria-label={strings.cart.removeLabel(itemLabel)}>
              {strings.cart.remove}
            </Button>
          </div>
        </div>
      )}

      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center text-sm font-extrabold underline underline-offset-4">
          {line.note ? strings.cart.editNote : strings.cart.addNote}
        </summary>
        <div className="flex flex-col gap-1 pb-1">
          <label htmlFor={noteId} className="sr-only">
            {strings.cart.noteLabel}
          </label>
          <textarea
            id={noteId}
            value={line.note}
            onChange={(event) => setNote(line.menuItemId, event.target.value)}
            maxLength={NOTE_MAX_LENGTH}
            rows={2}
            placeholder={strings.item.notesPlaceholder}
            aria-describedby={`${noteId}-contador`}
            className="w-full resize-none rounded border-[1.5px] border-navy bg-white px-3.5 py-3 text-navy placeholder:text-muted"
          />
          <span id={`${noteId}-contador`} className="self-end text-xs font-bold text-muted">
            {strings.cart.noteCounter(line.note.length, NOTE_MAX_LENGTH)}
          </span>
        </div>
      </details>
    </article>
  );
}
