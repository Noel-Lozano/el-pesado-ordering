import { Card } from "@/components/ui/Card";
import { RadioCard } from "@/components/ui/RadioCard";
import type { Pickup, ScheduledSlot } from "@/lib/pickup";
import { strings } from "@/lib/strings";
import { formatClockTime } from "@/lib/time";

interface PickupTimePickerProps {
  asapAvailable: boolean;
  slots: ScheduledSlot[];
  // The cart's latest "available from" time, if it limits pickup.
  itemsAvailableFrom: string | null;
  value: Pickup | null;
  onChange: (pickup: Pickup) => void;
}

// "¿Cuándo lo recoges?" card: ASAP vs. a scheduled 15-minute slot today.
// id="cuando" is the target of the cart's "Cambiar" link.
export function PickupTimePicker({ asapAvailable, slots, itemsAvailableFrom, value, onChange }: PickupTimePickerProps) {
  const firstSlot = slots[0];

  return (
    <Card id="cuando" className="scroll-mt-4">
      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-2.5 text-base font-black">{strings.checkout.pickupLegend}</legend>

        {itemsAvailableFrom && !asapAvailable && (
          <p className="text-sm font-semibold text-muted">
            {strings.checkout.pickupAvailableFromNote(formatClockTime(itemsAvailableFrom))}
          </p>
        )}

        <div className="grid grid-cols-2 gap-2">
          <RadioCard
            name="recogida"
            value="asap"
            isCompact
            isDisabled={!asapAvailable}
            isChecked={value?.kind === "asap"}
            onChange={() => onChange({ kind: "asap" })}
          >
            {strings.checkout.pickupAsap}
          </RadioCard>
          <RadioCard
            name="recogida"
            value="scheduled"
            isCompact
            isDisabled={!firstSlot}
            isChecked={value?.kind === "scheduled"}
            // Choosing "schedule" preselects the earliest slot; the select below changes it.
            onChange={() => firstSlot && onChange({ kind: "scheduled", time: firstSlot.time })}
          >
            {strings.checkout.pickupScheduled}
          </RadioCard>
        </div>

        {value?.kind === "scheduled" && slots.length > 0 && (
          <label className="flex flex-col gap-1.5 text-sm font-extrabold">
            {strings.checkout.pickupSlotLabel}
            <select
              value={value.time}
              onChange={(event) => onChange({ kind: "scheduled", time: event.target.value })}
              className="h-[46px] rounded-sm border-2 border-navy bg-paper px-3 font-bold text-navy"
            >
              {slots.map((slot) => (
                <option key={slot.time} value={slot.time}>
                  {formatClockTime(slot.clockTime)}
                </option>
              ))}
            </select>
          </label>
        )}

        {!asapAvailable && !firstSlot && <p className="text-sm font-bold">{strings.checkout.pickupNoSlots}</p>}
      </fieldset>
    </Card>
  );
}
