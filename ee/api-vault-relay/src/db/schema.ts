import { sqliteTable, text, integer, blob, index, uniqueIndex } from "drizzle-orm/sqlite-core";

// ───────────────────────────────────────────────────────────
// user — 인증 + 구독 메타
// ───────────────────────────────────────────────────────────
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: integer("created_at").notNull(),
  proUntil: integer("pro_until"), // legacy — keep for M5 entitlement compat

  // Auth (M8)
  authHash: blob("auth_hash", { mode: "buffer" }),
  saltAuth: blob("salt_auth", { mode: "buffer" }),
  saltEnc: blob("salt_enc", { mode: "buffer" }),

  // Billing (M10) — placeholder columns
  plan: text("plan").notNull().default("free"),
  planSource: text("plan_source"),
  planExpiresAt: integer("plan_expires_at"),
});

// ───────────────────────────────────────────────────────────
// github_installation — M5 GitHub Connector 에서 사용
// ───────────────────────────────────────────────────────────
export const githubInstallation = sqliteTable("github_installation", {
  id: integer("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  installedAt: integer("installed_at").notNull(),
});

// ───────────────────────────────────────────────────────────
// device — SecSync key exchange + 디바이스 페어링 (M9 에서 활용)
// ───────────────────────────────────────────────────────────
export const device = sqliteTable(
  "device",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    platform: text("platform").notNull(), // desktop|ios|android|web
    publicKey: blob("public_key", { mode: "buffer" }).notNull(),
    registeredAt: integer("registered_at").notNull(),
    lastSeenAt: integer("last_seen_at"),
    status: text("status").notNull().default("active"),
  },
  (t) => ({
    userIdx: index("idx_device_user").on(t.userId),
  }),
);

// ───────────────────────────────────────────────────────────
// passkey — WebAuthn credential
// ───────────────────────────────────────────────────────────
export const passkey = sqliteTable(
  "passkey",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialId: blob("credential_id", { mode: "buffer" }).notNull(),
    publicKey: blob("public_key", { mode: "buffer" }).notNull(),
    signCount: integer("sign_count").notNull().default(0),
    transports: text("transports"), // JSON array
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    credUnique: uniqueIndex("passkey_credential_id_unique").on(t.credentialId),
    userIdx: index("idx_passkey_user").on(t.userId),
  }),
);

// ───────────────────────────────────────────────────────────
// oauth_account — GitHub / Google / future
// ───────────────────────────────────────────────────────────
export const oauthAccount = sqliteTable(
  "oauth_account",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // github|google
    providerId: text("provider_id").notNull(),
    email: text("email"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => ({
    providerIdUnique: uniqueIndex("oauth_provider_provider_id_unique").on(t.provider, t.providerId),
    userIdx: index("idx_oauth_account_user").on(t.userId),
  }),
);
