import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

// Long enough for the order status page to keep polling while the order is
// prepared (ADR-002 decision 6; supersedes ADR-001's 15 minutes).
const VERIFIED_PHONE_TOKEN_EXPIRY = "24h";

export interface VerifiedPhoneTokenPayload {
  customerId: number;
}

export function signVerifiedPhoneToken(payload: VerifiedPhoneTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: VERIFIED_PHONE_TOKEN_EXPIRY });
}

export function verifyPhoneToken(token: string): VerifiedPhoneTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);

  if (typeof decoded !== "object" || decoded === null || typeof (decoded as { customerId?: unknown }).customerId !== "number") {
    throw new Error("Invalid token payload");
  }

  return { customerId: (decoded as { customerId: number }).customerId };
}
