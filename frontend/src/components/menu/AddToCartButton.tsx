"use client";

import Link from "next/link";
import { PlusIcon } from "@/components/ui/icons";
import { useCart } from "@/context/CartContext";
import type { MenuProduct } from "@/lib/menuGrouping";
import { strings } from "@/lib/strings";

interface AddToCartButtonProps {
  product: MenuProduct;
  isAvailable: boolean;
  // The visible "Disponible después de las 2 PM" text, when disabled.
  unavailableReasonId?: string;
}

const BUTTON_CLASSES =
  "flex h-11 w-11 items-center justify-center rounded-sm border-2 border-navy bg-orange text-navy disabled:cursor-not-allowed disabled:border-disabled disabled:bg-paper disabled:text-muted";

// The orange "+" on a menu row. A Burrito/Montada pair needs a choice first,
// so its "+" opens the item page; a plain item is added straight away.
export function AddToCartButton({ product, isAvailable, unavailableReasonId }: AddToCartButtonProps) {
  const { hasLoaded, addItem } = useCart();
  const item = product.defaultItem;

  if (product.variants.length > 0) {
    return (
      <Link href={`/item/${item.id}`} aria-label={strings.menu.chooseLabel(product.name)} className={BUTTON_CLASSES}>
        <PlusIcon />
      </Link>
    );
  }

  const itemLabel = strings.cart.itemLabel(item.name, product.categoryName);
  return (
    <button
      type="button"
      onClick={() =>
        addItem({
          menuItemId: item.id,
          name: item.name,
          categoryName: product.defaultItemCategoryName,
          unitPriceCents: item.priceCents,
        })
      }
      // Also disabled until the saved cart is read: a tap before then would
      // be overwritten when the saved cart loads.
      disabled={!hasLoaded || !isAvailable}
      aria-label={strings.cart.addLabel(itemLabel)}
      aria-describedby={isAvailable ? undefined : unavailableReasonId}
      className={BUTTON_CLASSES}
    >
      <PlusIcon />
    </button>
  );
}
