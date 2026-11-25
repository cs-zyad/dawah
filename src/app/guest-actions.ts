"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { act, clientIp, type ActionResult } from "@/lib/session";
import { confirmInvitation, confirmRegistration, declineByManageToken, declineInvitation, registerPublic, type ConfirmResult } from "@/lib/core/rsvp";
import { rateLimit } from "@/lib/core/users";
import { AppError } from "@/lib/util";

const opts = (fd: FormData) => ({ acceptSingle: fd.get("acceptSingle") === "1", joinWaitlist: fd.get("joinWaitlist") === "1" });

export async function confirmInvitationAction(token: string, _: ActionResult<ConfirmResult> | null, fd: FormData): Promise<ActionResult<ConfirmResult>> {
  return act(async () => {
    const ok = await rateLimit(`rsvp:${await clientIp()}`, 60, 10 * 60 * 1000);
    if (!ok) throw new AppError("rate_limited", "محاولات كثيرة. حاول بعد دقائق.");
    const r = await confirmInvitation(
      token,
      { name: String(fd.get("name") || ""), contactType: String(fd.get("contactType") || ""), contact: String(fd.get("contact") || ""), withCompanion: fd.get("withCompanion") === "on" },
      opts(fd),
    );
    revalidatePath(`/i/${token}`);
    return { ok: true, data: r };
  });
}

export async function declineInvitationAction(token: string, _: ActionResult | null): Promise<ActionResult> {
  return act(async () => {
    await declineInvitation(token);
    revalidatePath(`/i/${token}`);
    return { ok: true, message: "تم تسجيل اعتذارك. يمكنك التأكيد لاحقًا إن توفر مقعد." };
  });
}

export async function registerPublicAction(slug: string, _: ActionResult<ConfirmResult> | null, fd: FormData): Promise<ActionResult<ConfirmResult>> {
  let dest: string | null = null;
  const r = await act<ConfirmResult>(async () => {
    const ip = await clientIp();
    const ok = (await rateLimit(`pub:${ip}`, 20, 10 * 60 * 1000)) && (await rateLimit(`pub:${slug}:${ip}`, 10, 10 * 60 * 1000));
    if (!ok) throw new AppError("rate_limited", "محاولات تسجيل كثيرة من هذا الجهاز. حاول بعد دقائق.");
    const res = await registerPublic(slug, String(fd.get("idemKey") || ""), { name: String(fd.get("name") || ""), contactType: String(fd.get("contactType") || ""), contact: String(fd.get("contact") || "") }, opts(fd));
    if (res.status === "confirmed" || res.status === "waitlisted" || res.status === "declined") dest = `/r/${res.manageToken}`;
    return { ok: true, data: res };
  });
  if (dest) redirect(dest);
  return r;
}

export async function confirmRegistrationAction(token: string, _: ActionResult<ConfirmResult> | null, fd: FormData): Promise<ActionResult<ConfirmResult>> {
  return act(async () => {
    const r = await confirmRegistration(token, opts(fd));
    revalidatePath(`/r/${token}`);
    return { ok: true, data: r };
  });
}

export async function declineRegistrationAction(token: string, _: ActionResult | null): Promise<ActionResult> {
  return act(async () => {
    await declineByManageToken(token);
    revalidatePath(`/r/${token}`);
    return { ok: true, message: "تم تسجيل اعتذارك وتحرير مقعدك." };
  });
}
