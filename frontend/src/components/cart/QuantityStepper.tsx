import { MAX_QUANTITY_PER_LINE } from "@/context/cartReducer";
import { strings } from "@/lib/strings";

interface QuantityStepperProps {
  itemName: string;
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
}

// − / quantity / + with 44px tap targets, for one-handed use on a phone.
export function QuantityStepper({ itemName, quantity, onDecrease, onIncrease }: QuantityStepperProps) {
  const buttonClass =
    "flex h-11 w-11 items-center justify-center rounded-full text-2xl font-bold leading-none disabled:opacity-40";

  return (
    <div className="flex items-center rounded-full border border-zinc-300 dark:border-zinc-700">
      <button
        type="button"
        onClick={onDecrease}
        aria-label={strings.cart.decreaseLabel(itemName)}
        className={buttonClass}
      >
        −
      </button>
      <span
        aria-live="polite"
        aria-label={strings.cart.quantityLabel(itemName, quantity)}
        className="min-w-8 text-center text-lg font-semibold tabular-nums"
      >
        {quantity}
      </span>
      <button
        type="button"
        onClick={onIncrease}
        disabled={quantity >= MAX_QUANTITY_PER_LINE}
        aria-label={strings.cart.increaseLabel(itemName)}
        className={buttonClass}
      >
        +
      </button>
    </div>
  );
}
