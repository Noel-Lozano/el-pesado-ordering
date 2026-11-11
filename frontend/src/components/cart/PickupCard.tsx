import Link from "next/link";
import { PinIcon } from "@/components/ui/icons";
import { strings } from "@/lib/strings";

// "Recoger en tienda · Lo antes posible · Cambiar" (mockup 03). The pickup
// time itself is chosen on the checkout screen.
export function PickupCard({ pickupLabel }: { pickupLabel: string }) {
  return (
    <section className="flex items-center gap-3 rounded border-2 border-navy p-3.5">
      <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-yellow">
        <PinIcon />
      </span>
      <div className="flex flex-1 flex-col gap-0.5">
        <h2 className="text-base font-black">{strings.cart.pickupTitle}</h2>
        <p className="text-sm font-semibold text-muted">{pickupLabel}</p>
      </div>
      <Link
        href="/checkout#cuando"
        aria-label={strings.cart.changePickupLabel}
        className="flex min-h-11 items-center px-1 text-sm font-extrabold underline underline-offset-4"
      >
        {strings.cart.changePickup}
      </Link>
    </section>
  );
}
