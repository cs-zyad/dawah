import { db, C } from "../src/lib/db";
import { createSetupToken, completeSetup } from "../src/lib/core/users";

/** يفعّل حساب عضو استقبال مدعو عبر نفس مسار رابط إنشاء كلمة المرور (للبيانات التجريبية). */
export async function completeSetupForSeed(userId: string, password: string) {
  const u = (await db().collection(C.users).doc(userId).get()).data();
  if (u?.status === "active") return;
  const token = await createSetupToken(userId, 7);
  await completeSetup(token, password);
}
