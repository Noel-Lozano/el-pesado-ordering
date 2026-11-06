import { describe, expect, it } from "vitest";
import { mapVerifyError, TWILIO_ERROR_CODES } from "./verifyErrors.js";

describe("mapVerifyError", () => {
  it.each([
    [TWILIO_ERROR_CODES.invalidParameter, "validation_error", 400],
    [TWILIO_ERROR_CODES.resourceNotFound, "invalid_code", 400],
    [TWILIO_ERROR_CODES.maxCheckAttemptsReached, "too_many_attempts", 429],
    [TWILIO_ERROR_CODES.maxSendAttemptsReached, "too_many_requests", 429],
    [TWILIO_ERROR_CODES.tooManyConcurrentRequests, "too_many_requests", 429],
    [TWILIO_ERROR_CODES.deliveryBlockedByFraudGuard, "too_many_requests", 429],
  ])("maps Twilio %i to %s (%i)", (twilioCode, code, status) => {
    const error = mapVerifyError(twilioCode);
    expect(error?.code).toBe(code);
    expect(error?.status).toBe(status);
  });

  it("leaves unknown or missing codes to the caller", () => {
    expect(mapVerifyError(20003)).toBeNull();
    expect(mapVerifyError(undefined)).toBeNull();
  });
});
