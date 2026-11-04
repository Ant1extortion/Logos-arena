import { client } from "./index";

/**
 * Ensures all 5 database tables exist in Turso / SQLite on first request
 * without requiring manual CLI migrations.
 */
let initPromise: Promise<void> | null = null;

export async function ensureTablesExist(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      // 1. users table
      await client.execute(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          passcode_hash TEXT NOT NULL,
          tier TEXT NOT NULL DEFAULT 'FREE',
          active_session_token TEXT,
          device_hash TEXT,
          debates_used_this_month INTEGER NOT NULL DEFAULT 0,
          studio_scans_used_this_month INTEGER NOT NULL DEFAULT 0,
          verified_wins INTEGER NOT NULL DEFAULT 0,
          avg_integrity_score INTEGER NOT NULL DEFAULT 100,
          subscription_expires_at TEXT,
          created_at TEXT NOT NULL
        )
      `);

      // 2. debates table
      await client.execute(`
        CREATE TABLE IF NOT EXISTS debates (
          id TEXT PRIMARY KEY,
          topic TEXT NOT NULL,
          category TEXT NOT NULL,
          mode TEXT NOT NULL,
          ai_persona TEXT,
          status TEXT NOT NULL,
          is_ranked INTEGER NOT NULL DEFAULT 1,
          collusion_flag TEXT,
          current_round INTEGER NOT NULL DEFAULT 1,
          current_turn TEXT NOT NULL DEFAULT 'PRO',
          pro_user_id TEXT,
          pro_name TEXT NOT NULL,
          pro_tier TEXT NOT NULL DEFAULT 'FREE',
          pro_device_hash TEXT,
          con_user_id TEXT,
          con_name TEXT,
          con_tier TEXT NOT NULL DEFAULT 'FREE',
          con_device_hash TEXT,
          pro_hp INTEGER NOT NULL DEFAULT 100,
          con_hp INTEGER NOT NULL DEFAULT 100,
          pro_clash_points INTEGER NOT NULL DEFAULT 0,
          con_clash_points INTEGER NOT NULL DEFAULT 0,
          pro_integrity INTEGER NOT NULL DEFAULT 100,
          con_integrity INTEGER NOT NULL DEFAULT 100,
          winner TEXT,
          final_autopsy_json TEXT,
          created_at TEXT NOT NULL
        )
      `);

      // 3. turns table
      await client.execute(`
        CREATE TABLE IF NOT EXISTS turns (
          id TEXT PRIMARY KEY,
          debate_id TEXT NOT NULL,
          round_number INTEGER NOT NULL,
          side TEXT NOT NULL,
          author_name TEXT NOT NULL,
          steelman_summary TEXT,
          argument_text TEXT NOT NULL,
          referee_json TEXT NOT NULL,
          hp_deducted INTEGER NOT NULL DEFAULT 0,
          clash_awarded INTEGER NOT NULL DEFAULT 0,
          telemetry_json TEXT,
          integrity_score INTEGER NOT NULL DEFAULT 100,
          integrity_flags TEXT,
          blitz_required INTEGER NOT NULL DEFAULT 0,
          blitz_question TEXT,
          blitz_answer TEXT,
          blitz_passed INTEGER,
          created_at TEXT NOT NULL
        )
      `);

      // 4. subscriptions table
      await client.execute(`
        CREATE TABLE IF NOT EXISTS subscriptions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          plan TEXT NOT NULL,
          currency TEXT NOT NULL,
          amount REAL NOT NULL,
          payment_method TEXT NOT NULL,
          payment_ref TEXT NOT NULL UNIQUE,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `);

      // 5. sunday_tournaments table
      await client.execute(`
        CREATE TABLE IF NOT EXISTS sunday_tournaments (
          id TEXT PRIMARY KEY,
          week_label TEXT NOT NULL,
          motion_topic TEXT NOT NULL,
          status TEXT NOT NULL,
          base_prize_usd REAL NOT NULL DEFAULT 20,
          revenue_pool_usd REAL NOT NULL DEFAULT 0,
          effective_prize_usd REAL NOT NULL DEFAULT 20,
          winner_user_id TEXT,
          winner_name TEXT,
          created_at TEXT NOT NULL
        )
      `);
    })();
  }

  await initPromise;
}
