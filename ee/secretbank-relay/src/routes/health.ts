import { Hono } from "hono";
import type { Env } from "../env";

export const health = new Hono<{ Bindings: Env }>();

health.get("/", (c) => {
  return c.json({
    status: "ok",
    service: "secretbank-relay",
    version: "0.1.0",
    time: new Date().toISOString(),
  });
});
