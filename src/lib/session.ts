import { cookies, headers } from "next/headers";
import { redirect, unstable_rethrow } from "next/navigation";
import { cache } from "react";
import type { Role, User } from "./types";
import { AppError } from "./util";
import { SESSION_COOKIE, SESSION_TTL, getSessionUser } from "./core/users";

/** المستخدم الحالي من كوكي الجلسة (HttpOnly). */
export const currentUser = cache(async (): Promise<User | null> => {
  const jar = await cookies();
  return getSessionUser(jar.get(SESSION_COOKIE)?.value);
});

export async function requireUser(roles?: Role[]): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (roles && !roles.includes(u.role)) redirect(homeFor(u));
  return u;
}

export const requireOrganizer = () => requireUser(["organizer"]);
export const requireAdmin = () => requireUser(["admin"]);

export function homeFor(u: Pick<User, "role">) {
  return u.role === "admin" ? "/admin" : u.role === "staff" ? "/checkin" : "/dashboard";
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !(process.env.APP_URL || "").startsWith("http://"),
    path: "/",
    maxAge: Math.floor(SESSION_TTL / 1000),
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for") || "").split(",")[0].trim() || h.get("x-real-ip") || "local";
}

/**
 * حماية CSRF إضافية فوق فحص Next.js المدمج للأصل (Origin) في Server Actions:
 * نرفض الطلبات التي يصرّح المتصفح بأنها من موقع آخر.
 */
export async function assertSameOrigin() {
  const h = await headers();
  const site = h.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new AppError("csrf", "طلب مرفوض (مصدر غير موثوق)", 403);
  const origin = h.get("origin");
  const host = h.get("x-forwarded-host") || h.get("host");
  if (origin && host) {
    try {
      const o = new URL(origin).host;
      const allowed = new Set([host, ...allowedOrigins()]);
      if (!allowed.has(o)) throw new AppError("csrf", "طلب مرفوض (مصدر غير موثوق)", 403);
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError("csrf", "طلب مرفوض", 403);
    }
  }
}

export function allowedOrigins(): string[] {
  const out: string[] = [];
  for (const v of [process.env.APP_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`]) {
    if (!v) continue;
    try {
      out.push(new URL(v).host);
    } catch {}
  }
  return out;
}

export type ActionResult<T = unknown> = { ok: true; message?: string; data?: T } | { ok: false; error: string };

/** غلاف موحّد لإجراءات الخادم: يتحقق من المصدر، ويحوّل أخطاء المنتج لرسالة عربية. */
export async function act<T>(fn: () => Promise<ActionResult<T> | void>): Promise<ActionResult<T>> {
  try {
    await assertSameOrigin();
    const r = await fn();
    return r ?? { ok: true };
  } catch (e) {
    unstable_rethrow(e);
    if (e instanceof AppError) return { ok: false, error: e.message };
    console.error(e);
    return { ok: false, error: "حدث خطأ غير متوقع. حاول مرة أخرى." };
  }
}

export const isDemo = () => process.env.DEMO_MODE === "true" || (process.env.NODE_ENV !== "production" && process.env.DEMO_MODE !== "false");
