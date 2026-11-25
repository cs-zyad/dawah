"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { act, requireOrganizer, type ActionResult } from "@/lib/session";
import { AppError, riyadhLocalToMs, riyalsToHalalas, formatSAR } from "@/lib/util";
import type { ChannelMode } from "@/lib/types";
import { createEvent, updateEvent, cancelEvent, setEventTemplate, type EventInput } from "@/lib/core/events";
import { addInvitations, updateInvitation, deleteInvitation } from "@/lib/core/invitations";
import { parseSpreadsheet, previewImport, commitImport, type RawRow, type ClassifiedRow } from "@/lib/core/importer";
import { sendToInvitations, estimateSend, scheduleReminder, cancelReminder } from "@/lib/core/sending";
import { cancelRegistrationByOrganizer, resendTicketByOrganizer, offerWaitlistSpot } from "@/lib/core/rsvp";
import { createPackagePayment, createExtraPlacesPayment, createTopupPayment } from "@/lib/core/payments";
import { addStaff, removeStaff } from "@/lib/core/staff";
import { createDesignRequest, acceptQuote, payDesign, cancelDesign, addDesignMessage } from "@/lib/core/designs";
import { createSupportTicket, replySupport } from "@/lib/core/support";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const ev = (id: string) => `/dashboard/events/${id}`;

function eventInput(fd: FormData): EventInput {
  return {
    title: s(fd, "title"),
    orgName: s(fd, "orgName"),
    description: s(fd, "description"),
    startLocal: s(fd, "startLocal"),
    endLocal: s(fd, "endLocal"),
    venue: s(fd, "venue"),
    address: s(fd, "address"),
    mapUrl: s(fd, "mapUrl"),
    maxAttendees: s(fd, "maxAttendees") as unknown as number,
    type: s(fd, "type") as "private" | "public",
    fullPolicy: s(fd, "fullPolicy") as "close" | "waitlist",
  };
}

/* ===================== الفعالية ===================== */

export async function createEventAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let id = "";
  const r = await act(async () => {
    const u = await requireOrganizer();
    const e = await createEvent(u.id, eventInput(fd));
    id = e.id;
  });
  if (r.ok) redirect(`${ev(id)}/template`);
  return r;
}

export async function updateEventAction(eventId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async () => {
    const u = await requireOrganizer();
    await updateEvent(u.id, eventId, eventInput(fd));
    revalidatePath(ev(eventId), "layout");
    return { ok: true, message: "تم حفظ البيانات" };
  });
}

export async function cancelEventAction(eventId: string, _: ActionResult | null): Promise<ActionResult> {
  return act(async () => {
    const u = await requireOrganizer();
    await cancelEvent(u.id, eventId);
    revalidatePath(ev(eventId), "layout");
    return { ok: true, message: "أُلغيت الفعالية" };
  });
}

export async function chooseTemplateAction(eventId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async () => {
    const u = await requireOrganizer();
    await setEventTemplate(u.id, eventId, s(fd, "templateId"));
    revalidatePath(ev(eventId), "layout");
    return { ok: true, message: "تم اختيار القالب" };
  });
}

/* ===================== المدعوون ===================== */

export async function addInvitationAction(eventId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async () => {
    const u = await requireOrganizer();
    await addInvitations(u.id, eventId, [{ name: s(fd, "name"), phone: s(fd, "phone"), email: s(fd, "email"), allowCompanion: fd.get("allowCompanion") === "on" }]);
    revalidatePath(ev(eventId), "layout");
    return { ok: true, message: "أُضيف المدعو" };
  });
}

export async function updateInvitationAction(eventId: string, invId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async () => {
    const u = await requireOrganizer();
    const mode = s(fd, "channelOverride");
    await updateInvitation(u.id, invId, {
      name: s(fd, "name"),
      phone: s(fd, "phone"),
      email: s(fd, "email"),
      allowCompanion: fd.get("allowCompanion") === "on",
      channelOverride: (["whatsapp", "email", "both"].includes(mode) ? mode : null) as ChannelMode | null,
    });
    revalidatePath(ev(eventId), "layout");
    return { ok: true, message: "تم التعديل" };
  });
}

export async function deleteInvitationAction(eventId: string, invId: string, _: ActionResult | null): Promise<ActionResult> {
  return act(async () => {
    const u = await requireOrganizer();
    await deleteInvitation(u.id, invId);
    revalidatePath(ev(eventId), "layout");
    return { ok: true, message: "حُذفت الدعوة" };
  });
}

