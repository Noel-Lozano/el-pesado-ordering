// Phone numbers are stored and sent as E.164 ("+526641234567"). The customer
// base is split between Mexican (+52) and US (+1) numbers.

export type PhoneCountry = "MX" | "US";

export const PHONE_COUNTRY_CODES: Record<PhoneCountry, string> = {
  MX: "52",
  US: "1",
};

const NATIONAL_NUMBER_LENGTH = 10;
// Pre-2019 Mexican mobile numbers were dialed "+52 1 ..."; people still paste them.
const LEGACY_MX_MOBILE_PREFIX = "521";
// Mexican area codes and US area/exchange codes never start with 0 or 1.
const MX_NATIONAL_REGEX = /^[2-9]\d{9}$/;
const US_NATIONAL_REGEX = /^[2-9]\d{2}[2-9]\d{6}$/;

function toNationalNumber(digits: string, country: PhoneCountry): string {
  const countryCode = PHONE_COUNTRY_CODES[country];

  if (country === "MX" && digits.length === NATIONAL_NUMBER_LENGTH + 3 && digits.startsWith(LEGACY_MX_MOBILE_PREFIX)) {
    return digits.slice(LEGACY_MX_MOBILE_PREFIX.length);
  }
  if (digits.length === NATIONAL_NUMBER_LENGTH + countryCode.length && digits.startsWith(countryCode)) {
    return digits.slice(countryCode.length);
  }
  return digits;
}

// "664 123 4567" + MX -> "+526641234567". Accepts the number with or without
// its country code and any spacing/punctuation. Returns null if it isn't a
// valid number for the selected country.
export function normalizePhone(input: string, country: PhoneCountry): string | null {
  const digits = input.replace(/\D/g, "");
  const national = toNationalNumber(digits, country);
  const pattern = country === "MX" ? MX_NATIONAL_REGEX : US_NATIONAL_REGEX;

  return pattern.test(national) ? `+${PHONE_COUNTRY_CODES[country]}${national}` : null;
}

// Last 4 digits only, matching how the store screen identifies orders.
export function maskPhone(e164: string): string {
  return `•••• ${e164.slice(-4)}`;
}
