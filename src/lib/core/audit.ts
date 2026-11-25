import type { Transaction } from "firebase-admin/firestore";
import { db, C } from "../db";

export interface AuditEntry {
  id: string;
  actorId: string;
  action: string;
  target: string;
  details: unknown;
  createdAt: number;
}

/** سجل التدقيق للعمليات المهمة (الدفع، الإعدادات، الصلاحيات، الإلغاء، التسويات). */
export async function audit(actorId: string, action: string, target: string, details: unknown = {}, tx?: Transaction) {
  const ref = db().collection(C.audit).doc();
  const entry: AuditEntry = { id: ref.id, actorId, action, target, details: JSON.parse(JSON.stringify(details ?? {})), createdAt: Date.now() };
  if (tx) tx.set(ref, entry);
  else await ref.set(entry);
}
