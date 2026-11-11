"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { CartSidebar } from "@/components/cart/CartSidebar";
import { QuantityStepper } from "@/components/cart/QuantityStepper";
import { MenuImage } from "@/components/menu/MenuImage";
import { Badge } from "@/components/ui/Badge";
import { BottomActionBar } from "@/components/ui/BottomActionBar";
import { Button } from "@/components/ui/Button";
import { BackIcon } from "@/components/ui/icons";
import { RadioCard } from "@/components/ui/RadioCard";
import { NOTE_MAX_LENGTH, willReplaceNote } from "@/context/cartReducer";
import { useCart } from "@/context/CartContext";
import { useNow } from "@/hooks/useNow";
import { isAvailableNow } from "@/lib/availability";
import { setFlashNotice } from "@/lib/flashNotice";
import type { MenuProduct } from "@/lib/menuGrouping";
import { formatMXN } from "@/lib/money";
import { strings } from "@/lib/strings";

interface ItemDetailProps {
  product: MenuProduct;
  // The variant the URL pointed at, preselected so the required choice is
  // never empty.
  initialItemId: number;
  timezone: string;
}

const FORM_ID = "agregar-producto";

// Screen 02 · Detalle del producto.
export function ItemDetail({ product, initialItemId, timezone }: ItemDetailProps) {
  const router = useRouter();
  const { lines, hasLoaded, addItem } = useCart();
  const now = useNow();
  const [selectedItemId, setSelectedItemId] = useState(initialItemId);
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");

  const selectedVariant = product.variants.find((variant) => variant.item.id === selectedItemId);
  const selectedItem = selectedVariant?.item ?? product.defaultItem;
  const selectedCategoryName = selectedVariant?.categoryName ?? product.defaultItemCategoryName;
  const isAvailable = isAvailableNow(selectedItem.availableFrom, now, timezone);
  const totalCents = selectedItem.priceCents * quantity;
  const reasonId = "motivo-no-disponible";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasLoaded || !isAvailable) return;

    if (willReplaceNote(lines, selectedItem.id, note)) {
      setFlashNotice(strings.item.noteReplaced(product.name));
    } else {
      setFlashNotice(strings.item.added(quantity, product.name));
    }
    addItem(
      {
        menuItemId: selectedItem.id,
        name: selectedItem.name,
        categoryName: selectedCategoryName,
        unitPriceCents: selectedItem.priceCents,
      },
      { quantity, note },
    );
    router.push("/");
  }

  return (
    <div className="flex flex-1 flex-col lg:mx-auto lg:grid lg:w-full lg:max-w-[1200px] lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-8 lg:px-4 lg:py-6">
      <div className="flex flex-1 flex-col">
        <div className="relative">
          <MenuImage item={selectedItem} categoryName={selectedCategoryName} size="hero" className="lg:rounded lg:border-2" />
          <Link
            href="/"
            aria-label={strings.item.backLabel}
            className="absolute left-4 top-[calc(env(safe-area-inset-top)+12px)] flex h-11 w-11 items-center justify-center rounded-sm border-2 border-navy bg-white text-navy"
          >
            <BackIcon />
          </Link>
        </div>

        <main className="flex flex-col gap-3.5 px-4 pb-6 pt-[22px] lg:px-0">
          <form id={FORM_ID} onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            <div className="flex items-center justify-between gap-3">
              <h1 className="font-display text-[32px] font-normal leading-tight">{product.name}</h1>
              <span className="text-[22px] font-black tabular-nums">{formatMXN(selectedItem.priceCents)}</span>
            </div>
            {selectedItem.availableFrom && (
              <Badge tone="red" className="self-start">
                {strings.menu.fromBadge(selectedItem.availableFrom)}
              </Badge>
            )}
            {selectedItem.description && (
              <p className="text-base leading-normal text-muted">{selectedItem.description}</p>
            )}

            {product.variants.length > 0 && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 w-full">
                  <span className="flex items-center justify-between">
                    <span className="text-base font-black">{strings.item.chooseLegend}</span>
                    <Badge tone="red">{strings.item.required}</Badge>
                  </span>
                </legend>
                {product.variants.map((variant) => (
                  <RadioCard
                    key={variant.item.id}
                    name="variante"
                    value={String(variant.item.id)}
                    isChecked={variant.item.id === selectedItem.id}
                    isRequired
                    onChange={(value) => setSelectedItemId(Number(value))}
                    trailing={
                      <span className="text-[15px] font-bold text-muted tabular-nums">
                        {formatMXN(variant.item.priceCents)}
                      </span>
                    }
                  >
                    {strings.item.variant[variant.kind]}
                  </RadioCard>
                ))}
              </fieldset>
            )}

            <label className="flex flex-col gap-2 text-base font-black">
              {strings.item.notesLabel}
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={NOTE_MAX_LENGTH}
                rows={2}
                placeholder={strings.item.notesPlaceholder}
                aria-describedby="contador-instrucciones"
                className="h-[72px] resize-none rounded border-[1.5px] border-navy bg-white px-3.5 py-3 font-normal text-navy placeholder:text-muted"
              />
              <span id="contador-instrucciones" className="self-end text-xs font-bold text-muted">
                {strings.cart.noteCounter(note.length, NOTE_MAX_LENGTH)}
              </span>
            </label>

            {!isAvailable && selectedItem.availableFrom && now !== null && (
              <p id={reasonId} className="font-bold">
                {strings.menu.availableFrom(selectedItem.availableFrom)}
              </p>
            )}
          </form>
        </main>

        <BottomActionBar>
          <div className="flex items-center gap-3">
            <QuantityStepper
              itemName={product.name}
              quantity={quantity}
              min={1}
              size="lg"
              onDecrease={() => setQuantity((current) => Math.max(1, current - 1))}
              onIncrease={() => setQuantity((current) => current + 1)}
            />
            <Button
              type="submit"
              form={FORM_ID}
              disabled={!hasLoaded || !isAvailable}
              aria-describedby={isAvailable ? undefined : reasonId}
              className="flex-1"
            >
              {strings.item.add(formatMXN(totalCents))}
            </Button>
          </div>
        </BottomActionBar>
      </div>

      <CartSidebar />
    </div>
  );
}
