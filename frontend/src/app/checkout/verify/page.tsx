import type { Metadata } from "next";
import { VerifyView } from "@/components/checkout/VerifyView";
import { strings } from "@/lib/strings";

export const metadata: Metadata = {
  title: `${strings.verify.pageTitle} · ${strings.app.name}`,
};

export default function VerifyPage() {
  return <VerifyView />;
}
