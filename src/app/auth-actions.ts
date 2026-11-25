"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { act, assertSameOrigin, clearSessionCookie, clientIp, homeFor, setSessionCookie, type ActionResult } from "@/lib/session";
import { completeSetup, createSession, createUser, destroySession, login, rateLimit, SESSION_COOKIE, validatePasswordStrength, getSessionUser } from "@/lib/core/users";
import { AppError } from "@/lib/util";

export async function loginAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let dest = "/dashboard";
  const r = await act(async () => {
    const { user, token } = await login(String(fd.get("email") || ""), String(fd.get("password") || ""), await clientIp());
    await setSessionCookie(token);
    const next = String(fd.get("next") || "");
    dest = next.startsWith("/") && !next.startsWith("//") ? next : homeFor(user);
  });
  if (r.ok) redirect(dest);
  return r;
}

export async function registerAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  const r = await act(async () => {
    const ok = await rateLimit(`register:${await clientIp()}`, 10, 60 * 60 * 1000);
    if (!ok) throw new AppError("rate_limited", "محاولات كثيرة. حاول لاحقًا.");
    const password = String(fd.get("password") || "");
    const err = validatePasswordStrength(password);
    if (err) throw new AppError("weak", err);
    const user = await createUser({ email: String(fd.get("email") || ""), name: String(fd.get("name") || ""), role: "organizer", password });
    const s = await createSession(user.id);
    await setSessionCookie(s.token);
  });
  if (r.ok) redirect("/dashboard");
  return r;
}

export async function logoutAction() {
  await assertSameOrigin();
  const jar = await cookies();
  const t = jar.get(SESSION_COOKIE)?.value;
  if (t) await destroySession(t);
  await clearSessionCookie();
  redirect("/login");
}

export async function setPasswordAction(token: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let dest = "/checkin";
  const r = await act(async () => {
    const p1 = String(fd.get("password") || "");
    if (p1 !== String(fd.get("password2") || "")) throw new AppError("mismatch", "كلمتا المرور غير متطابقتين");
    const s = await completeSetup(token, p1);
    await setSessionCookie(s.token);
    const u = await getSessionUser(s.token);
    if (u) dest = homeFor(u);
  });
  if (r.ok) redirect(dest);
  return r;
}
