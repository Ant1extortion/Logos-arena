import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ensureTablesExist } from "@/db/init";
import {
  hashPasscode,
  verifyPasscode,
  generateSessionToken,
  SESSION_COOKIE_NAME,
  getAuthenticatedUser,
} from "@/lib/auth";

export async function GET(req: NextRequest) {
  try {
    await ensureTablesExist();
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized or session expired" },
        { status: 401 }
      );
    }

    const { passcode_hash: _hash, ...safeUser } = user;
    void _hash;
    return NextResponse.json({ user: safeUser }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureTablesExist();
    const body = await req.json();
    const { action, email, display_name, passcode, device_hash } = body;

    if (action === "logout") {
      const user = await getAuthenticatedUser(req);
      if (user) {
        await db
          .update(users)
          .set({ active_session_token: null })
          .where(eq(users.id, user.id));
      }

      const res = NextResponse.json(
        { message: "Logged out successfully" },
        { status: 200 }
      );
      res.cookies.set(SESSION_COOKIE_NAME, "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
      return res;
    }

    if (action === "signup") {
      if (!email || !display_name || !passcode) {
        return NextResponse.json(
          { error: "Email, display_name, and passcode are required" },
          { status: 400 }
        );
      }

      const normalizedEmail = email.trim().toLowerCase();
      const existing = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (existing.length > 0) {
        return NextResponse.json(
          { error: "A user with this email already exists" },
          { status: 409 }
        );
      }

      const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const sessionToken = generateSessionToken();
      const passcodeH = hashPasscode(passcode);
      const now = new Date().toISOString();

      const [newUser] = await db
        .insert(users)
        .values({
          id: userId,
          email: normalizedEmail,
          display_name: display_name.trim(),
          passcode_hash: passcodeH,
          tier: "FREE",
          active_session_token: sessionToken,
          device_hash: device_hash || null,
          debates_used_this_month: 0,
          studio_scans_used_this_month: 0,
          verified_wins: 0,
          avg_integrity_score: 100,
          created_at: now,
        })
        .returning();

      const { passcode_hash: _hash, ...safeUser } = newUser;
      void _hash;
      const res = NextResponse.json(
        { user: safeUser, sessionToken },
        { status: 201 }
      );

      res.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });

      return res;
    }

    if (action === "login") {
      if (!email || !passcode) {
        return NextResponse.json(
          { error: "Email and passcode are required" },
          { status: 400 }
        );
      }

      const normalizedEmail = email.trim().toLowerCase();
      const found = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (found.length === 0) {
        return NextResponse.json(
          { error: "Invalid email or passcode" },
          { status: 401 }
        );
      }

      const user = found[0];
      if (!verifyPasscode(passcode, user.passcode_hash)) {
        return NextResponse.json(
          { error: "Invalid email or passcode" },
          { status: 401 }
        );
      }

      // Generate a new active session token, invalidating any concurrent login on another device
      const newSessionToken = generateSessionToken();
      const updateData: { active_session_token: string; device_hash?: string } = {
        active_session_token: newSessionToken,
      };
      if (device_hash) {
        updateData.device_hash = device_hash;
      }

      await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, user.id));

      const { passcode_hash: _hash, ...safeUser } = user;
      void _hash;
      safeUser.active_session_token = newSessionToken;
      if (device_hash) safeUser.device_hash = device_hash;

      const res = NextResponse.json(
        { user: safeUser, sessionToken: newSessionToken },
        { status: 200 }
      );

      res.cookies.set(SESSION_COOKIE_NAME, newSessionToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30, // 30 days
      });

      return res;
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'signup', 'login', or 'logout'" },
      { status: 400 }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
