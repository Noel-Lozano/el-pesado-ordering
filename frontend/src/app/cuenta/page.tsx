import type { Metadata } from "next";
import { AccountView } from "@/components/account/AccountView";
import { strings } from "@/lib/strings";

export const metadata: Metadata = {
  title: `${strings.account.pageTitle} · ${strings.app.name}`,
};

export default function AccountPage() {
  return <AccountView />;
}
