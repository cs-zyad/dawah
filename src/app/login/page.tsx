import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicHeader } from "@/components/Shell";
import { ActionForm, Submit } from "@/components/client";
import { loginAction } from "@/app/auth-actions";
import { currentUser, homeFor } from "@/lib/session";

export const metadata = { title: "تسجيل الدخول" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const u = await currentUser();
  if (u) redirect(homeFor(u));
  const { next = "" } = await searchParams;
  return (
    <>
      <PublicHeader />
      <main className="container page narrow">
        <div className="card">
          <h1>تسجيل الدخول</h1>
          <ActionForm action={loginAction} className="stack">
            <input type="hidden" name="next" value={next} />
            <label className="field">
              <span>البريد الإلكتروني</span>
              <input type="email" name="email" required autoComplete="email" dir="ltr" />
            </label>
            <label className="field">
              <span>كلمة المرور</span>
              <input type="password" name="password" required autoComplete="current-password" />
            </label>
            <Submit className="btn primary block">دخول</Submit>
          </ActionForm>
          <p className="small muted" style={{ marginTop: 14 }}>
            ليس لديك حساب؟ <Link href="/register">أنشئ حساب منظّم</Link>
          </p>
        </div>
      </main>
    </>
  );
}
