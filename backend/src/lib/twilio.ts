import twilio from "twilio";
import { env } from "../config/env.js";
import { AppError } from "../middleware/errorHandler.js";
import { logEvent } from "./log.js";
import { mapVerifyError } from "./verifyErrors.js";

// Phone verification goes through Twilio Verify over WhatsApp only (ADR-003).
// Verify generates, delivers, expires, and checks the code, and enforces its
// own attempt and send-rate limits, so none of that lives in our database.

const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
const verifyService = client.verify.v2.services(env.TWILIO_VERIFY_SERVICE_SID);

const VERIFY_CHANNEL = "whatsapp";
// The UI is Spanish-first, so +1 numbers get the Spanish template too.
const VERIFY_LOCALE = "es";
const APPROVED_STATUS = "approved";

function toAppError(err: unknown): AppError {
  const code = err instanceof twilio.RestException ? err.code : undefined;
  const mapped = mapVerifyError(code);
  if (mapped) {
    return mapped;
  }
  // Twilio's message can include the phone number, so only the code and
  // status are logged (coding_standards.md §10).
  logEvent("error", "twilio_verify_failed", {
    twilioCode: code ?? null,
    httpStatus: err instanceof twilio.RestException ? err.status : null,
  });
  return new AppError("verification_unavailable", "Could not send or check the code right now", 502);
}

export async function startWhatsAppVerification(phone: string): Promise<void> {
  try {
    await verifyService.verifications.create({ to: phone, channel: VERIFY_CHANNEL, locale: VERIFY_LOCALE });
  } catch (err) {
    throw toAppError(err);
  }
}

// True only if Twilio approved the code. A wrong code comes back as
// "pending" rather than an error.
export async function isVerificationCodeApproved(phone: string, code: string): Promise<boolean> {
  try {
    const check = await verifyService.verificationChecks.create({ to: phone, code });
    return check.status === APPROVED_STATUS;
  } catch (err) {
    throw toAppError(err);
  }
}
