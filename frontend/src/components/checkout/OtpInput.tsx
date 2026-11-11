"use client";

import { type ClipboardEvent, type KeyboardEvent, type Ref, useEffect, useRef } from "react";
import { cx } from "@/lib/cx";
import { strings } from "@/lib/strings";

export const OTP_LENGTH = 6;

interface OtpInputProps {
  // Digits typed so far, always contiguous from the first box ("483").
  value: string;
  onChange: (digits: string) => void;
  disabled?: boolean;
  isInvalid?: boolean;
  describedById?: string;
  // Lets the screen refocus the first box, e.g. after a wrong code.
  firstInputRef?: Ref<HTMLInputElement>;
}

function onlyDigits(text: string): string {
  return text.replace(/\D/g, "");
}

// Six single-digit boxes (mockup 05). Typing moves to the next box, Backspace
// on an empty box goes back, and pasting (or the phone's one-time-code
// autofill, which lands in the first box) fills them all. WhatsApp's "copy
// code" may include spaces or text, so only digits are kept.
export function OtpInput({ value, onChange, disabled = false, isInvalid = false, describedById, firstInputRef }: OtpInputProps) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  // Box to focus once the new value has rendered. Focusing right away would
  // run the next box's onFocus guard against the old value and bounce back.
  const pendingFocus = useRef<number | null>(null);

  const focusNow = (index: number) => {
    inputs.current[Math.min(Math.max(index, 0), OTP_LENGTH - 1)]?.focus();
  };
  const focusBox = (index: number) => {
    pendingFocus.current = index;
  };

  useEffect(() => {
    if (pendingFocus.current !== null) {
      focusNow(pendingFocus.current);
      pendingFocus.current = null;
    }
  }, [value]);

  // Writes digits starting at `index`, keeping what's before it.
  const fillFrom = (index: number, digits: string) => {
    const next = (value.slice(0, index) + digits).slice(0, OTP_LENGTH);
    onChange(next);
    focusBox(next.length);
  };

  const handleChange = (index: number, raw: string) => {
    const digits = onlyDigits(raw);
    if (digits.length === 0) {
      // The box's digit was deleted.
      onChange(value.slice(0, index) + value.slice(index + 1));
      return;
    }
    // Focus selects the box's digit, so typing normally replaces it and `raw`
    // is one digit. If the caret sat beside the old digit instead, raw is
    // old + new ("48"): drop the old one. Longer input is a paste/autofill.
    const isReplacingDigit = digits.length === 2 && value[index] !== undefined;
    const typed = isReplacingDigit ? digits.replace(value[index], "") : digits;
    if (typed.length === 1) {
      const next = (value.slice(0, index) + typed + value.slice(index + 1)).slice(0, OTP_LENGTH);
      if (next === value) {
        // Same digit retyped: nothing re-renders, so move on right away.
        focusNow(index + 1);
        return;
      }
      onChange(next);
      focusBox(index + 1);
    } else {
      fillFrom(index, typed);
    }
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && value[index] === undefined && index > 0) {
      event.preventDefault();
      onChange(value.slice(0, index - 1));
      focusBox(index - 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusNow(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusNow(Math.min(index + 1, value.length));
    }
  };

  const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const digits = onlyDigits(event.clipboardData.getData("text"));
    if (digits.length > 0) {
      fillFrom(Math.min(index, value.length), digits);
    }
  };

  return (
    <div
      role="group"
      aria-label={strings.verify.codeLabel}
      aria-describedby={describedById}
      className="grid grid-cols-6 gap-2"
    >
      {Array.from({ length: OTP_LENGTH }, (_, index) => {
        const digit = value[index] ?? "";
        return (
          <input
            key={index}
            ref={(element) => {
              inputs.current[index] = element;
              if (index === 0 && firstInputRef) {
                if (typeof firstInputRef === "function") firstInputRef(element);
                else firstInputRef.current = element;
              }
            }}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            // Only the first box takes the SMS/WhatsApp autofill suggestion.
            autoComplete={index === 0 ? "one-time-code" : "off"}
            // The first box opens the keyboard right away.
            autoFocus={index === 0}
            aria-label={strings.verify.digitLabel(index + 1)}
            aria-invalid={isInvalid}
            value={digit}
            disabled={disabled}
            // Boxes fill left to right: tapping an empty later box jumps to the next one to fill.
            onFocus={(event) => {
              if (index > value.length) focusNow(value.length);
              else event.target.select();
            }}
            onChange={(event) => handleChange(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={(event) => handlePaste(index, event)}
            className={cx(
              "h-[60px] w-full min-w-0 rounded-sm bg-white text-center font-display text-[28px] text-navy",
              "focus:border-[3px] focus:border-orange focus:bg-paper focus:shadow-hard focus-visible:outline-none",
              "disabled:opacity-60",
              isInvalid ? "border-2 border-red" : digit ? "border-2 border-navy" : "border-[1.5px] border-disabled",
            )}
          />
        );
      })}
    </div>
  );
}
