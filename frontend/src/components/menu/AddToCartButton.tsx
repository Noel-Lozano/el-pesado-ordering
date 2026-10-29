"use client";

import { QuantityStepper } from "@/components/cart/QuantityStepper";
import { useCart } from "@/context/CartContext";
import { strings } from "@/lib/strings";
import type { MenuItem } from "@/types/menu";

interface AddToCartButtonProps {
  item: MenuItem;
  categoryName: string;
}

// Shows "Agregar" until the item is in the cart, then becomes a stepper so
// quantity can be changed without leaving the menu.
export function AddToCartButton({ item, categoryName }: AddToCartButtonProps) {
  const { lines, addItem, setQuantity } = useCart();
  const line = lines.find((cartLine) => cartLine.menuItemId === item.id);
  const itemLabel = strings.cart.itemLabel(item.name, categoryName);

  const add = () =>
    addItem({ menuItemId: item.id, name: item.name, categoryName, unitPriceCents: item.priceCents });

  if (!line) {
    return (
      <button
        type="button"
        onClick={add}
        aria-label={strings.cart.addLabel(itemLabel)}
        className="min-h-11 rounded-full bg-red-700 px-5 font-semibold text-white active:bg-red-800"
      >
        {strings.cart.add}
      </button>
    );
  }

  return (
    <QuantityStepper
      itemName={itemLabel}
      quantity={line.quantity}
      onDecrease={() => setQuantity(item.id, line.quantity - 1)}
      onIncrease={add}
    />
  );
}
