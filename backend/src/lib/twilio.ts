import twilio from "twilio";
import { env } from "../config/env.js";

const client = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);

export async function sendOtpSms(phone: string, code: string): Promise<void> {
  await client.messages.create({
    to: phone,
    from: env.TWILIO_PHONE_NUMBER,
    body: `Your El Pesado verification code is ${code}. It expires in ${env.OTP_EXPIRY_MINUTES} minutes.`,
  });
}
