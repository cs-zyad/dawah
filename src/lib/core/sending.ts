import { db, C, runTx } from "../db";
import type { Channel, ChannelMode, EventDoc, Invitation, MessageDoc, Settings, User } from "../types";
import { AppError, notFound, sha256, chunk } from "../util";
import { getOwnedEvent, isPaid, listInvitations, requiredPlaces } from "./events";
import { effectiveChannels } from "./invitations";
import { getSettings } from "./settings";
import { ledgerRef, writeLedger } from "./credit";
import { buildMessage, dispatchMany, invitationStatusPatch } from "./messages";
import { eventVars, renderMessage } from "./messageTemplates";
import { buildEventView, links } from "./view";
import { audit } from "./audit";

export type SendKind = "invitation" | "reminder";

export interface BatchItem {
  invitationId: string;
  channel: Channel;
  to: string;
  cost: number;
}

export interface Batch {
  id: string;
  ownerId: string;
  eventId: string;
  kind: SendKind;
  mode: ChannelMode;
  items: BatchItem[];
  totalCost: number;
  skippedForCredit: number;
  status: "pending" | "materialized";
  source: "manual" | "scheduled";
  createdAt: number;
}

/** من يستحق الإرسال: الدعوة الأولى لمن تختارهم، والتذكير فقط لمن وصلته الدعوة ولم يرد. */
export function needsReminder(i: Invitation) {
  return i.sendStatus === "sent" && i.regStatus === "none";
}

function buildItems(invs: Invitation[], mode: ChannelMode, s: Settings) {
  const items: BatchItem[] = [];
  const skipped: { name: string; reason: string }[] = [];
  for (const inv of invs) {
    const chans = effectiveChannels(inv, mode);
    if (!chans.length) {
      skipped.push({ name: inv.name, reason: "لا توجد وسيلة تواصل" });
      continue;
    }
    for (const ch of chans) items.push({ invitationId: inv.id, channel: ch, to: (ch === "whatsapp" ? inv.phone : inv.email)!, cost: s.pricing.messagePrice[ch] });
  }
  return { items, skipped };
}

async function prepare(ownerId: string, eventId: string, kind: SendKind, mode: ChannelMode, invitationIds?: string[]) {
  const event = await getOwnedEvent(ownerId, eventId);
  if (event.type !== "private") throw new AppError("not_private", "الإرسال بالاسم للفعاليات الخاصة فقط");
  if (event.status === "cancelled") throw new AppError("cancelled", "الفعالية ملغاة");
  if (event.endAt < Date.now()) throw new AppError("ended", "انتهت الفعالية");
  if (!isPaid(event)) throw new AppError("not_paid", "ادفع الباقة قبل إرسال الدعوات");
  const all = await listInvitations(eventId);
  const need = requiredPlaces(all);
  if (need > event.paidPlaces) {
    throw new AppError("over_package", `المدعوون يحتاجون ${need} مكانًا والباقة ${event.paidPlaces}. اشترِ ${need - event.paidPlaces} مكانًا إضافيًا قبل أي إرسال.`);
  }
  let targets = invitationIds ? all.filter((i) => invitationIds.includes(i.id)) : all;
  if (kind === "reminder") targets = targets.filter(needsReminder);
  else if (!invitationIds) targets = targets.filter((i) => i.sendStatus === "not_sent");
  const s = await getSettings();
  return { event, s, ...buildItems(targets, mode, s), recipients: targets.length };
}

/** التكلفة المتوقعة قبل الإرسال أو الجدولة. */
export async function estimateSend(ownerId: string, eventId: string, kind: SendKind, mode: ChannelMode, invitationIds?: string[]) {
  const p = await prepare(ownerId, eventId, kind, mode, invitationIds);
  const user = (await db().collection(C.users).doc(ownerId).get()).data() as User;
  const byChannel = { whatsapp: 0, email: 0 } as Record<Channel, number>;
  p.items.forEach((i) => byChannel[i.channel]++);
  const cost = p.items.reduce((n, i) => n + i.cost, 0);
  return { recipients: p.recipients, messages: p.items.length, byChannel, cost, balance: user.creditBalance || 0, enough: (user.creditBalance || 0) >= cost, skipped: p.skipped, policy: p.s.policies.insufficientCredit };
}

