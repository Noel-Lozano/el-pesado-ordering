import type { Metadata } from "next";
import { CheckoutView } from "@/components/checkout/CheckoutView";
import { strings } from "@/lib/strings";

export const metadata: Metadata = {
  title: `${strings.checkout.pageTitle} · ${strings.app.name}`,
};

export default function CheckoutPage() {
  return <CheckoutView />;
}
