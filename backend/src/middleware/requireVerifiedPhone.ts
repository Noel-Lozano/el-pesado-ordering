import type { NextFunction, Request, Response } from "express";
import { verifyPhoneToken } from "../lib/jwt.js";
import { AppError } from "./errorHandler.js";

declare global {
  namespace Express {
    interface Request {
      customer?: { customerId: number };
    }
  }
}

export function requireVerifiedPhone(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    throw new AppError("unauthorized", "Missing or invalid Authorization header", 401);
  }

  const token = header.slice("Bearer ".length);

  try {
    req.customer = verifyPhoneToken(token);
  } catch {
    throw new AppError("unauthorized", "Invalid or expired token", 401);
  }

  next();
}
