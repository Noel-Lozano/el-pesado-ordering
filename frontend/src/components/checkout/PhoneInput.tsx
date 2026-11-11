import type { PhoneCountry } from "@/lib/phone";
import { strings } from "@/lib/strings";

const COUNTRIES: PhoneCountry[] = ["MX", "US"];

interface PhoneInputProps {
  id: string;
  country: PhoneCountry;
  value: string;
  onCountryChange: (country: PhoneCountry) => void;
  onChange: (value: string) => void;
}

const FIELD_CLASSES = "h-[46px] rounded-sm border-2 border-navy";

// Country code select (MX +52 / US +1) plus the 10-digit national number
// (mockup 04). The form normalizes both into E.164 for the API.
export function PhoneInput({ id, country, value, onCountryChange, onChange }: PhoneInputProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-extrabold">
        {strings.checkout.phoneLabel}
      </label>
      <div className="flex gap-2">
        <select
          aria-label={strings.checkout.countryLabel}
          value={country}
          onChange={(event) => onCountryChange(event.target.value as PhoneCountry)}
          className={`${FIELD_CLASSES} shrink-0 bg-yellow px-2 font-black text-navy`}
        >
          {COUNTRIES.map((option) => (
            <option key={option} value={option}>
              {strings.checkout.countryOption[option]}
            </option>
          ))}
        </select>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={strings.checkout.phonePlaceholder}
          className={`${FIELD_CLASSES} w-full min-w-0 bg-paper px-3 text-navy placeholder:text-muted`}
        />
      </div>
    </div>
  );
}