export async function parseImportAction(eventId: string, _: ActionResult<ClassifiedRow[]> | null, fd: FormData): Promise<ActionResult<ClassifiedRow[]>> {
  return act(async () => {
    const u = await requireOrganizer();
    const file = fd.get("file");
    if (!(file instanceof File) || !file.size) throw new AppError("validation", "اختر ملفًا");
    if (file.size > 4 * 1024 * 1024) throw new AppError("validation", "حجم الملف أكبر من 4 ميجابايت");
    const rows = await parseSpreadsheet(Buffer.from(await file.arrayBuffer()), file.name);
    return { ok: true, data: await previewImport(u.id, eventId, rows) };
  });
}

export async function recheckImportAction(eventId: string, rows: RawRow[]): Promise<ActionResult<ClassifiedRow[]>> {
  return act(async () => {
    const u = await requireOrganizer();
    return { ok: true, data: await previewImport(u.id, eventId, rows) };
  });
}

export async function commitImportAction(eventId: string, rows: RawRow[]): Promise<ActionResult<{ added: number; skipped: number }>> {
  return act(async () => {
    const u = await requireOrganizer();
    const r = await commitImport(u.id, eventId, rows);
    revalidatePath(ev(eventId), "layout");
    return { ok: true, data: r, message: `أُضيف ${r.added} مدعوًا${r.skipped ? `، واستُبعد ${r.skipped} صفًا` : ""}` };
  });
}

/* ===================== الإرسال والتذكيرات ===================== */

function sendParams(fd: FormData) {
  const mode = (s(fd, "mode") || "both") as ChannelMode;
  const kind = s(fd, "kind") === "reminder" ? "reminder" : "invitation";
  const ids = fd.getAll("ids").map(String).filter(Boolean);
  return { mode, kind: kind as "invitation" | "reminder", ids: ids.length ? ids : undefined };
}

export async function estimateAction(eventId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async () => {
    const u = await requireOrganizer();
    const p = sendParams(fd);
    const e = await estimateSend(u.id, eventId, p.kind, p.mode, p.ids);
    return {
      ok: true,
      message: `${e.recipients} مدعو — ${e.messages} رسالة (واتساب ${e.byChannel.whatsapp}، بريد ${e.byChannel.email}) بتكلفة ${formatSAR(e.cost)}. رصيدك ${formatSAR(e.balance)}${e.enough ? "." : " — غير كافٍ."}`,
    };
  });
}

export async function sendAction(eventId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async () => {
    const u = await requireOrganizer();
    const p = sendParams(fd);
    const r = await sendToInvitations({ ownerId: u.id, eventId, kind: p.kind, mode: p.mode, invitationIds: p.ids, idemKey: s(fd, "idemKey") });
    revalidatePath(ev(eventId), "layout");
    if (r.status === "insufficient") throw new AppError("insufficient", `رصيد الرسائل غير كافٍ: المطلوب ${formatSAR(r.needed)} والرصيد ${formatSAR(r.balance)}. لم يُرسل شيء ولم يُخصم شيء.`);
    if (r.status === "nothing") return { ok: true, message: r.skipped.length ? `لا يوجد من يمكن الإرسال له (${r.skipped.map((x) => `${x.name}: ${x.reason}`).join("، ")})` : "لا يوجد من يحتاج الإرسال" };
    const failed = Object.values(r.results || {}).filter((x) => x === "failed").length;
    return {
      ok: true,
      message: `${r.duplicate ? "سبق تنفيذ هذا الإرسال — " : ""}أُرسلت ${r.messages} رسالة بتكلفة ${formatSAR(r.cost)}. الرصيد الآن ${formatSAR(r.balanceAfter)}.${failed ? ` تعذّر إرسال ${failed} (استُرجعت قيمتها).` : ""}${r.skippedForCredit ? ` تُرك ${r.skippedForCredit} لعدم كفاية الرصيد.` : ""}`,
    };
  });
}

export async function scheduleReminderAction(eventId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async () => {
    const u = await requireOrganizer();
    const at = riyadhLocalToMs(s(fd, "runAt"));
    if (!at) throw new AppError("validation", "اختر موعد التذكير");
    await scheduleReminder(u.id, eventId, at, (s(fd, "mode") || "both") as ChannelMode);
    revalidatePath(ev(eventId), "layout");
    return { ok: true, message: "جُدول التذكير. سيُرسل فقط لمن لا يزال بحاجة للتأكيد لحظة التنفيذ." };
  });
}

export async function cancelReminderAction(eventId: string, id: string, _: ActionResult | null): Promise<ActionResult> {
  return act(async () => {
    const u = await requireOrganizer();
    await cancelReminder(u.id, id);
    revalidatePath(ev(eventId), "layout");
    return { ok: true, message: "أُلغي التذكير" };
  });
}

/* ===================== التسجيلات والانتظار ===================== */

export async function cancelRegistrationAction(eventId: string, regId: string, _: ActionResult | null): Promise<ActionResult> {
  return act(async () => {
    const u = await requireOrganizer();
    await cancelRegistrationByOrganizer(u.id, regId);
    revalidatePath(ev(eventId), "layout");
    return { ok: true, message: "أُلغي التسجيل وحُرّرت المقاعد" };
  });
}

