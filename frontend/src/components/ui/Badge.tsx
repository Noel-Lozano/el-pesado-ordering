import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

export type BadgeTone = "red" | "muted";

const TONE_CLASSES: Record<BadgeTone, string> = {
  // "Requerido", "Desde 2 PM": white on red passes 4.5:1.
  red: "bg-red text-white",
  // "Próximamente".
  muted: "bg-line text-navy",
};

export function Badge({ tone, children, className }: { tone: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-block rounded-sm px-2 py-0.5 text-xs font-extrabold", TONE_CLASSES[tone], className)}>
      {children}
    </span>
  );
}
