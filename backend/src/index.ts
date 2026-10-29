import "dotenv/config";
import cors from "cors";
import express from "express";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { v1Router } from "./routes/index.js";

const app = express();

// The frontend (Vercel) and API (Railway/Render) are on different origins.
app.use(
  cors({
    origin: env.CORS_ORIGINS,
    allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
  }),
);
app.use(express.json());
app.use("/api/v1", v1Router);
app.use(notFoundHandler);
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`Backend listening on port ${env.PORT} (${env.NODE_ENV})`);
});
