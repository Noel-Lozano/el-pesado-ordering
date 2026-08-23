import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export class AppError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: { code: "not_found", message: `No route for ${req.method} ${req.path}` } });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: "validation_error", message: err.issues[0]?.message ?? "Invalid input" } });
    return;
  }

  console.error(err);
  res.status(500).json({ error: { code: "internal_error", message: "Something went wrong" } });
}
