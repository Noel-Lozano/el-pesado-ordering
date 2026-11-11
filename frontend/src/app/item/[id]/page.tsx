import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ItemDetail } from "@/components/menu/ItemDetail";
import { getMenu } from "@/lib/api";
import { findProductByItemId, groupMenuItems, type ProductSelection } from "@/lib/menuGrouping";
import { strings } from "@/lib/strings";

// Same data and cache as the menu page (ISR, ADR-002 decision 3).
export const revalidate = 60;

function parseItemId(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function loadSelection(rawId: string): Promise<{ selection: ProductSelection; timezone: string } | null> {
  const itemId = parseItemId(rawId);
  if (itemId === null) return null;
  const menu = await getMenu();
  const selection = findProductByItemId(groupMenuItems(menu.categories), itemId);
  return selection ? { selection, timezone: menu.shop.timezone } : null;
}

export async function generateMetadata({ params }: PageProps<"/item/[id]">): Promise<Metadata> {
  const { id } = await params;
  const loaded = await loadSelection(id);
  return { title: loaded ? `${loaded.selection.product.name} · ${strings.app.name}` : strings.app.name };
}

export default async function ItemPage({ params }: PageProps<"/item/[id]">) {
  const { id } = await params;
  const loaded = await loadSelection(id);
  if (!loaded) {
    notFound();
  }

  const { selection, timezone } = loaded;
  return (
    <ItemDetail
      // Remount (fresh qty/notes) when navigating between items.
      key={selection.selectedItem.id}
      product={selection.product}
      initialItemId={selection.selectedItem.id}
      timezone={timezone}
    />
  );
}
