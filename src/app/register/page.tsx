import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicHeader } from "@/components/Shell";
import { ActionForm, Submit } from "@/components/client";
import { registerAction } from "@/app/auth-actions";
import { currentUser, homeFor } from "@/lib/session";

export const metadata = { title: "حساب منظّم جديد" };

export default async function RegisterPage() {
  const u = await currentUser();
  if (u) redirect(homeFor(u));
  return (
    <>
      <PublicHeader />
      <main className="container page narrow">
        <div className="card">
          <h1>حساب منظّم جديد</h1>
          <p className="muted small">لأي شخص أو جهة تنظّم فعالية: أفراد، أندية، جامعات، شركات، مراكز تدريب.</p>
          <ActionForm action={registerAction} className="stack">
            <label className="field">
              <span>الاسم أو اسم الجهة</span>
              <input type="text" name="name" required maxLength={120} autoComplete="name" />
            </label>
            <label className="field">
              <span>البريد الإلكتروني</span>
              <input type="email" name="email" required autoComplete="email" dir="ltr" />
            </label>
            <label className="field">
              <span>كلمة المرور</span>
              <input type="password" name="password" required minLength={8} autoComplete="new-password" />
              <small>8 أحرف على الأقل</small>
            </label>
            <Submit className="btn primary block">إنشاء الحساب</Submit>
          </ActionForm>
          <p className="small muted" style={{ marginTop: 14 }}>
            لديك حساب؟ <Link href="/login">سجّل الدخول</Link>
          </p>
        </div>
      </main>
    </>
  );
}
