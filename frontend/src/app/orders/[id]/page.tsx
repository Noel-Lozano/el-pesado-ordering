import type { Metadata } from "next";
import { OrderStatusView } from "@/components/order/OrderStatusView";
import { strings } from "@/lib/strings";

export const metadata: Metadata = {
  title: `${strings.order.pageTitle} · ${strings.app.name}`,
};

export default async function OrderPage({ params }: PageProps<"/orders/[id]">) {
  const { id } = await params;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="text-3xl font-extrabold tracking-tight">{strings.order.pageTitle}</h1>
      <OrderStatusView orderId={id} />
    </main>
  );
}
