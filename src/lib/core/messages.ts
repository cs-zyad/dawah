import type { Transaction } from "firebase-admin/firestore";
import { db, C, runTx } from "../db";
import type { Channel, Invitation, MessageDoc, SendStatus, Settings, User } from "../types";
import { getMessageProvider } from "../providers/messaging";
import { getSettings } from "./settings";
import { ledgerRef, writeLedger } from "./credit";

export type NewMessage = Pick<MessageDoc, "kind" | "channel" | "to" | "template" | "vars" | "subject" | "body" | "chargedTo"> &
  Partial<Pick<MessageDoc, "ownerId" | "eventId" | "batchId" | "cost" | "opCost" | "invitationId" | "registrationId">>;

export function buildMessage(id: string, m: NewMessage): MessageDoc {
  const t = Date.now();
  return {
    id,
    ownerId: m.ownerId ?? null,
    eventId: m.eventId ?? null,
    batchId: m.batchId ?? null,
    kind: m.kind,
    channel: m.channel,
    to: m.to,
    template: m.template,
    vars: m.vars,
    subject: m.subject,
    body: m.body,
    status: "queued",
    attempts: 0,
    nextAttemptAt: t,
    leaseUntil: null,
    chargedTo: m.chargedTo,
    cost: m.cost ?? 0,
    opCost: m.opCost ?? 0,
    refunded: false,
    invitationId: m.invitationId ?? null,
    registrationId: m.registrationId ?? null,
    error: null,
    providerId: null,
    createdAt: t,
    sentAt: null,
    history: [{ at: t, status: "queued" }],
  };
}

/** يضيف رسالة داخل معاملة قائمة بمعرّف ثابت (يمنع التكرار عند إعادة المحاولة). */
export function queueMessageTx(tx: Transaction, id: string, m: NewMessage): MessageDoc {
  const doc = buildMessage(id, m);
  tx.set(db().collection(C.messages).doc(id), doc);
  return doc;
}

const LEASE_MS = 60_000;

/** يحجز الرسالة للإرسال حتى لا يرسلها عاملان في نفس الوقت. */
async function claim(id: string): Promise<MessageDoc | null> {
  const ref = db().collection(C.messages).doc(id);
  return runTx(async (tx) => {
    const s = await tx.get(ref);
    if (!s.exists) return null;
    const m = s.data() as MessageDoc;
    const t = Date.now();
    const due = m.status === "queued" && m.nextAttemptAt <= t;
    const stuck = m.status === "sending" && (m.leaseUntil ?? 0) < t;
    if (!due && !stuck) return null;
    tx.update(ref, { status: "sending", leaseUntil: t + LEASE_MS });
    return { ...m, status: "sending" };
  });
}

function aggregateSendStatus(inv: Pick<Invitation, "waStatus" | "emailStatus">): SendStatus {
  const s = [inv.waStatus, inv.emailStatus];
  if (s.includes("sent")) return "sent";
  if (s.includes("sending")) return "sending";
  if (s.includes("failed")) return "failed";
  return "not_sent";
}

/** تحديث حالة الإرسال على الدعوة (للدعوة الأولى فقط). يجب استدعاؤه بعد القراءات. */
export function invitationStatusPatch(inv: Invitation, channel: Channel, status: SendStatus): Partial<Invitation> {
  const next = { ...inv, [channel === "whatsapp" ? "waStatus" : "emailStatus"]: status } as Invitation;
  const patch: Partial<Invitation> = {
    waStatus: next.waStatus,
    emailStatus: next.emailStatus,
    sendStatus: aggregateSendStatus(next),
  };
  if (status === "sent") patch.lastSentAt = Date.now();
  return patch;
}

