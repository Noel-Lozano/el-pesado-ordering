import { MAX_QUANTITY_PER_LINE } from "@/context/cartReducer";
import { cx } from "@/lib/cx";
import { strings } from "@/lib/strings";

interface QuantityStepperProps {
  itemName: string;
  quantity: number;
  onDecrease: () => void;
  onIncrease: () => void;
  // − is disabled at `min`. The cart passes 0, so − at 1 still fires and the
  // cart asks before removing the line; the item detail screen passes 1.
  min?: number;
  max?: number;
  size?: "md" | "lg";
}

// − / quantity / + with 44px tap targets, for one-handed use on a phone.
export function QuantityStepper({
  itemName,
  quantity,
  onDecrease,
  onIncrease,
  min = 0,
  max = MAX_QUANTITY_PER_LINE,
  size = "md",
}: QuantityStepperProps) {
  const buttonClasses = cx(
    "flex w-11 items-center justify-center rounded-sm text-xl font-black leading-none",
    "disabled:cursor-not-allowed disabled:opacity-40",
    size === "lg" ? "h-11" : "h-[42px]",
  );

  return (
    <div
      className={cx(
        "flex shrink-0 items-center gap-1 rounded-sm border-2 border-navy px-0.5",
        size === "lg" ? "h-[54px]" : "h-[50px]",
      )}
    >
      <button
        type="button"
        onClick={onDecrease}
        disabled={quantity <= min}
        aria-label={strings.cart.decreaseLabel(itemName)}
        className={cx(buttonClasses, "bg-paper text-navy")}
      >
        −
      </button>
      <span
        aria-live="polite"
        aria-label={strings.cart.quantityLabel(itemName, quantity)}
        className="min-w-6 text-center text-base font-black tabular-nums"
      >
        {quantity}
      </span>
      <button
        type="button"
        onClick={onIncrease}
        disabled={quantity >= max}
        aria-label={strings.cart.increaseLabel(itemName)}
        className={cx(buttonClasses, "bg-navy text-yellow")}
      >
        +
      </button>
    </div>
  );
}
