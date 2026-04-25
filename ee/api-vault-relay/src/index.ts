import { Hono } from "hono";
import { logger } from "hono/logger";
import type { Env } from "./env";
import { health } from "./routes/health";
import { githubIntegrations } from "./routes/integrations/github";

const app = new Hono<{ Bindings: Env }>();

app.use("*", logger());
app.route("/health", health);
app.route("/integrations/github", githubIntegrations);

export default app;
