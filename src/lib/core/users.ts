import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db, C, runTx } from "../db";
import type { Role, User } from "../types";
import { AppError, normalizeEmail, randomToken, sha256, DAY } from "../util";
import { audit } from "./audit";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(pw, salt, 64, SCRYPT);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string | undefined): Promise<boolean> {
  if (!stored) return false;
  const [alg, n, r, p, saltB64, keyB64] = stored.split("$");
  if (alg !== "scrypt") return false;
  const key = Buffer.from(keyB64, "base64");
  const derived = await scryptAsync(pw, Buffer.from(saltB64, "base64"), key.length, { N: +n, r: +r, p: +p, maxmem: SCRYPT.maxmem });
  return derived.length === key.length && timingSafeEqual(derived, key);
}

export function validatePasswordStrength(pw: string): string | null {
  if (pw.length < 8) return "كلمة المرور يجب ألا تقل عن 8 أحرف";
  if (pw.length > 200) return "كلمة المرور طويلة جدًا";
  return null;
}

const emailKey = (email: string) => `email:${email}`;

export async function getUser(id: string): Promise<User | null> {
  const s = await db().collection(C.users).doc(id).get();
  return s.exists ? (s.data() as User) : null;
}

export async function findUserByEmail(emailRaw: string): Promise<User | null> {
  const email = normalizeEmail(emailRaw);
  if (!email) return null;
  const u = await db().collection(C.uniques).doc(emailKey(email)).get();
  if (!u.exists) return null;
  return getUser(u.data()!.ref as string);
}

/** ينشئ مستخدمًا مع قيد فريد على البريد داخل معاملة. */
export async function createUser(input: { email: string; name: string; role: Role; password?: string; status?: User["status"] }): Promise<User> {
  const email = normalizeEmail(input.email);
  if (!email) throw new AppError("invalid_email", "البريد الإلكتروني غير صالح");
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new AppError("invalid_name", "الاسم مطلوب");
  const passwordHash = input.password ? await hashPassword(input.password) : undefined;
  const ref = db().collection(C.users).doc();
  const uniqRef = db().collection(C.uniques).doc(emailKey(email));
  const user: User = {
    id: ref.id,
    email,
    name,
    role: input.role,
    status: input.status ?? (passwordHash ? "active" : "invited"),
    passwordHash,
    creditBalance: 0,
    createdAt: Date.now(),
  };
  await runTx(async (tx) => {
    const u = await tx.get(uniqRef);
    if (u.exists) throw new AppError("email_taken", "هذا البريد مسجّل مسبقًا");
    tx.set(uniqRef, { kind: "email", ref: ref.id });
    tx.set(ref, user);
  });
  return user;
}

/* ======================== الجلسات ======================== */

export const SESSION_COOKIE = "wafda_session";
export const SESSION_TTL = 14 * DAY;

/** ينشئ جلسة: الرمز يُعطى للمتصفح، وتُخزن بصمته فقط. */
export async function createSession(userId: string): Promise<{ token: string; expiresAt: number }> {
  const token = randomToken(32);
  const expiresAt = Date.now() + SESSION_TTL;
  await db().collection(C.sessions).doc(sha256(token)).set({ userId, expiresAt, createdAt: Date.now() });
  return { token, expiresAt };
}

export async function getSessionUser(token: string | undefined | null): Promise<User | null> {
  if (!token || token.length > 100) return null;
  const s = await db().collection(C.sessions).doc(sha256(token)).get();
  if (!s.exists) return null;
  const d = s.data()!;
  if (d.expiresAt < Date.now()) return null;
  const u = await getUser(d.userId);
  if (!u || u.status !== "active") return null;
  return u;
}

export async function destroySession(token: string) {
  await db().collection(C.sessions).doc(sha256(token)).delete();
}

export async function destroyAllSessions(userId: string) {
  const qs = await db().collection(C.sessions).where("userId", "==", userId).get();
  const b = db().batch();
  qs.docs.forEach((d) => b.delete(d.ref));
  if (qs.size) await b.commit();
}

/* ======================== حد المحاولات ======================== */

