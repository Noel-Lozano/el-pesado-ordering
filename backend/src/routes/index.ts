import { Router } from "express";
import { authRouter } from "./auth.js";
import { ordersRouter } from "./orders.js";

export const v1Router = Router();

v1Router.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

v1Router.use("/auth", authRouter);
v1Router.use("/orders", ordersRouter);
