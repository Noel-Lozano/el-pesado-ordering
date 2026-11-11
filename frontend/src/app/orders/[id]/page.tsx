import type { Metadata } from "next";
import { OrderStatusView } from "@/components/order/OrderStatusView";
import { strings } from "@/lib/strings";

export const metadata: Metadata = {
  title: `${strings.order.pageTitle} · ${strings.app.name}`,
};

export default async function OrderPage({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params;
  return <OrderStatusView orderId={id} />;
}