/** نافذة ثابتة لكل مفتاح؛ يعيد false إن تجاوز الحد. */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const ref = db().collection(C.rateLimits).doc(sha256(key));
  return runTx(async (tx) => {
    const s = await tx.get(ref);
    const t = Date.now();
    const d = s.data();
    if (!d || d.windowStart + windowMs < t) {
      tx.set(ref, { count: 1, windowStart: t, expiresAt: t + windowMs });
      return true;
    }
    if (d.count >= limit) return false;
    tx.update(ref, { count: d.count + 1 });
    return true;
  });
}

/* ======================== تسجيل الدخول ======================== */

export async function login(emailRaw: string, password: string, ip: string): Promise<{ user: User; token: string; expiresAt: number }> {
  const email = normalizeEmail(emailRaw) || "";
  const okIp = await rateLimit(`login-ip:${ip}`, 30, 15 * 60 * 1000);
  const okEmail = await rateLimit(`login-email:${email}`, 10, 15 * 60 * 1000);
  if (!okIp || !okEmail) throw new AppError("rate_limited", "محاولات كثيرة. حاول بعد 15 دقيقة.", 429);
  const user = await findUserByEmail(email);
  const valid = await verifyPassword(password, user?.passwordHash);
  if (!user || !valid) throw new AppError("bad_credentials", "البريد أو كلمة المرور غير صحيحة");
  if (user.status === "suspended") throw new AppError("suspended", "هذا الحساب موقوف. تواصل مع الدعم.");
  if (user.status !== "active") throw new AppError("inactive", "الحساب غير مفعّل بعد. استخدم رابط إنشاء كلمة المرور.");
  const s = await createSession(user.id);
  return { user, ...s };
}

/* ======================== روابط إنشاء كلمة المرور ======================== */

export async function createSetupToken(userId: string, days: number): Promise<string> {
  const token = randomToken(24);
  await db().collection(C.setupTokens).doc(sha256(token)).set({ userId, expiresAt: Date.now() + days * DAY, usedAt: null, createdAt: Date.now() });
  return token;
}

export async function inspectSetupToken(token: string) {
  const s = await db().collection(C.setupTokens).doc(sha256(token)).get();
  if (!s.exists) return { ok: false as const, reason: "الرابط غير صالح" };
  const d = s.data()!;
  if (d.usedAt) return { ok: false as const, reason: "استُخدم هذا الرابط مسبقًا" };
  if (d.expiresAt < Date.now()) return { ok: false as const, reason: "انتهت صلاحية الرابط" };
  const user = await getUser(d.userId);
  if (!user) return { ok: false as const, reason: "الحساب غير موجود" };
  return { ok: true as const, user };
}

/** يستهلك الرابط مرة واحدة فقط (داخل معاملة). */
export async function completeSetup(token: string, password: string) {
  const err = validatePasswordStrength(password);
  if (err) throw new AppError("weak_password", err);
  const hash = await hashPassword(password);
  const ref = db().collection(C.setupTokens).doc(sha256(token));
  const userId = await runTx(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) throw new AppError("invalid_token", "الرابط غير صالح");
    const d = s.data()!;
    if (d.usedAt) throw new AppError("used_token", "استُخدم هذا الرابط مسبقًا");
    if (d.expiresAt < Date.now()) throw new AppError("expired_token", "انتهت صلاحية الرابط");
    const uref = db().collection(C.users).doc(d.userId);
    const u = await tx.get(uref);
    if (!u.exists) throw new AppError("invalid_token", "الحساب غير موجود");
    if ((u.data() as User).status === "suspended") throw new AppError("suspended", "هذا الحساب موقوف");
    tx.update(ref, { usedAt: Date.now() });
    tx.update(uref, { passwordHash: hash, status: "active" });
    return d.userId as string;
  });
  return createSession(userId);
}

/* ======================== إدارة الحسابات (أدمن) ======================== */

export async function setUserSuspended(actorId: string, userId: string, suspended: boolean, reason: string) {
  const u = await getUser(userId);
  if (!u) throw new AppError("not_found", "الحساب غير موجود", 404);
  if (u.role === "admin" && suspended) throw new AppError("forbidden", "لا يمكن إيقاف حساب أدمن");
  await db().collection(C.users).doc(userId).update({ status: suspended ? "suspended" : u.passwordHash ? "active" : "invited" });
  if (suspended) await destroyAllSessions(userId);
  await audit(actorId, suspended ? "user.suspend" : "user.activate", `users/${userId}`, { reason });
}
