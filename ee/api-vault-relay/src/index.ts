import { Hono } from "hono";
import { logger } from "hono/logger";
import type { Env } from "./env";
import { oauthAuth } from "./routes/auth/oauth";
import { passkeyAuth } from "./routes/auth/passkey";
import { refreshAuth } from "./routes/auth/refresh";
import { health } from "./routes/health";
import { githubIntegrations } from "./routes/integrations/github";
import { sync } from "./routes/sync";
import { pair } from "./routes/pair";

const app = new Hono<{ Bindings: Env }>();

app.use("*", logger());
app.route("/health", health);
app.route("/auth/passkey", passkeyAuth);
app.route("/auth/oauth", oauthAuth);
app.route("/auth/refresh", refreshAuth);
app.route("/integrations/github", githubIntegrations);
app.route("/sync", sync);
app.route("/pair", pair);

export default app;
