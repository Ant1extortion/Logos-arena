import { createHash, randomBytes } from "crypto";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users, User } from "../db/schema";
import { ensureTablesExist } from "../db/init";

export const SESSION_COOKIE_NAME = "logos_session";

/**
 * Hash a passcode using SHA-256 with a salt.
 */
export function hashPasscode(passcode: string): string {
  return createHash("sha256").update(`logos_salt_${passcode}`).digest("hex");
}

/**
 * Verify passcode against hash.
 */
export function verifyPasscode(passcode: string, hash: string): boolean {
  return hashPasscode(passcode) === hash;
}

/**
 * Generate a cryptographically secure session token.
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Get session token from incoming request (from cookies or Authorization header).
 */
export async function getSessionTokenFromRequest(
  req?: NextRequest
): Promise<string | null> {
  // Check header first
  if (req) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return authHeader.substring(7).trim();
    }
  }

  // Check cookie
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (token) return token;
  } catch {
    // cookies() might fail in test environments without next request context
  }

  return null;
}

/**
 * Authenticate current session.
 * Ensures the token matches the active_session_token in the database.
 * If the user logged in elsewhere, active_session_token will have changed,
 * immediately invalidating this session.
 */
export async function getAuthenticatedUser(
  req?: NextRequest
): Promise<User | null> {
  await ensureTablesExist();

  const token = await getSessionTokenFromRequest(req);
  if (!token) return null;

  const foundUsers = await db
    .select()
    .from(users)
    .where(eq(users.active_session_token, token))
    .limit(1);

  if (foundUsers.length === 0) return null;
  return foundUsers[0];
}
