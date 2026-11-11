"use client";

import { useEffect, useMemo, useState } from "react";
import { CartBar } from "@/components/cart/CartBar";
import { CartSidebar } from "@/components/cart/CartSidebar";
import { AfterTwoPmBanner } from "@/components/menu/AfterTwoPmBanner";
import { MenuHeader } from "@/components/menu/MenuHeader";
import { MenuItemRow } from "@/components/menu/MenuItemRow";
import { Chip } from "@/components/ui/Chip";
import { Notice } from "@/components/ui/Notice";
import { TabBar } from "@/components/ui/TabBar";
import { useCart, useCartReconcile } from "@/context/CartContext";
import { useNow } from "@/hooks/useNow";
import { isAvailableNow } from "@/lib/availability";
import { consumeFlashNotice } from "@/lib/flashNotice";
import { MENU_CATEGORY } from "@/lib/menuCategories";
import { groupMenuItems, type MenuProduct } from "@/lib/menuGrouping";
import { searchProducts } from "@/lib/menuSearch";
import { describeNextOpening } from "@/lib/nextOpening";
import { getNextOpening, isShopOpen } from "@/lib/pickup";
import { strings } from "@/lib/strings";
import type { MenuResponse } from "@/types/menu";

// Screen 01 · Menú. The menu arrives from the server (ISR); search, chips and
// time gating run on the client.
export function MenuScreen({ menu }: { menu: MenuResponse }) {
  const sections = useMemo(() => groupMenuItems(menu.categories), [menu.categories]);
  const [activeCategory, setActiveCategory] = useState(sections[0]?.name ?? "");
  const [query, setQuery] = useState("");
  const [isNoticeDismissed, setIsNoticeDismissed] = useState(false);
  const [flashNotice, setFlashNotice] = useState<string | null>(null);
  const droppedNames = useCartReconcile(menu.categories);
  const { lines } = useCart();
  const now = useNow();

  const isSearching = query.trim() !== "";
  const activeSection = sections.find((section) => section.name === activeCategory) ?? sections[0];
  const products = isSearching ? searchProducts(sections, query) : (activeSection?.products ?? []);
  const hasAfterTwoPm = sections.some((section) => section.name === MENU_CATEGORY.afterTwoPm);
  const showAfterTwoPmBanner = !isSearching && hasAfterTwoPm && activeCategory !== MENU_CATEGORY.afterTwoPm;
  const isClosed = now !== null && !isShopOpen(now, menu.shop);
  const nextOpening = isClosed ? getNextOpening(now, menu.shop) : null;

  // A message left by the item page ("Agregaste 2 × Asado…"), shown once.
  useEffect(() => {
    const message = consumeFlashNotice();
    if (message !== null) {
      // Reads a one-shot value set before navigation; only available on mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFlashNotice(message);
    }
  }, []);

  const quantityInCart = (product: MenuProduct): number => {
    const ids = new Set([product.defaultItem.id, ...product.variants.map((variant) => variant.item.id)]);
    return lines.reduce((sum, line) => (ids.has(line.menuItemId) ? sum + line.quantity : sum), 0);
  };

  return (
    <>
      <MenuHeader query={query} onQueryChange={setQuery} />

      <div className="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-6 pt-4 lg:grid lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-8">
        <main className="flex flex-col gap-5">
          {flashNotice && <Notice onDismiss={() => setFlashNotice(null)}>{flashNotice}</Notice>}
          {isClosed && (
            <Notice tone="warning">
              <p>{strings.checkout.closedTitle}</p>
              {nextOpening && <p className="font-semibold">{describeNextOpening(nextOpening)}</p>}
            </Notice>
          )}
          {droppedNames.length > 0 && !isNoticeDismissed && (
            <Notice onDismiss={() => setIsNoticeDismissed(true)}>{strings.menu.droppedNotice(droppedNames)}</Notice>
          )}

          {sections.length === 0 ? (
            <p className="py-12 text-center text-lg font-bold">{strings.menu.empty}</p>
          ) : (
            <>
              {!isSearching && (
                <div
                  role="group"
                  aria-label={strings.menu.categoriesLabel}
                  className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1"
                >
                  {sections.map((section) => (
                    <Chip
                      key={section.name}
                      label={section.name}
                      isPressed={section.name === activeSection?.name}
                      onClick={() => setActiveCategory(section.name)}
                    />
                  ))}
                </div>
              )}

              {showAfterTwoPmBanner && (
                <AfterTwoPmBanner onSelect={() => setActiveCategory(MENU_CATEGORY.afterTwoPm)} />
              )}

              <section aria-labelledby="menu-lista-titulo">
                <div className="flex items-center justify-between">
                  <h2 id="menu-lista-titulo" className="font-display text-[22px] font-normal">
                    {isSearching ? strings.menu.searchResultsTitle : activeSection?.name}
                  </h2>
                  <span className="text-[13px] font-bold text-muted" aria-live="polite">
                    {strings.menu.optionsCount(products.length)}
                  </span>
                </div>

                {products.length === 0 ? (
                  <p className="py-10 text-center font-bold">{strings.menu.noResults(query.trim())}</p>
                ) : (
                  <ul className="lg:mt-4 lg:grid lg:grid-cols-[repeat(auto-fill,minmax(250px,1fr))] lg:gap-4">
                    {products.map((product) => (
                      <li key={product.key}>
                        <MenuItemRow
                          product={product}
                          isAvailable={isAvailableNow(product.defaultItem.availableFrom, now, menu.shop.timezone)}
                          quantityInCart={quantityInCart(product)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </main>
        <CartSidebar />
      </div>

      <div className="sticky bottom-0 z-30">
        <CartBar />
        <TabBar activeTab="menu" />
      </div>
    </>
  );
}
