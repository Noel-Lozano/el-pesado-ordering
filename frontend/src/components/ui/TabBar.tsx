import Link from "next/link";
import type { ReactNode } from "react";
import { MenuIcon, ReceiptIcon, UserIcon } from "@/components/ui/icons";
import { cx } from "@/lib/cx";
import { strings } from "@/lib/strings";

export type TabId = "menu" | "orders" | "account";

interface TabDefinition {
  id: TabId;
  href: string;
  label: string;
  icon: ReactNode;
}

const TABS: TabDefinition[] = [
  { id: "menu", href: "/", label: strings.tabBar.menu, icon: <MenuIcon /> },
  { id: "orders", href: "/pedidos", label: strings.tabBar.orders, icon: <ReceiptIcon /> },
  { id: "account", href: "/cuenta", label: strings.tabBar.account, icon: <UserIcon /> },
];

// Bottom navigation (Menú / Pedidos / Cuenta). Sticky at the end of the page's
// flex column, like BottomActionBar.
export function TabBar({ activeTab }: { activeTab: TabId }) {
  return (
    <nav
      aria-label={strings.tabBar.navLabel}
      className="sticky bottom-0 z-30 mt-auto bg-navy px-10 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2.5"
    >
      <ul className="mx-auto flex max-w-md items-center justify-between">
        {TABS.map((tab) => {
          const isActive = tab.id === activeTab;
          return (
            <li key={tab.id}>
              <Link
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={cx(
                  "flex min-h-11 min-w-11 flex-col items-center gap-1 text-xs",
                  isActive ? "font-black text-yellow" : "font-bold text-white",
                )}
              >
                {tab.icon}
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
