import { db, C } from "../db";
import type { User } from "../types";
import { AppError, clampStr, notFound } from "../util";
import { audit } from "./audit";

export type SupportStatus = "open" | "in_progress" | "resolved" | "closed";
export const SUPPORT_STATUS_AR: Record<SupportStatus, string> = { open: "مفتوحة", in_progress: "قيد المعالجة", resolved: "تم الحل", closed: "مغلقة" };
export const SUPPORT_KIND_AR = { support: "استفسار/دعم", complaint: "شكوى", billing: "فوترة ومدفوعات" } as const;

export interface SupportTicket {
  id: string;
  ownerId: string;
  ownerName: string;
  kind: keyof typeof SUPPORT_KIND_AR;
  subject: string;
  body: string;
  eventId: string | null;
  status: SupportStatus;
  createdAt: number;
  updatedAt: number;
}

export interface SupportReply {
  id: string;
  ticketId: string;
  authorId: string;
  authorRole: "organizer" | "admin";
  authorName: string;
  body: string;
  createdAt: number;
}

export async function createSupportTicket(owner: User, input: { kind: string; subject: string; body: string; eventId?: string | null }) {
  const subject = clampStr(input.subject, 160);
  const body = clampStr(input.body, 4000);
  if (subject.length < 3) throw new AppError("validation", "اكتب عنوانًا واضحًا");
  if (body.length < 5) throw new AppError("validation", "اكتب التفاصيل");
  const kind = (["support", "complaint", "billing"].includes(input.kind) ? input.kind : "support") as SupportTicket["kind"];
  const r = db().collection(C.supportTickets).doc();
  const t: SupportTicket = { id: r.id, ownerId: owner.id, ownerName: owner.name, kind, subject, body, eventId: input.eventId || null, status: "open", createdAt: Date.now(), updatedAt: Date.now() };
  await r.set(t);
  return t;
}

export async function getSupportTicket(actor: User, id: string) {
  if (!id || id.includes("/")) throw notFound("الطلب");
  const s = await db().collection(C.supportTickets).doc(id).get();
  const t = s.data() as SupportTicket | undefined;
  if (!t || (actor.role !== "admin" && t.ownerId !== actor.id)) throw notFound("الطلب");
  return t;
}

export async function listSupportTickets(ownerId?: string): Promise<SupportTicket[]> {
  const q = ownerId ? db().collection(C.supportTickets).where("ownerId", "==", ownerId) : db().collection(C.supportTickets);
  const qs = await q.get();
  return qs.docs.map((d) => d.data() as SupportTicket).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listReplies(ticketId: string): Promise<SupportReply[]> {
  const qs = await db().collection(C.supportReplies).where("ticketId", "==", ticketId).get();
  return qs.docs.map((d) => d.data() as SupportReply).sort((a, b) => a.createdAt - b.createdAt);
}

export async function replySupport(actor: User, ticketId: string, body: string, status?: SupportStatus) {
  const t = await getSupportTicket(actor, ticketId);
  const text = clampStr(body, 4000);
  if (!text && !status) throw new AppError("validation", "اكتب الرد");
  if (text) {
    const r = db().collection(C.supportReplies).doc();
    const rep: SupportReply = { id: r.id, ticketId, authorId: actor.id, authorRole: actor.role === "admin" ? "admin" : "organizer", authorName: actor.name, body: text, createdAt: Date.now() };
    await r.set(rep);
  }
  const patch: Partial<SupportTicket> = { updatedAt: Date.now() };
  if (status && actor.role === "admin" && status !== t.status) {
    patch.status = status;
    await audit(actor.id, "support.status", `supportTickets/${ticketId}`, { from: t.status, to: status });
  } else if (actor.role !== "admin" && (t.status === "resolved" || t.status === "closed") && text) {
    patch.status = "open"; // رد المنظّم يعيد فتح الطلب
  }
  await db().collection(C.supportTickets).doc(ticketId).update(patch);
}