export async function resendTicketAction(eventId: string, regId: string, _: ActionResult | null): Promise<ActionResult> {
  return act(async () => {
    const u = await requireOrganizer();
    await resendTicketByOrganizer(u.id, regId);
    revalidatePath(ev(eventId), "layout");
    return { ok: true, message: "أُعيد إرسال التذكرة" };
  });
}

export async function offerAction(eventId: string, regId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async () => {
    const u = await requireOrganizer();
    await offerWaitlistSpot(u.id, regId, s(fd, "idemKey"));
    revalidatePath(ev(eventId), "layout");
    return { ok: true, message: "أُرسلت فرصة التأكيد" };
  });
}

/* ===================== الدفع والرصيد ===================== */

export async function payPackageAction(eventId: string, _: ActionResult | null): Promise<ActionResult> {
  let url = "";
  const r = await act(async () => {
    const u = await requireOrganizer();
    url = (await createPackagePayment(u.id, eventId)).checkoutUrl;
  });
  if (r.ok) redirect(url);
  return r;
}

export async function extraPlacesAction(eventId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let url = "";
  const r = await act(async () => {
    const u = await requireOrganizer();
    url = (await createExtraPlacesPayment(u.id, eventId, Number(s(fd, "places")))).checkoutUrl;
  });
  if (r.ok) redirect(url);
  return r;
}

export async function topupAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let url = "";
  const r = await act(async () => {
    const u = await requireOrganizer();
    const amount = riyalsToHalalas(s(fd, "amount"));
    if (!amount) throw new AppError("validation", "أدخل مبلغًا صحيحًا");
    url = (await createTopupPayment(u.id, amount)).checkoutUrl;
  });
  if (r.ok) redirect(url);
  return r;
}

/* ===================== فريق الاستقبال ===================== */

export async function addStaffAction(eventId: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async () => {
    const u = await requireOrganizer();
    const r = await addStaff(u.id, eventId, { name: s(fd, "name"), email: s(fd, "email") });
    revalidatePath(ev(eventId), "layout");
    return {
      ok: true,
      message: r.alreadyMember ? "العضو مضاف مسبقًا" : r.user.status === "invited" ? "أُضيف العضو وأُرسل له رابط إنشاء كلمة المرور (صالح 7 أيام)" : "أُضيف العضو وأُبلغ بالبريد",
    };
  });
}

export async function removeStaffAction(eventId: string, userId: string, _: ActionResult | null): Promise<ActionResult> {
  return act(async () => {
    const u = await requireOrganizer();
    await removeStaff(u.id, eventId, userId);
    revalidatePath(ev(eventId), "layout");
    return { ok: true, message: "أُزيل العضو" };
  });
}

/* ===================== التصاميم والدعم ===================== */

export async function createDesignAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let id = "";
  const r = await act(async () => {
    const u = await requireOrganizer();
    id = (await createDesignRequest(u.id, { title: s(fd, "title"), details: s(fd, "details"), refUrl: s(fd, "refUrl"), eventId: s(fd, "eventId") || null })).id;
  });
  if (r.ok) redirect(`/dashboard/designs/${id}`);
  return r;
}

export async function designAction(id: string, op: "accept" | "pay" | "cancel", _: ActionResult | null): Promise<ActionResult> {
  let url = "";
  const r = await act(async () => {
    const u = await requireOrganizer();
    if (op === "accept") await acceptQuote(u.id, id);
    if (op === "cancel") await cancelDesign(u.id, id);
    if (op === "pay") url = (await payDesign(u.id, id)).checkoutUrl;
    revalidatePath(`/dashboard/designs/${id}`);
    return { ok: true, message: op === "accept" ? "قُبل العرض. أكمل الدفع." : op === "cancel" ? "أُلغي الطلب" : undefined };
  });
  if (r.ok && url) redirect(url);
  return r;
}

export async function designMessageAction(id: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async () => {
    const u = await requireOrganizer();
    await addDesignMessage(u, id, s(fd, "body"));
    revalidatePath(`/dashboard/designs/${id}`);
  });
}

export async function createSupportAction(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  let id = "";
  const r = await act(async () => {
    const u = await requireOrganizer();
    id = (await createSupportTicket(u, { kind: s(fd, "kind"), subject: s(fd, "subject"), body: s(fd, "body"), eventId: s(fd, "eventId") || null })).id;
  });
  if (r.ok) redirect(`/dashboard/support/${id}`);
  return r;
}

export async function supportReplyAction(id: string, _: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return act(async () => {
    const u = await requireOrganizer();
    await replySupport(u, id, s(fd, "body"));
    revalidatePath(`/dashboard/support/${id}`);
  });
}