async function finalize(m: MessageDoc, outcome: { ok: boolean; permanent?: boolean; error?: string; providerId?: string }, s: Settings) {
  const ref = db().collection(C.messages).doc(m.id);
  await runTx(async (tx) => {
    const snap = await tx.get(ref);
    const cur = snap.data() as MessageDoc;
    if (!cur || cur.status !== "sending") return; // أنهاها عامل آخر
    const attempts = cur.attempts + 1;
    const t = Date.now();
    const finalFail = !outcome.ok && (outcome.permanent || attempts >= s.policies.maxAttempts);
    const refund = finalFail && cur.chargedTo === "credit" && cur.cost > 0 && !cur.refunded && cur.ownerId;
    // ---- القراءات أولًا
    const invRef = cur.invitationId && cur.kind === "invitation" ? db().collection(C.invitations).doc(cur.invitationId) : null;
    const invSnap = invRef ? await tx.get(invRef) : null;
    const userRef = refund ? db().collection(C.users).doc(cur.ownerId!) : null;
    const userSnap = userRef ? await tx.get(userRef) : null;
    const lRef = refund ? ledgerRef(`refund:${cur.id}`) : null;
    const lSnap = lRef ? await tx.get(lRef) : null;
    // ---- الكتابات
    if (outcome.ok) {
      tx.update(ref, {
        status: "sent",
        attempts,
        sentAt: t,
        leaseUntil: null,
        providerId: outcome.providerId ?? null,
        error: null,
        history: [...cur.history, { at: t, status: "sent", note: `محاولة ${attempts}` }],
      });
    } else if (finalFail) {
      tx.update(ref, {
        status: "failed",
        attempts,
        leaseUntil: null,
        error: outcome.error ?? "فشل الإرسال",
        refunded: !!refund,
        history: [...cur.history, { at: t, status: "failed", note: `${outcome.error ?? ""} (محاولة ${attempts})${refund ? " — استُرجعت القيمة للرصيد" : ""}` }],
      });
      if (refund && userSnap?.exists && lSnap && !lSnap.exists) {
        writeLedger(tx, userRef!, (userSnap.data() as User).creditBalance || 0, {
          userId: cur.ownerId!,
          amount: cur.cost,
          reason: "message_refund",
          note: `استرجاع رسالة فشلت (${cur.channel === "whatsapp" ? "واتساب" : "بريد"})`,
          ref: cur.id,
          idemKey: `refund:${cur.id}`,
        });
      }
    } else {
      const delay = s.policies.retryBaseSeconds * 1000 * Math.pow(2, attempts - 1);
      tx.update(ref, {
        status: "queued",
        attempts,
        leaseUntil: null,
        nextAttemptAt: t + delay,
        error: outcome.error ?? "فشل مؤقت",
        history: [...cur.history, { at: t, status: "retrying", note: `${outcome.error ?? ""} (محاولة ${attempts})` }],
      });
    }
    if (invRef && invSnap?.exists) {
      const status: SendStatus = outcome.ok ? "sent" : finalFail ? "failed" : "sending";
      tx.update(invRef, invitationStatusPatch(invSnap.data() as Invitation, cur.channel, status));
    }
  });
}

/** يرسل رسالة واحدة إن كانت مستحقة. آمن للاستدعاء أكثر من مرة. */
export async function dispatchMessage(id: string, settings?: Settings): Promise<MessageDoc["status"] | "skipped"> {
  const s = settings ?? (await getSettings());
  const m = await claim(id);
  if (!m) return "skipped";
  let outcome;
  try {
    outcome = await getMessageProvider(m.channel).send(m);
  } catch (e) {
    outcome = { ok: false, permanent: false, error: (e as Error).message };
  }
  await finalize(m, outcome, s);
  const after = await db().collection(C.messages).doc(id).get();
  return (after.data() as MessageDoc).status;
}

export async function dispatchMany(ids: string[], concurrency = 8) {
  const s = await getSettings();
  const queue = [...ids];
  const results: Record<string, string> = {};
  await Promise.all(
    Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length) {
        const id = queue.shift()!;
        results[id] = await dispatchMessage(id, s);
      }
    }),
  );
  return results;
}

/** العامل الدوري: يرسل كل الرسائل المستحقة (الجديدة وإعادة المحاولة والعالقة). */
export async function dispatchDue(limit = 200) {
  const t = Date.now();
  const [queued, sending] = await Promise.all([
    db().collection(C.messages).where("status", "==", "queued").get(),
    db().collection(C.messages).where("status", "==", "sending").get(),
  ]);
  const ids = [
    ...queued.docs.map((d) => d.data() as MessageDoc).filter((m) => m.nextAttemptAt <= t),
    ...sending.docs.map((d) => d.data() as MessageDoc).filter((m) => (m.leaseUntil ?? 0) < t),
  ]
    .sort((a, b) => a.nextAttemptAt - b.nextAttemptAt)
    .slice(0, limit)
    .map((m) => m.id);
  return dispatchMany(ids);
}

export async function listMessages(filter: { ownerId?: string; eventId?: string }): Promise<MessageDoc[]> {
  let q: FirebaseFirestore.Query = db().collection(C.messages);
  if (filter.eventId) q = q.where("eventId", "==", filter.eventId);
  else if (filter.ownerId) q = q.where("ownerId", "==", filter.ownerId);
  const qs = await q.get();
  return qs.docs.map((d) => d.data() as MessageDoc).sort((a, b) => b.createdAt - a.createdAt);
}
