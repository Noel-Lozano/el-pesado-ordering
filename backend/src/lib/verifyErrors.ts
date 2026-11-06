import { AppError } from "../middleware/errorHandler.js";

// https://www.twilio.com/docs/api/errors
export const TWILIO_ERROR_CODES = {
  resourceNotFound: 20404,
  invalidParameter: 60200,
  maxCheckAttemptsReached: 60202,
  maxSendAttemptsReached: 60203,
  tooManyConcurrentRequests: 60212,
  deliveryBlockedByFraudGuard: 60410,
} as const;

// Maps the Twilio errors a customer can cause to our error shape. Anything
// else is a problem on our side or Twilio's, not the customer's.
export function mapVerifyError(code: number | undefined): AppError | null {
  switch (code) {
    case TWILIO_ERROR_CODES.invalidParameter:
      return new AppError("validation_error", "Phone number is not valid", 400);
    case TWILIO_ERROR_CODES.resourceNotFound:
      // No pending verification: it expired, was already used, or never existed.
      return new AppError("invalid_code", "Code is invalid or expired", 400);
    case TWILIO_ERROR_CODES.maxCheckAttemptsReached:
      return new AppError("too_many_attempts", "Too many attempts, request a new code", 429);
    case TWILIO_ERROR_CODES.maxSendAttemptsReached:
    case TWILIO_ERROR_CODES.tooManyConcurrentRequests:
    case TWILIO_ERROR_CODES.deliveryBlockedByFraudGuard:
      return new AppError("too_many_requests", "Too many code requests, try again later", 429);
    default:
      return null;
  }
}
