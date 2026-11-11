import type { ReactNode } from "react";
import { cx } from "@/lib/cx";

interface RadioCardProps {
  name: string;
  value: string;
  isChecked: boolean;
  onChange: (value: string) => void;
  children: ReactNode;
  // Right-aligned extra, e.g. the variant's price.
  trailing?: ReactNode;
  isRequired?: boolean;
  className?: string;
}

// A native radio wrapped in its <label>, so the whole card is the tap target
// and keyboard arrows move between options. Selected = paper fill + thicker
// border (from the mockups); the orange accent marks the dot itself.
export function RadioCard({
  name,
  value,
  isChecked,
  onChange,
  children,
  trailing,
  isRequired = false,
  className,
}: RadioCardProps) {
  return (
    <label
      className={cx(
        "flex min-h-[54px] cursor-pointer items-center gap-3 rounded border-navy px-3.5 text-base font-extrabold",
        isChecked ? "border-[2.5px] bg-paper" : "border-[1.5px] bg-white",
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={isChecked}
        required={isRequired}
        onChange={() => onChange(value)}
        className="m-0 h-[22px] w-[22px] shrink-0 accent-orange"
      />
      <span className="flex-1">{children}</span>
      {trailing}
    </label>
  );
}
