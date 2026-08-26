import { createHash, randomInt } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { pool } from "../db/pool.js";
import { AppError } from "../middleware/errorHandler.js";
import { sendOtpSms } from "../lib/twilio.js";
import { signVerifiedPhoneToken } from "../lib/jwt.js";

export const authRouter = Router();

const E164_REGEX = /^\+[1-9]\d{1,14}$/;

const sendCodeSchema = z.object({
  phone: z.string().regex(E164_REGEX, "Phone must be in E.164 format"),
});

const verifyCodeSchema = z.object({
  phone: z.string().regex(E164_REGEX, "Phone must be in E.164 format"),
  code: z.string().regex(/^\d{6}$/, "Code must be 6 digits"),
});

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

authRouter.post("/send-code", async (req, res, next) => {
  try {
    const { phone } = sendCodeSchema.parse(req.body);
    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    const expiresAt = new Date(Date.now() + env.OTP_EXPIRY_MINUTES * 60_000);

    await pool.query(`INSERT INTO otp_codes (phone, code_hash, expires_at) VALUES ($1, $2, $3)`, [
      phone,
      hashCode(code),
      expiresAt,
    ]);

    await sendOtpSms(phone, code);

    res.json({ status: "sent" });
  } catch (err) {
    next(err);
  }
});

authRouter.post("/verify-code", async (req, res, next) => {
  try {
    const { phone, code } = verifyCodeSchema.parse(req.body);
    const codeHash = hashCode(code);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const { rows } = await client.query<{
        id: number;
        code_hash: string;
        attempts: number;
        expires_at: Date;
        consumed_at: Date | null;
      }>(
        `SELECT id, code_hash, attempts, expires_at, consumed_at
         FROM otp_codes
         WHERE phone = $1
         ORDER BY created_at DESC
         LIMIT 1
         FOR UPDATE`,
        [phone],
      );

      const otp = rows[0];

      if (!otp || otp.consumed_at || otp.expires_at < new Date()) {
        throw new AppError("invalid_code", "Code is invalid or expired", 400);
      }

      if (otp.attempts >= env.OTP_MAX_ATTEMPTS) {
        throw new AppError("too_many_attempts", "Too many attempts, request a new code", 429);
      }

      if (otp.code_hash !== codeHash) {
        await client.query(`UPDATE otp_codes SET attempts = attempts + 1, updated_at = now() WHERE id = $1`, [otp.id]);
        await client.query("COMMIT");
        throw new AppError("invalid_code", "Code is invalid or expired", 400);
      }

      await client.query(`UPDATE otp_codes SET consumed_at = now(), updated_at = now() WHERE id = $1`, [otp.id]);

      const { rows: customerRows } = await client.query<{ id: number }>(
        `INSERT INTO customers (phone, phone_verified)
         VALUES ($1, true)
         ON CONFLICT (phone) DO UPDATE SET phone_verified = true, updated_at = now()
         RETURNING id`,
        [phone],
      );

      await client.query("COMMIT");

      const customer = customerRows[0];
      if (!customer) {
        throw new AppError("internal_error", "Failed to create customer record", 500);
      }

      const token = signVerifiedPhoneToken({ customerId: customer.id });
      res.json({ token });
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    next(err);
  }
});
