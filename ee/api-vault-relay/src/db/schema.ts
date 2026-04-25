import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: integer("created_at").notNull(),
  proUntil: integer("pro_until"), // Pro entitlement (M10 billing)
});

export const githubInstallation = sqliteTable("github_installation", {
  id: integer("id").primaryKey(), // GitHub installation_id (NOT autoincrement)
  userId: text("user_id")
    .notNull()
    .references(() => user.id),
  installedAt: integer("installed_at").notNull(),
});
