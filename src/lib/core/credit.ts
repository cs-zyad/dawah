import type { DocumentReference, Transaction } from "firebase-admin/firestore";
import { db, C, runTx } from "../db";
import { AppError, sha256 } from "../util";
import type { User } from "../types";
import { audit } from "./audit";

export interface LedgerEntry {
  id: string;
  userId: string;
  amount: number; // موجب = إضافة، سالب = خصم (هللة)
  balanceAfter: number;
  reason: "topup" | "message_batch" | "message_refund" | "waitlist_offer" | "adjustment";
  note: string;
  ref: string | null;
  idemKey: string;
  createdAt: number;
}

/** معرّف قيد الرصيد = بصمة مفتاح منع التكرار، فلا يُطبّق القيد مرتين. */
export const ledgerRef = (idemKey: string) => db().collection(C.ledger).doc(sha256(idemKey));

/**
 * يكتب قيد رصيد داخل معاملة. يجب على المستدعي قراءة وثيقة المستخدم ووثيقة القيد قبل أي كتابة
 * (قاعدة Firestore: كل القراءات قبل الكتابات)، ويمرّر الرصيد الحالي.
 */
export function writeLedger(
  tx: Transaction,
  userRef: DocumentReference,
  currentBalance: number,
  e: Omit<LedgerEntry, "id" | "balanceAfter" | "createdAt">,
): LedgerEntry {
  const ref = ledgerRef(e.idemKey);
  const entry: LedgerEntry = { ...e, id: ref.id, balanceAfter: currentBalance + e.amount, createdAt: Date.now() };
  tx.set(ref, entry);
  tx.update(userRef, { creditBalance: entry.balanceAfter });
  return entry;
}

/** تسوية رصيد من الأدمن بسبب مسجل. */
export async function adjustCredit(actorId: string, userId: string, amount: number, note: string, idemKey: string) {
  if (!note.trim()) throw new AppError("reason_required", "سبب التسوية مطلوب");
  if (!Number.isInteger(amount) || amount === 0) throw new AppError("invalid_amount", "المبلغ غير صالح");
  const userRef = db().collection(C.users).doc(userId);
  const lref = ledgerRef(`adjust:${idemKey}`);
  const res = await runTx(async (tx) => {
    const [u, l] = await Promise.all([tx.get(userRef), tx.get(lref)]);
    if (!u.exists) throw new AppError("not_found", "الحساب غير موجود", 404);
    if (l.exists) return { duplicate: true, entry: l.data() as LedgerEntry };
    const bal = (u.data() as User).creditBalance || 0;
    if (bal + amount < 0) throw new AppError("negative_balance", "التسوية تجعل الرصيد سالبًا");
    const entry = writeLedger(tx, userRef, bal, { userId, amount, reason: "adjustment", note: note.trim(), ref: null, idemKey: `adjust:${idemKey}` });
    return { duplicate: false, entry };
  });
  if (!res.duplicate) await audit(actorId, "credit.adjust", `users/${userId}`, { amount, note });
  return res;
}

export async function listLedger(userId: string): Promise<LedgerEntry[]> {
  const qs = await db().collection(C.ledger).where("userId", "==", userId).get();
  return qs.docs.map((d) => d.data() as LedgerEntry).sort((a, b) => b.createdAt - a.createdAt);
}
