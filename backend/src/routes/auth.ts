import { Router } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import { AppError } from "../middleware/errorHandler.js";
import { signVerifiedPhoneToken } from "../lib/jwt.js";
import { isVerificationCodeApproved, startWhatsAppVerification } from "../lib/twilio.js";

export const authRouter = Router();

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

const sendCodeSchema = z.object({
  phone: z.string().regex(E164_REGEX, "Phone must be in E.164 format"),
});

const verifyCodeSchema = z.object({
  phone: z.string().regex(E164_REGEX, "Phone must be in E.164 format"),
  // The Verify service is configured for 6-digit codes.
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});

authRouter.post("/send-code", async (req, res, next) => {
  try {
    const { phone } = sendCodeSchema.parse(req.body);
    await startWhatsAppVerification(phone);
    res.json({ status: "sent" });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/verify-code", async (req, res, next) => {
  try {
    const { phone, code } = verifyCodeSchema.parse(req.body);

    if (!(await isVerificationCodeApproved(phone, code))) {
      throw new AppError("invalid_code", "Code is invalid or expired", 400);
    }

    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO customers (phone, phone_verified)
       VALUES ($1, true)
       ON CONFLICT (phone) DO UPDATE SET phone_verified = true, updated_at = now()
       RETURNING id`,
      [phone],
    );
    const customer = rows[0];
    if (!customer) {
      throw new AppError("internal_error", "Failed to create customer record", 500);
    }

    const token = signVerifiedPhoneToken({ customerId: customer.id });
    res.json({ token });
  } catch (err) {
    next(err);
  }
});
