import { db, C, runTx } from "../db";
import type { ChannelMode, EventDoc, Invitation } from "../types";
import { AppError, clampStr, normalizeEmail, normalizePhone, notFound, randomToken } from "../util";
import { getOwnedEvent } from "./events";

export interface InvitationInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  allowCompanion?: boolean;
  channelOverride?: ChannelMode | null;
}

export function validateInvitationInput(i: InvitationInput) {
  const name = clampStr(i.name, 120);
  if (!name) throw new AppError("validation", "الاسم مطلوب");
  const phone = i.phone ? normalizePhone(i.phone) : null;
  if (i.phone && String(i.phone).trim() && !phone) throw new AppError("validation", "رقم الجوال غير صالح");
  const email = i.email ? normalizeEmail(i.email) : null;
  if (i.email && String(i.email).trim() && !email) throw new AppError("validation", "البريد غير صالح");
  if (!phone && !email) throw new AppError("validation", "أدخل رقم الجوال أو البريد");
  return { name, phone, email, allowCompanion: !!i.allowCompanion, channelOverride: i.channelOverride ?? null };
}

function assertPrivate(e: EventDoc) {
  if (e.type !== "private") throw new AppError("not_private", "الدعوات بالاسم متاحة للفعاليات الخاصة فقط");
  if (e.status === "cancelled") throw new AppError("cancelled", "الفعالية ملغاة");
}

export function newInvitation(e: EventDoc, v: ReturnType<typeof validateInvitationInput>, order: number): Invitation {
  const ref = db().collection(C.invitations).doc();
  return {
    id: ref.id,
    eventId: e.id,
    ownerId: e.ownerId,
    ...v,
    token: randomToken(20),
    sendStatus: "not_sent",
    waStatus: "not_sent",
    emailStatus: "not_sent",
    lastSentAt: null,
    regStatus: "none",
    regId: null,
    order,
    createdAt: Date.now(),
  };
}

export async function addInvitations(ownerId: string, eventId: string, inputs: InvitationInput[]): Promise<Invitation[]> {
  const e = await getOwnedEvent(ownerId, eventId);
  assertPrivate(e);
  const validated = inputs.map(validateInvitationInput);
  const base = Date.now();
  const invs = validated.map((v, i) => newInvitation(e, v, base + i));
  for (let i = 0; i < invs.length; i += 400) {
    const b = db().batch();
    invs.slice(i, i + 400).forEach((inv) => b.set(db().collection(C.invitations).doc(inv.id), inv));
    await b.commit();
  }
  return invs;
}

async function ownedInvitation(ownerId: string, invitationId: string) {
  const s = await db().collection(C.invitations).doc(invitationId).get();
  const inv = s.data() as Invitation | undefined;
  if (!inv || inv.ownerId !== ownerId) throw notFound("الدعوة");
  return inv;
}

export async function updateInvitation(ownerId: string, invitationId: string, input: InvitationInput) {
  const inv = await ownedInvitation(ownerId, invitationId);
  const v = validateInvitationInput(input);
  const ref = db().collection(C.invitations).doc(invitationId);
  await runTx(async (tx) => {
    const s = await tx.get(ref);
    const cur = s.data() as Invitation;
    // لا يمكن إلغاء صلاحية المرافق إن كان المدعو قد أكّد مع مرافق
    if (cur.allowCompanion && !v.allowCompanion && cur.regId) {
      const r = await tx.get(db().collection(C.registrations).doc(cur.regId));
      if (r.exists && r.data()!.status === "confirmed" && r.data()!.seats > 1) {
        throw new AppError("companion_confirmed", "لا يمكن إلغاء المرافق بعد تأكيده. ألغِ التسجيل أولًا.");
      }
    }
    tx.update(ref, { ...v });
  });
  return { ...inv, ...v };
}

/** حذف دعوة لم يؤكد صاحبها. */
export async function deleteInvitation(ownerId: string, invitationId: string) {
  const inv = await ownedInvitation(ownerId, invitationId);
  if (inv.regStatus === "confirmed") throw new AppError("confirmed", "لا يمكن حذف دعوة مؤكدة. ألغِ التسجيل أولًا.");
  await db().collection(C.invitations).doc(invitationId).delete();
}

export async function getInvitationByToken(token: string): Promise<Invitation | null> {
  if (!token || token.length > 64) return null;
  const qs = await db().collection(C.invitations).where("token", "==", token).limit(1).get();
  return qs.empty ? null : (qs.docs[0].data() as Invitation);
}

/** القناة الفعلية لكل مدعو حسب اختيار القائمة/التعديل وبيانات التواصل المتاحة. */
export function effectiveChannels(inv: Pick<Invitation, "phone" | "email" | "channelOverride">, listMode: ChannelMode) {
  const mode = inv.channelOverride ?? listMode;
  const out: ("whatsapp" | "email")[] = [];
  if ((mode === "whatsapp" || mode === "both") && inv.phone) out.push("whatsapp");
  if ((mode === "email" || mode === "both") && inv.email) out.push("email");
  // تعديل تلقائي: إن لم تتوفر وسيلة القائمة نستخدم المتاح
  if (!out.length) {
    if (inv.phone) out.push("whatsapp");
    else if (inv.email) out.push("email");
  }
  return out;
}
