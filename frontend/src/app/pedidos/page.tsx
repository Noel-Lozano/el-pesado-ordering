import type { Metadata } from "next";
import { OrdersTabView } from "@/components/account/OrdersTabView";
import { strings } from "@/lib/strings";

export const metadata: Metadata = {
  title: `${strings.ordersTab.pageTitle} · ${strings.app.name}`,
};

export default function OrdersTabPage() {
  return <OrdersTabView />;
}
