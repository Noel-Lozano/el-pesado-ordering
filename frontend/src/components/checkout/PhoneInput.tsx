import type { PhoneCountry } from "@/lib/phone";
import { strings } from "@/lib/strings";

const COUNTRIES: PhoneCountry[] = ["MX", "US"];

interface PhoneInputProps {
  id: string;
  country: PhoneCountry;
  value: string;
  error: string | null;
  onCountryChange: (country: PhoneCountry) => void;
  onChange: (value: string) => void;
}

export function PhoneInput({ id, country, value, error, onCountryChange, onChange }: PhoneInputProps) {
  const hintId = `${id}-ayuda`;
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-semibold">
        {strings.checkout.phoneLabel}
      </label>
      <div className="flex gap-2">
        <div role="group" aria-label={strings.checkout.countryGroupLabel} className="flex shrink-0">
          {COUNTRIES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={country === option}
              onClick={() => onCountryChange(option)}
              className={`min-h-12 border border-zinc-300 px-3 text-sm font-semibold first:rounded-l-lg last:rounded-r-lg dark:border-zinc-700 ${
                country === option ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900" : ""
              }`}
            >
              {strings.checkout.countryOption[option]}
            </button>
          ))}
        </div>
        <input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={strings.checkout.phonePlaceholder[country]}
          aria-invalid={error !== null}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          className="min-h-12 w-full min-w-0 rounded-lg border border-zinc-300 bg-transparent px-3 text-base dark:border-zinc-700"
        />
      </div>
      <p id={hintId} className="text-sm text-zinc-600 dark:text-zinc-400">
        {strings.checkout.phoneHint}
      </p>
      {error && (
        <p id={errorId} className="text-sm font-medium text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
