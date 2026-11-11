import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { CardIcon, CashIcon } from "@/components/ui/icons";
import { RadioCard } from "@/components/ui/RadioCard";
import { strings } from "@/lib/strings";

// "Pago" card. Cash on pickup is the only method the API accepts today; card
// is shown as coming soon (not a radio, so it can't be focused or chosen).
export function PaymentOptions() {
  return (
    <Card>
      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2.5 text-base font-black">{strings.checkout.paymentLegend}</legend>
        <RadioCard name="pago" value="cash" isChecked isCompact onChange={() => undefined} className="min-h-[54px]">
          <span className="flex items-center gap-3">
            <CashIcon size={24} />
            {strings.checkout.payCash}
          </span>
        </RadioCard>
        <div
          aria-disabled="true"
          className="flex min-h-[54px] items-center gap-3 rounded-sm border-[1.5px] border-dashed border-disabled bg-white px-3.5 text-[15px] font-extrabold text-muted"
        >
          <CardIcon />
          <span className="flex-1">{strings.checkout.payCard}</span>
          <Badge tone="muted">{strings.checkout.comingSoon}</Badge>
        </div>
      </fieldset>
    </Card>
  );
}
