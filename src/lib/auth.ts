import "server-only";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "./db";

const SESSION_COOKIE = "bl_session";
const SESSION_DAYS = 7;

// ───────────── Passwords ─────────────

export { passwordProblems, passwordError } from "./password";

export const hashPassword = (password: string) => bcrypt.hash(password, 10);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

// ───────────── Tokens ─────────────

export function randomToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// ───────────── Sessions ─────────────

export async function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.session.create({ data: { id: sha256(token), userId, expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { id: sha256(token) },
    include: { user: { include: { customer: true } } },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  return session.user;
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Require a logged-in user with one of the given roles; otherwise redirect. */
export async function requireUser(roles?: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (roles && !roles.includes(user.role)) {
    redirect(user.role === "CUSTOMER" ? "/portal" : "/app");
  }
  return user;
}

export const requireBackoffice = () => requireUser(["ADMIN", "STAFF"]);
export const requireAdmin = () => requireUser(["ADMIN"]);

export async function requireCustomer() {
  const user = await requireUser(["CUSTOMER"]);
  if (!user.customer) redirect("/login");
  return user as CurrentUser & { customer: NonNullable<CurrentUser["customer"]> };
}

export function homeFor(role: Role) {
  return role === "CUSTOMER" ? "/portal" : "/app";
}
