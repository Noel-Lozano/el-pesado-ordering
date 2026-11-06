import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  STRIPE_SECRET_KEY: z.string().min(1, "STRIPE_SECRET_KEY is required"),
  TWILIO_ACCOUNT_SID: z.string().min(1, "TWILIO_ACCOUNT_SID is required"),
  TWILIO_AUTH_TOKEN: z.string().min(1, "TWILIO_AUTH_TOKEN is required"),
  // Verify service with the shop's WhatsApp sender attached (ADR-003).
  TWILIO_VERIFY_SERVICE_SID: z.string().regex(/^VA[0-9a-f]{32}$/, "TWILIO_VERIFY_SERVICE_SID must be a Verify service SID (VA...)"),
  JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
  // Comma-separated list of frontend origins allowed to call the API from a
  // browser, e.g. "http://localhost:3000,https://elpesado.vercel.app".
  CORS_ORIGINS: z
    .string()
    .min(1, "CORS_ORIGINS is required")
    .transform((value) => value.split(",").map((origin) => origin.trim()))
    .pipe(z.array(z.url("Each CORS_ORIGINS entry must be a full origin URL"))),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
