import type { ReactNode } from "react";
import { cx } from "@/lib/cx";
import { strings } from "@/lib/strings";

interface NoticeProps {
  children: ReactNode;
  // "info" for neutral updates, "warning" for something the customer must act on.
  tone?: "info" | "warning";
  onDismiss?: () => void;
  className?: string;
}

// Inline message (cart changes, shop closed…). role="status" so screen
// readers announce it without stealing focus.
export function Notice({ children, tone = "info", onDismiss, className }: NoticeProps) {
  return (
    <div
      role="status"
      className={cx(
        "flex items-start gap-2 rounded border-2 border-navy p-3 text-sm font-bold",
        tone === "warning" ? "bg-yellow" : "bg-paper",
        className,
      )}
    >
      <div className="flex-1 py-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={strings.menu.dismissNotice}
          className="-my-1 -mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-xl font-black"
        >
          ×
        </button>
      )}
    </div>
  );
}