export type SendResult =
  | { status: "sent"; batchId: string; messages: number; cost: number; balanceAfter: number; skipped: { name: string; reason: string }[]; skippedForCredit: number; duplicate?: boolean; results?: Record<string, string> }
  | { status: "insufficient"; needed: number; balance: number }
  | { status: "nothing"; skipped: { name: string; reason: string }[] };

/**
 * الإرسال من الرصيد: الخصم وحفظ عناصر الدفعة في نفس المعاملة، ثم إنشاء الرسائل بمعرّفات ثابتة.
 * نفس مفتاح منع التكرار لا يخصم مرتين ولا ينشئ رسائل مكررة.
 */
export async function sendToInvitations(p: {
  ownerId: string;
  eventId: string;
  kind: SendKind;
  mode: ChannelMode;
  invitationIds?: string[];
  idemKey: string;
  source?: "manual" | "scheduled";
  dispatch?: boolean;
}): Promise<SendResult> {
  if (!p.idemKey || p.idemKey.length < 8) throw new AppError("validation", "أعد تحميل الصفحة وحاول مرة أخرى");
  const batchId = `b_${sha256(`batch:${p.ownerId}:${p.idemKey}`).slice(0, 28)}`;
  const batchRef = db().collection(C.batches).doc(batchId);
  const existing = await batchRef.get();
  if (existing.exists) {
    const b = existing.data() as Batch;
    const ids = await materializeBatch(batchId);
    const results = p.dispatch === false ? undefined : await dispatchMany(ids);
    const u = (await db().collection(C.users).doc(p.ownerId).get()).data() as User;
    return { status: "sent", batchId, messages: b.items.length, cost: b.totalCost, balanceAfter: u.creditBalance, skipped: [], skippedForCredit: b.skippedForCredit, duplicate: true, results };
  }
  const prep = await prepare(p.ownerId, p.eventId, p.kind, p.mode, p.invitationIds);
  if (!prep.items.length) return { status: "nothing", skipped: prep.skipped };
  const userRef = db().collection(C.users).doc(p.ownerId);
  const lRef = ledgerRef(`batch:${batchId}`);
  const txRes = await runTx(async (tx) => {
    const [uS, lS, bS] = await Promise.all([tx.get(userRef), tx.get(lRef), tx.get(batchRef)]);
    const balance = (uS.data() as User).creditBalance || 0;
    if (lS.exists || bS.exists) return { kind: "dup" as const, balance };
    let items = prep.items;
    let total = items.reduce((n, i) => n + i.cost, 0);
    let skippedForCredit = 0;
    if (total > balance) {
      if (prep.s.policies.insufficientCredit === "block") return { kind: "insufficient" as const, needed: total, balance };
      // «إرسال ما يغطيه الرصيد» بترتيب القائمة
      const fit: BatchItem[] = [];
      let sum = 0;
      for (const it of items) {
        if (sum + it.cost > balance) break;
        fit.push(it);
        sum += it.cost;
      }
      skippedForCredit = items.length - fit.length;
      items = fit;
      total = sum;
      if (!items.length) return { kind: "insufficient" as const, needed: prep.items.reduce((n, i) => n + i.cost, 0), balance };
    }
    const batch: Batch = {
      id: batchId,
      ownerId: p.ownerId,
      eventId: p.eventId,
      kind: p.kind,
      mode: p.mode,
      items,
      totalCost: total,
      skippedForCredit,
      status: "pending",
      source: p.source ?? "manual",
      createdAt: Date.now(),
    };
    tx.set(batchRef, batch);
    const entry = writeLedger(tx, userRef, balance, {
      userId: p.ownerId,
      amount: -total,
      reason: "message_batch",
      note: `${p.kind === "invitation" ? "دعوات" : "تذكير"} — ${prep.event.title} (${items.length} رسالة)`,
      ref: batchId,
      idemKey: `batch:${batchId}`,
    });
    return { kind: "ok" as const, batch, balanceAfter: entry.balanceAfter };
  });
  if (txRes.kind === "insufficient") return { status: "insufficient", needed: txRes.needed, balance: txRes.balance };
  if (txRes.kind === "dup") return sendToInvitations(p);
  const ids = await materializeBatch(batchId);
  const results = p.dispatch === false ? undefined : await dispatchMany(ids);
  return {
    status: "sent",
    batchId,
    messages: txRes.batch.items.length,
    cost: txRes.batch.totalCost,
    balanceAfter: txRes.balanceAfter,
    skipped: prep.skipped,
    skippedForCredit: txRes.batch.skippedForCredit,
    results,
  };
}

