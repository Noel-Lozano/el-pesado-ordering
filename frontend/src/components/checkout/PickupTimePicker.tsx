import type { Pickup, ScheduledSlot } from "@/lib/pickup";
import { strings } from "@/lib/strings";
import { formatClockTime } from "@/lib/time";

interface PickupTimePickerProps {
  asapAvailable: boolean;
  slots: ScheduledSlot[];
  // The cart's latest "available from" time, if it limits pickup.
  itemsAvailableFrom: string | null;
  value: Pickup | null;
  error: string | null;
  onChange: (pickup: Pickup) => void;
}

const optionClass =
  "flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-zinc-300 px-4 has-[:checked]:border-red-700 has-[:checked]:ring-1 has-[:checked]:ring-red-700 dark:border-zinc-700";

export function PickupTimePicker({
  asapAvailable,
  slots,
  itemsAvailableFrom,
  value,
  error,
  onChange,
}: PickupTimePickerProps) {
  const isScheduled = value?.kind === "scheduled";
  const firstSlot = slots[0];

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={error ? "recogida-error" : undefined}>
      <legend className="mb-2 font-semibold">{strings.checkout.pickupLegend}</legend>

      {itemsAvailableFrom && !asapAvailable && (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {strings.checkout.pickupAvailableFromNote(formatClockTime(itemsAvailableFrom))}
        </p>
      )}

      {asapAvailable && (
        <label className={optionClass}>
          <input
            type="radio"
            name="recogida"
            checked={value?.kind === "asap"}
            onChange={() => onChange({ kind: "asap" })}
            className="h-5 w-5 accent-red-700"
          />
          <span className="font-medium">{strings.checkout.pickupAsap}</span>
        </label>
      )}

      {firstSlot ? (
        <>
          <label className={optionClass}>
            <input
              type="radio"
              name="recogida"
              checked={isScheduled}
              // Choosing "schedule" preselects the earliest slot; the select below changes it.
              onChange={() => onChange({ kind: "scheduled", time: firstSlot.time })}
              className="h-5 w-5 accent-red-700"
            />
            <span className="font-medium">{strings.checkout.pickupScheduled}</span>
          </label>
          {isScheduled && (
            <div className="flex flex-col gap-1 pl-1">
              <label htmlFor="hora-recogida" className="text-sm font-medium">
                {strings.checkout.pickupSlotLabel}
              </label>
              <select
                id="hora-recogida"
                value={value.time}
                onChange={(event) => onChange({ kind: "scheduled", time: event.target.value })}
                className="min-h-12 rounded-lg border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-700"
              >
                {slots.map((slot) => (
                  <option key={slot.time} value={slot.time}>
                    {formatClockTime(slot.clockTime)}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      ) : (
        !asapAvailable && <p className="text-sm">{strings.checkout.pickupNoSlots}</p>
      )}

      {error && (
        <p id="recogida-error" className="text-sm font-medium text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </fieldset>
  );
}
