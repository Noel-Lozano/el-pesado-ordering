import Link from "next/link";
import { AddToCartButton } from "@/components/menu/AddToCartButton";
import { MenuImage } from "@/components/menu/MenuImage";
import { Badge } from "@/components/ui/Badge";
import type { MenuProduct } from "@/lib/menuGrouping";
import { formatMXN } from "@/lib/money";
import { strings } from "@/lib/strings";

interface MenuItemRowProps {
  product: MenuProduct;
  isAvailable: boolean;
  quantityInCart: number;
}

// One menu entry (mockup 01): name, description, price, image slot and "+".
// The whole row opens the item page (the name link is stretched over it); the
// "+" sits above that link. On desktop rows become bordered cards in a grid.
export function MenuItemRow({ product, isAvailable, quantityInCart }: MenuItemRowProps) {
  const item = product.defaultItem;
  const reasonId = `no-disponible-${product.key}`;

  return (
    <article className="relative flex h-full gap-3.5 border-b-[1.5px] border-line py-4 lg:rounded lg:border-2 lg:border-navy lg:p-4">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <h3 className="font-display text-[19px] font-normal leading-tight">
          <Link href={`/item/${item.id}`} className="after:absolute after:inset-0 after:content-['']">
            {product.name}
          </Link>
        </h3>
        {item.availableFrom && (
          <Badge tone="red" className="self-start">
            {strings.menu.fromBadge(item.availableFrom)}
          </Badge>
        )}
        {item.description && <p className="text-sm leading-snug text-muted">{item.description}</p>}
        <p className="text-base font-black tabular-nums">{formatMXN(item.priceCents)}</p>
        {quantityInCart > 0 && <p className="text-[13px] font-extrabold">{strings.menu.inCart(quantityInCart)}</p>}
        {!isAvailable && item.availableFrom && (
          <p id={reasonId} className="text-[13px] font-bold text-muted">
            {strings.menu.availableFrom(item.availableFrom)}
          </p>
        )}
      </div>

      <div className="relative h-24 w-24 shrink-0">
        <MenuImage item={item} categoryName={product.defaultItemCategoryName} size="row" />
        <div className="absolute -bottom-1.5 -right-1.5 z-10">
          <AddToCartButton product={product} isAvailable={isAvailable} unavailableReasonId={reasonId} />
        </div>
      </div>
    </article>
  );
}