/** ينشئ رسائل الدفعة بمعرّفات ثابتة <batchId>_<i>. آمن للتكرار (العامل يكمل الدفعات المعلّقة). */
export async function materializeBatch(batchId: string): Promise<string[]> {
  const bRef = db().collection(C.batches).doc(batchId);
  const b = (await bRef.get()).data() as Batch | undefined;
  if (!b) throw notFound("الدفعة");
  const ids = b.items.map((_, i) => `${batchId}_${i}`);
  if (b.status === "materialized") return ids;
  const event = (await db().collection(C.events).doc(b.eventId).get()).data() as EventDoc;
  const tasks = b.items.map((item, i) => async () => {
    const mRef = db().collection(C.messages).doc(ids[i]);
    const invRef = db().collection(C.invitations).doc(item.invitationId);
    await runTx(async (tx) => {
      const [mS, invS] = await Promise.all([tx.get(mRef), tx.get(invRef)]);
      if (mS.exists) return;
      const inv = invS.exists ? (invS.data() as Invitation) : null;
      const view = buildEventView(event, inv?.name ?? "");
      const vars =
        b.kind === "invitation"
          ? {
              ...eventVars(view),
              guest_name: inv?.name ?? "",
              companion_line: inv?.allowCompanion ? "الدعوة تشمل مرافقًا واحدًا.\n" : "",
              invitation_link: inv ? links.invitation(inv.token) : "",
            }
          : { ...eventVars(view), guest_name: inv?.name ?? "", invitation_link: inv ? links.invitation(inv.token) : "" };
      const msg = renderMessage(b.kind, vars, item.channel);
      const doc: MessageDoc = buildMessage(ids[i], {
        ...msg,
        vars,
        kind: b.kind,
        channel: item.channel,
        to: item.to,
        chargedTo: "credit",
        cost: item.cost,
        ownerId: b.ownerId,
        eventId: b.eventId,
        batchId,
        invitationId: item.invitationId,
      });
      tx.set(mRef, doc);
      if (inv && b.kind === "invitation") tx.update(invRef, invitationStatusPatch(inv, item.channel, "sending"));
    });
  });
  for (const group of chunk(tasks, 10)) await Promise.all(group.map((t) => t()));
  await bRef.update({ status: "materialized" });
  return ids;
}

export async function materializePendingBatches() {
  const qs = await db().collection(C.batches).where("status", "==", "pending").get();
  const out: string[] = [];
  for (const d of qs.docs) out.push(...(await materializeBatch(d.id)));
  return out;
}

/* ======================== التذكيرات المجدولة ======================== */

export interface Reminder {
  id: string;
  ownerId: string;
  eventId: string;
  runAt: number;
  mode: ChannelMode;
  status: "scheduled" | "running" | "done" | "failed" | "cancelled";
  leaseUntil: number | null;
  result: string | null;
  batchId: string | null;
  createdAt: number;
  finishedAt: number | null;
}

