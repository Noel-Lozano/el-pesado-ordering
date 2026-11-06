import type { Metadata } from "next";
import { VerifyView } from "@/components/checkout/VerifyView";
import { strings } from "@/lib/strings";

export const metadata: Metadata = {
  title: `${strings.verify.pageTitle} · ${strings.app.name}`,
};

export default function VerifyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="text-3xl font-extrabold tracking-tight">{strings.verify.pageTitle}</h1>
      <VerifyView />
    </main>
  );
}
