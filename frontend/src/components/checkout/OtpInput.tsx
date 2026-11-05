import { strings } from "@/lib/strings";

export const OTP_LENGTH = 6;

interface OtpInputProps {
  id: string;
  value: string;
  disabled: boolean;
  error: string | null;
  onChange: (digits: string) => void;
}

// One field, digits only. WhatsApp's copy-code button puts the code on the
// clipboard, so pasting anything containing the code (spaces, dashes, text)
// keeps just the digits.
export function OtpInput({ id, value, disabled, error, onChange }: OtpInputProps) {
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="font-semibold">
        {strings.verify.codeLabel}
      </label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        autoFocus
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, OTP_LENGTH))}
        aria-invalid={error !== null}
        aria-describedby={error ? errorId : undefined}
        placeholder="••••••"
        className="min-h-14 rounded-lg border border-zinc-300 bg-transparent px-4 text-center font-mono text-3xl tracking-[0.5em] disabled:opacity-60 dark:border-zinc-700"
      />
      {error && (
        <p id={errorId} role="alert" className="text-sm font-medium text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
