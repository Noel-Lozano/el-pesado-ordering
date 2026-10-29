import type { Metadata } from "next";
import { CartView } from "@/components/cart/CartView";
import { strings } from "@/lib/strings";

export const metadata: Metadata = {
  title: `${strings.cart.pageTitle} · ${strings.app.name}`,
};

export default function CartPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="text-3xl font-extrabold tracking-tight">{strings.cart.pageTitle}</h1>
      <CartView />
    </main>
  );
}
