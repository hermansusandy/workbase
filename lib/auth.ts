import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { ensureDatabase, sql } from "./postgres";

const COOKIE = "workbase_session";

function passwordHash(password: string, salt = randomBytes(16).toString("hex")) {
  const derived = pbkdf2Sync(password, salt, 210_000, 32, "sha256").toString("hex");
  return `${salt}:${derived}`;
}

function passwordMatches(password: string, stored: string) {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = passwordHash(password, salt).split(":")[1];
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function seedAdmin() {
  await ensureDatabase();
  const email = process.env.WORKBASE_ADMIN_EMAIL || "master@workbase.id";
  const password = process.env.WORKBASE_ADMIN_PASSWORD;
  if (!password || password === "CHANGE_ADMIN_PASSWORD") {
    throw new Error("WORKBASE_ADMIN_PASSWORD must be configured");
  }
  const db = sql();
  const existing = await db`SELECT id FROM workbase_users WHERE email = ${email}`;
  if (!existing.length) {
    await db`INSERT INTO workbase_users (email, password_hash) VALUES (${email}, ${passwordHash(password)})`;
  }
}

export async function login(email: string, password: string) {
  await seedAdmin();
  const db = sql();
  const users = await db`SELECT id, email, password_hash FROM workbase_users WHERE lower(email) = lower(${email}) LIMIT 1`;
  const user = users[0];
  if (!user || !passwordMatches(password, String(user.password_hash))) return null;
  const token = randomBytes(32).toString("base64url");
  await db`INSERT INTO workbase_sessions (token_hash, user_id, expires_at) VALUES (${tokenHash(token)}, ${user.id}, now() + interval '30 days')`;
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.WORKBASE_SECURE_COOKIES === "true",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return { email: String(user.email) };
}

export async function currentUser() {
  await ensureDatabase();
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const db = sql();
  const users = await db`
    SELECT u.email FROM workbase_sessions s
    JOIN workbase_users u ON u.id = s.user_id
    WHERE s.token_hash = ${tokenHash(token)} AND s.expires_at > now()
    LIMIT 1
  `;
  return users[0] ? { email: String(users[0].email) } : null;
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await ensureDatabase();
    await sql()`DELETE FROM workbase_sessions WHERE token_hash = ${tokenHash(token)}`;
  }
  jar.delete(COOKIE);
}
