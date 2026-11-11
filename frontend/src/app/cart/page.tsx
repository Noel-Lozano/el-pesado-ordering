import type { Metadata } from "next";
import { CartView } from "@/components/cart/CartView";
import { strings } from "@/lib/strings";

export const metadata: Metadata = {
  title: `${strings.cart.pageTitle} · ${strings.app.name}`,
};

export default function CartPage() {
  return <CartView />;
}
