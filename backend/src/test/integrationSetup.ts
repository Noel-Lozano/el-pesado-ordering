import "dotenv/config";

// Twilio is mocked in integration tests, so a real Verify service isn't
// needed; env validation still requires a well-formed SID.
process.env.TWILIO_VERIFY_SERVICE_SID ??= `VA${"0".repeat(32)}`;
