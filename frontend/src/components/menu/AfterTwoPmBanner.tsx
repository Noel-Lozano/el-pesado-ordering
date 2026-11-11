import { FOOD_PLACEHOLDER } from "@/lib/menuImage";
import { strings } from "@/lib/strings";

// "Desde las 2 PM" teaser from mockup 01. Tapping it opens that category.
export function AfterTwoPmBanner({ onSelect }: { onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded border-2 border-navy bg-orange px-3.5 py-3 text-left text-navy shadow-hard active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
    >
      <span
        aria-hidden
        className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-sm border-2 border-navy bg-yellow text-[28px] leading-none"
      >
        {FOOD_PLACEHOLDER}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="font-display text-lg">{strings.menu.afterTwoPmTitle}</span>
        <span className="text-[13px] font-bold leading-snug">{strings.menu.afterTwoPmBody}</span>
      </span>
    </button>
  );
}
