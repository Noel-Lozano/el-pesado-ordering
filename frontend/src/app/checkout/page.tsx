import type { Metadata } from "next";
import { CheckoutView } from "@/components/checkout/CheckoutView";
import { strings } from "@/lib/strings";

export const metadata: Metadata = {
  title: `${strings.checkout.pageTitle} · ${strings.app.name}`,
};

export default function CheckoutPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="text-3xl font-extrabold tracking-tight">{strings.checkout.pageTitle}</h1>
      <CheckoutView />
    </main>
  );
}
