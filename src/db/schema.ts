import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  display_name: text("display_name").notNull(),
  passcode_hash: text("passcode_hash").notNull(),
  tier: text("tier", { enum: ["FREE", "PRO", "PREMIUM"] }).notNull().default("FREE"),
  active_session_token: text("active_session_token"),
  device_hash: text("device_hash"),
  debates_used_this_month: integer("debates_used_this_month").notNull().default(0),
  studio_scans_used_this_month: integer("studio_scans_used_this_month").notNull().default(0),
  verified_wins: integer("verified_wins").notNull().default(0),
  avg_integrity_score: integer("avg_integrity_score").notNull().default(100),
  subscription_expires_at: text("subscription_expires_at"),
  created_at: text("created_at").notNull(),
});

export const debates = sqliteTable("debates", {
  id: text("id").primaryKey(),
  topic: text("topic").notNull(),
  category: text("category").notNull(),
  mode: text("mode", { enum: ["PVE", "PVP", "SUNDAY_BOUNTY"] }).notNull(),
  ai_persona: text("ai_persona"),
  status: text("status", { enum: ["OPEN_CHALLENGE", "IN_PROGRESS", "COMPLETED"] }).notNull(),
  is_ranked: integer("is_ranked").notNull().default(1),
  collusion_flag: text("collusion_flag"),
  current_round: integer("current_round").notNull().default(1),
  current_turn: text("current_turn", { enum: ["PRO", "CON"] }).notNull().default("PRO"),
  pro_user_id: text("pro_user_id"),
  pro_name: text("pro_name").notNull(),
  pro_tier: text("pro_tier").notNull().default("FREE"),
  pro_device_hash: text("pro_device_hash"),
  con_user_id: text("con_user_id"),
  con_name: text("con_name"),
  con_tier: text("con_tier").notNull().default("FREE"),
  con_device_hash: text("con_device_hash"),
  pro_hp: integer("pro_hp").notNull().default(100),
  con_hp: integer("con_hp").notNull().default(100),
  pro_clash_points: integer("pro_clash_points").notNull().default(0),
  con_clash_points: integer("con_clash_points").notNull().default(0),
  pro_integrity: integer("pro_integrity").notNull().default(100),
  con_integrity: integer("con_integrity").notNull().default(100),
  winner: text("winner"),
  final_autopsy_json: text("final_autopsy_json"),
  created_at: text("created_at").notNull(),
});

export const turns = sqliteTable("turns", {
  id: text("id").primaryKey(),
  debate_id: text("debate_id").notNull(),
  round_number: integer("round_number").notNull(),
  side: text("side", { enum: ["PRO", "CON"] }).notNull(),
  author_name: text("author_name").notNull(),
  steelman_summary: text("steelman_summary"),
  argument_text: text("argument_text").notNull(),
  referee_json: text("referee_json").notNull(),
  hp_deducted: integer("hp_deducted").notNull().default(0),
  clash_awarded: integer("clash_awarded").notNull().default(0),
  telemetry_json: text("telemetry_json"),
  integrity_score: integer("integrity_score").notNull().default(100),
  integrity_flags: text("integrity_flags"),
  blitz_required: integer("blitz_required").notNull().default(0),
  blitz_question: text("blitz_question"),
  blitz_answer: text("blitz_answer"),
  blitz_passed: integer("blitz_passed"),
  created_at: text("created_at").notNull(),
});

export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(),
  user_id: text("user_id").notNull(),
  plan: text("plan", { enum: ["PRO", "PREMIUM"] }).notNull(),
  currency: text("currency", { enum: ["NGN", "USD", "USDT"] }).notNull(),
  amount: real("amount").notNull(),
  payment_method: text("payment_method", { enum: ["PAYSTACK", "CRYPTO"] }).notNull(),
  payment_ref: text("payment_ref").notNull().unique(),
  status: text("status", { enum: ["PENDING", "ACTIVE"] }).notNull(),
  created_at: text("created_at").notNull(),
});

export const sundayTournaments = sqliteTable("sunday_tournaments", {
  id: text("id").primaryKey(),
  week_label: text("week_label").notNull(),
  motion_topic: text("motion_topic").notNull(),
  status: text("status", { enum: ["QUALIFIERS_OPEN", "FINALS_LIVE", "COMPLETED"] }).notNull(),
  base_prize_usd: real("base_prize_usd").notNull().default(20),
  revenue_pool_usd: real("revenue_pool_usd").notNull().default(0),
  effective_prize_usd: real("effective_prize_usd").notNull().default(20),
  winner_user_id: text("winner_user_id"),
  winner_name: text("winner_name"),
  created_at: text("created_at").notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Debate = typeof debates.$inferSelect;
export type NewDebate = typeof debates.$inferInsert;
export type Turn = typeof turns.$inferSelect;
export type NewTurn = typeof turns.$inferInsert;
export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type SundayTournament = typeof sundayTournaments.$inferSelect;
export type NewSundayTournament = typeof sundayTournaments.$inferInsert;
