import Link from "next/link";
import { BackIcon } from "@/components/ui/icons";

interface TopBarProps {
  title: string;
  backHref: string;
  backLabel: string;
}

// Navy header with a yellow back button. The back target is an explicit route
// rather than history.back(), so it behaves the same after a refresh or when
// the page was opened from a link.
export function TopBar({ title, backHref, backLabel }: TopBarProps) {
  return (
    <header className="bg-navy px-4 pb-3 pt-[calc(env(safe-area-inset-top)+12px)]">
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <Link
          href={backHref}
          aria-label={backLabel}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-yellow text-navy"
        >
          <BackIcon />
        </Link>
        <h1 className="font-display text-2xl font-normal text-white">{title}</h1>
      </div>
    </header>
  );
}
