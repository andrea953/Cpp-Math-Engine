import { pgTable, text, timestamp, jsonb, uuid } from "drizzle-orm/pg-core";

export const scenariosTable = pgTable("scenarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  clientName: text("client_name"),
  notes: text("notes"),
  inputs: jsonb("inputs").notNull(),
  shareToken: text("share_token").unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ScenarioRow = typeof scenariosTable.$inferSelect;
export type InsertScenarioRow = typeof scenariosTable.$inferInsert;
