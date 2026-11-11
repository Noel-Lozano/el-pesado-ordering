import Link from "next/link";
import type { ComponentProps } from "react";
import { cx } from "@/lib/cx";

export type ButtonVariant = "primary" | "secondary";

const BASE_CLASSES =
  "inline-flex items-center justify-center gap-2 rounded border-2 border-navy px-4 text-center text-navy no-underline";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // Orange with navy text (never white: it fails contrast) and the hard
  // shadow, which "presses in" on tap.
  primary:
    "min-h-[54px] bg-orange font-display text-xl shadow-hard active:translate-x-[3px] active:translate-y-[3px] active:shadow-none",
  secondary: "min-h-[50px] bg-white font-display text-lg",
};

// Disabled buttons and aria-disabled links look the same and don't animate.
const DISABLED_CLASSES =
  "disabled:cursor-not-allowed disabled:border-disabled disabled:bg-paper disabled:text-muted disabled:shadow-none disabled:active:translate-x-0 disabled:active:translate-y-0 aria-disabled:pointer-events-none aria-disabled:border-disabled aria-disabled:bg-paper aria-disabled:text-muted aria-disabled:shadow-none";

export function buttonClassName(variant: ButtonVariant = "primary", className?: string): string {
  return cx(BASE_CLASSES, VARIANT_CLASSES[variant], DISABLED_CLASSES, className);
}

type ButtonProps = ComponentProps<"button"> & { variant?: ButtonVariant };

export function Button({ variant = "primary", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClassName(variant, className)} {...props} />;
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: ButtonVariant };

export function ButtonLink({ variant = "primary", className, ...props }: ButtonLinkProps) {
  return <Link className={buttonClassName(variant, className)} {...props} />;
}
