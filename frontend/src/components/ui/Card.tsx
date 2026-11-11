import type { ComponentProps } from "react";
import { cx } from "@/lib/cx";

type CardProps = ComponentProps<"section"> & {
  // Featured cards (the status tracker) get the hard offset shadow.
  isFeatured?: boolean;
};

// White box with the 2px navy border and 6px corners used across screens.
export function Card({ isFeatured = false, className, ...props }: CardProps) {
  return (
    <section
      className={cx("rounded border-2 border-navy bg-white p-3.5", isFeatured && "shadow-hard", className)}
      {...props}
    />
  );
}