export async function scheduleReminder(ownerId: string, eventId: string, runAt: number, mode: ChannelMode) {
  const e = await getOwnedEvent(ownerId, eventId);
  if (!isPaid(e)) throw new AppError("not_paid", "ادفع الباقة أولًا");
  if (runAt < Date.now() + 60_000) throw new AppError("validation", "اختر موعدًا مستقبليًا");
  if (runAt > e.endAt) throw new AppError("validation", "الموعد بعد نهاية الفعالية");
  const ref = db().collection(C.reminders).doc();
  const r: Reminder = { id: ref.id, ownerId, eventId, runAt, mode, status: "scheduled", leaseUntil: null, result: null, batchId: null, createdAt: Date.now(), finishedAt: null };
  await ref.set(r);
  return r;
}

export async function cancelReminder(ownerId: string, id: string) {
  const ref = db().collection(C.reminders).doc(id);
  await runTx(async (tx) => {
    const s = await tx.get(ref);
    const r = s.data() as Reminder | undefined;
    if (!r || r.ownerId !== ownerId) throw notFound("التذكير");
    if (r.status !== "scheduled") throw new AppError("not_scheduled", "لا يمكن إلغاء تذكير بدأ أو انتهى");
    tx.update(ref, { status: "cancelled", finishedAt: Date.now() });
  });
}

export async function listReminders(eventId: string): Promise<Reminder[]> {
  const qs = await db().collection(C.reminders).where("eventId", "==", eventId).get();
  return qs.docs.map((d) => d.data() as Reminder).sort((a, b) => b.runAt - a.runAt);
}

const REMINDER_LEASE = 5 * 60_000;

/** ينفّذ التذكيرات المستحقة. يفحص حالة كل مدعو لحظة التنفيذ، ولا يُنفّذ المهمة مرتين. */
export async function runDueReminders() {
  const [sched, running] = await Promise.all([
    db().collection(C.reminders).where("status", "==", "scheduled").get(),
    db().collection(C.reminders).where("status", "==", "running").get(),
  ]);
  const t = Date.now();
  const due = [
    ...sched.docs.map((d) => d.data() as Reminder).filter((r) => r.runAt <= t),
    ...running.docs.map((d) => d.data() as Reminder).filter((r) => (r.leaseUntil ?? 0) < t),
  ];
  const out: { id: string; status: string; result: string }[] = [];
  for (const r of due) {
    const ref = db().collection(C.reminders).doc(r.id);
    const claimed = await runTx(async (tx) => {
      const s = await tx.get(ref);
      const cur = s.data() as Reminder;
      const now = Date.now();
      const ok = (cur.status === "scheduled" && cur.runAt <= now) || (cur.status === "running" && (cur.leaseUntil ?? 0) < now);
      if (!ok) return false;
      tx.update(ref, { status: "running", leaseUntil: now + REMINDER_LEASE });
      return true;
    });
    if (!claimed) continue;
    let status: Reminder["status"] = "done";
    let result = "";
    let batchId: string | null = null;
    try {
      const res = await sendToInvitations({ ownerId: r.ownerId, eventId: r.eventId, kind: "reminder", mode: r.mode, idemKey: `reminder:${r.id}`, source: "scheduled" });
      if (res.status === "sent") {
        batchId = res.batchId;
        result = `أُرسل ${res.messages} رسالة بتكلفة ${(res.cost / 100).toFixed(2)} ر.س${res.skippedForCredit ? `، وتُرك ${res.skippedForCredit} لعدم كفاية الرصيد` : ""}`;
      } else if (res.status === "nothing") {
        result = "لا يوجد من يحتاج تذكيرًا لحظة التنفيذ";
      } else {
        status = "failed";
        result = `فشل: رصيد الرسائل غير كافٍ (المطلوب ${(res.needed / 100).toFixed(2)} ر.س والرصيد ${(res.balance / 100).toFixed(2)} ر.س). لم يُرسل شيء.`;
      }
    } catch (e) {
      status = "failed";
      result = `فشل: ${(e as Error).message}`;
    }
    await ref.update({ status, result, batchId, leaseUntil: null, finishedAt: Date.now() });
    if (status === "failed") await audit("system", "reminder.failed", `reminders/${r.id}`, { result });
    out.push({ id: r.id, status, result });
  }
  return out;
}
