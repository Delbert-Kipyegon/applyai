import { randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { ensureIndexes, getDb } from "./mongodb";
import { hashValue } from "./security";

export const ADMIN_COOKIE = "boltiply_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

export function isAdminPasswordValid(password: string) {
  const configured = process.env.ADMIN_PASSWORD;

  if (!configured) return false;

  const providedBuffer = Buffer.from(password);
  const configuredBuffer = Buffer.from(configured);

  if (providedBuffer.length !== configuredBuffer.length) return false;
  return timingSafeEqual(providedBuffer, configuredBuffer);
}

export async function createAdminSession() {
  await ensureIndexes();
  const db = await getDb();
  const token = randomBytes(32).toString("hex");
  const tokenHash = hashAdminToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

  await db.collection("admin_sessions").insertOne({
    tokenHash,
    createdAt: new Date(),
    expiresAt,
  });

  return { token, expiresAt };
}

export async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE)?.value;

  if (!token) return null;

  try {
    await ensureIndexes();
    const db = await getDb();
    return db.collection("admin_sessions").findOne({
      tokenHash: hashAdminToken(token),
      expiresAt: { $gt: new Date() },
    });
  } catch {
    return null;
  }
}

export function hashAdminToken(token: string) {
  return hashValue(`${process.env.ADMIN_SESSION_SECRET || "dev-secret"}:${token}`);
}
