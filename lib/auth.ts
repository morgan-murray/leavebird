import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { query } from "./db";

const COOKIE_NAME = "clocked_off_session";
const SESSION_DAYS = 30;
const secureCookie = () => process.env.NODE_ENV === "production" && process.env.COOKIE_SECURE !== "false";

type User = { id: string; email: string };

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, expectedHex] = stored.split(":");
  if (!salt || !expectedHex) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [tokenHash(token), userId, expires]);
  const jar = await cookies();
  jar.set(COOKIE_NAME, token, { httpOnly: true, sameSite: "lax", secure: secureCookie(), path: "/", expires });
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;
  const result = await query<User>(`SELECT users.id, users.email FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = $1 AND sessions.expires_at > NOW()`, [tokenHash(token)]);
  return result.rows[0] ?? null;
}

export async function requireUser() {
  return currentUser();
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE_NAME)?.value;
  if (token) await query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash(token)]);
  jar.set(COOKIE_NAME, "", { httpOnly: true, sameSite: "lax", secure: secureCookie(), path: "/", maxAge: 0 });
}
