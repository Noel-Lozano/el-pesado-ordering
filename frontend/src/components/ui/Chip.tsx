import { cx } from "@/lib/cx";

interface ChipProps {
  label: string;
  isPressed: boolean;
  onClick: () => void;
}

// Category filter chip. A toggle button (aria-pressed), not a tab: only one is
// pressed at a time, but each is just a filter over the same list.
export function Chip({ label, isPressed, onClick }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={isPressed}
      onClick={onClick}
      className={cx(
        // 44px tall (mockup: 40px) to meet the minimum touch target.
        "h-11 shrink-0 whitespace-nowrap rounded-sm border-2 border-navy px-3.5 text-[15px] font-extrabold",
        isPressed ? "bg-navy text-yellow" : "bg-white text-navy",
      )}
    >
      {label}
    </button>
  );
}
