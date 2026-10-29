import { formatMXN } from "@/lib/money";
import { strings } from "@/lib/strings";
import type { MenuItem } from "@/types/menu";

interface MenuItemCardProps {
  item: MenuItem;
}

export function MenuItemCard({ item }: MenuItemCardProps) {
  return (
    <article className="flex items-start justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="min-w-0">
        <h3 className="text-lg font-semibold leading-snug">{item.name}</h3>
        {item.description && (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{item.description}</p>
        )}
        {item.availableFrom && (
          <p className="mt-2 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
            {strings.menu.availableFrom(item.availableFrom)}
          </p>
        )}
      </div>
      <p className="shrink-0 text-lg font-bold tabular-nums">{formatMXN(item.priceCents)}</p>
    </article>
  );
}
