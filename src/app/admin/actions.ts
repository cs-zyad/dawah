"use server";

import { revalidatePath } from "next/cache";
import { act, requireAdmin, type ActionResult } from "@/lib/session";
import { AppError, riyalsToHalalas, formatSAR, randomToken } from "@/lib/util";
import type { LayoutKey } from "@/lib/types";
import { setUserSuspended } from "@/lib/core/users";
import { adjustCredit } from "@/lib/core/credit";
import { createTemplate, updateTemplate, setTemplateVisible, type TemplateInput } from "@/lib/core/templates";
import { sendQuote, rejectDesign, startDesignWork, deliverDesign, addDesignMessage } from "@/lib/core/designs";
import { replySupport, type SupportStatus } from "@/lib/core/support";
import { updateSettings, getSettings } from "@/lib/core/settings";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export async function suspendAction(userId: string, suspend: boolean, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async () => {
    const a = await requireAdmin();
    if (userId === a.id) throw new AppError("self", "لا يمكنك إيقاف حسابك");
    await setUserSuspended(a.id, userId, suspend, s(fd, "reason"));
    revalidatePath("/admin/users");
    return { ok: true, message: suspend ? "أُوقف الحساب وأُنهيت جلساته" : "فُعّل الحساب" };
  });
}

export async function adjustCreditAction(userId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async () => {
    const a = await requireAdmin();
    const sign = s(fd, "direction") === "debit" ? -1 : 1;
    const amount = riyalsToHalalas(s(fd, "amount"));
    if (!amount) throw new AppError("validation", "أدخل مبلغًا صحيحًا");
    const r = await adjustCredit(a.id, userId, sign * amount, s(fd, "reason"), s(fd, "idemKey") || randomToken());
    revalidatePath("/admin/users");
    return { ok: true, message: r.duplicate ? "سبق تنفيذ هذه التسوية" : `تمت التسوية. الرصيد الآن ${formatSAR(r.entry.balanceAfter)}` };
  });
}

function templateInput(fd: FormData): TemplateInput {
  return {
    layout: s(fd, "layout") as LayoutKey,
    name: s(fd, "name"),
    category: s(fd, "category"),
    colors: [0, 1, 2, 3, 4].map((i) => s(fd, `c${i}`)),
    visible: fd.get("visible") === "on",
    order: Number(s(fd, "order") || 99),
  };
}

export async function saveTemplateAction(id: string | null, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async () => {
    const a = await requireAdmin();
    if (id) await updateTemplate(a.id, id, templateInput(fd));
    else await createTemplate(a.id, templateInput(fd));
    revalidatePath("/admin/templates");
    return { ok: true, message: "حُفظ القالب" };
  });
}

export async function toggleTemplateAction(id: string, visible: boolean, _: ActionResult | null): Promise<ActionResult> {
  return act(async () => {
    const a = await requireAdmin();
    await setTemplateVisible(a.id, id, visible);
    revalidatePath("/admin/templates");
  });
}

export async function designAdminAction(id: string, op: "quote" | "reject" | "start" | "deliver" | "message", _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async () => {
    const a = await requireAdmin();
    if (op === "quote") {
      const amount = riyalsToHalalas(s(fd, "amount"));
      if (!amount) throw new AppError("validation", "أدخل المبلغ");
      await sendQuote(a.id, id, { amount, notes: s(fd, "notes"), validDays: Number(s(fd, "validDays") || 7) });
    }
    if (op === "reject") await rejectDesign(a.id, id, s(fd, "reason"));
    if (op === "start") await startDesignWork(a.id, id);
    if (op === "deliver") {
      const t = templateInput(fd);
      await deliverDesign(a.id, id, { layout: t.layout, name: t.name, category: t.category || "خاص", colors: t.colors, order: 0 });
    }
    if (op === "message") await addDesignMessage(a, id, s(fd, "body"));
    revalidatePath(`/admin/designs/${id}`);
    return { ok: true, message: op === "message" ? undefined : "تم" };
  });
}

export async function supportAdminAction(id: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async () => {
    const a = await requireAdmin();
    const st = s(fd, "status");
    await replySupport(a, id, s(fd, "body"), (["open", "in_progress", "resolved", "closed"].includes(st) ? st : undefined) as SupportStatus | undefined);
    revalidatePath(`/admin/support/${id}`);
    return { ok: true, message: "تم الحفظ" };
  });
}

export async function settingsAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async () => {
    const a = await requireAdmin();
    const cur = await getSettings();
    const money = (k: string) => {
      const v = riyalsToHalalas(s(fd, k));
      if (v === null) throw new AppError("validation", `قيمة غير صالحة: ${k}`);
      return v;
    };
    const int = (k: string, min: number, max: number) => {
      const v = Number(s(fd, k));
      if (!Number.isInteger(v) || v < min || v > max) throw new AppError("validation", `قيمة غير صالحة (${min}–${max})`);
      return v;
    };
    const packages = cur.pricing.packages.map((_, i) => ({ places: int(`pk${i}_places`, 1, 100000), price: money(`pk${i}_price`) }));
    const sorted = [...packages].sort((x, y) => x.places - y.places);
    if (new Set(sorted.map((p) => p.places)).size !== sorted.length) throw new AppError("validation", "أحجام الباقات يجب أن تكون مختلفة");
    await updateSettings(a.id, {
      pricing: {
        demo: fd.get("demo") === "on",
        packages: sorted,
        extraPlacePrice: money("extraPlacePrice"),
        messagePrice: { whatsapp: money("wa"), email: money("em") },
        confirmationOpCost: { whatsapp: money("opWa"), email: money("opEm") },
      },
      policies: {
        insufficientCredit: s(fd, "insufficientCredit") === "partial" ? "partial" : "block",
        maxAttempts: int("maxAttempts", 1, 10),
        retryBaseSeconds: int("retryBaseSeconds", 0, 3600),
        waitlistOfferHours: int("waitlistOfferHours", 1, 336),
        ticketResendMinMinutes: int("ticketResendMinMinutes", 0, 1440),
        staffInviteDays: int("staffInviteDays", 1, 30),
      },
    });
    revalidatePath("/admin/settings");
    return { ok: true, message: "حُفظت الإعدادات وسُجّلت في سجل التدقيق" };
  });
}
