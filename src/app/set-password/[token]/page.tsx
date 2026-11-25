import { PublicHeader } from "@/components/Shell";
import { ActionForm, Submit } from "@/components/client";
import { Alert, Ltr } from "@/components/ui";
import { setPasswordAction } from "@/app/auth-actions";
import { inspectSetupToken } from "@/lib/core/users";

export const metadata = { title: "إنشاء كلمة المرور" };

export default async function SetPasswordPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await inspectSetupToken(token);
  return (
    <>
      <PublicHeader />
      <main className="container page narrow">
        <div className="card">
          <h1>إنشاء كلمة المرور</h1>
          {!r.ok ? (
            <Alert tone="bad">{r.reason}. اطلب من المنظّم إعادة إضافتك لإرسال رابط جديد.</Alert>
          ) : (
            <>
              <p className="muted">
                مرحبًا {r.user.name} (<Ltr>{r.user.email}</Ltr>). الرابط صالح لمرة واحدة.
              </p>
              <ActionForm action={setPasswordAction.bind(null, token)} className="stack">
                <label className="field">
                  <span>كلمة المرور</span>
                  <input type="password" name="password" required minLength={8} autoComplete="new-password" />
                </label>
                <label className="field">
                  <span>تأكيد كلمة المرور</span>
                  <input type="password" name="password2" required minLength={8} autoComplete="new-password" />
                </label>
                <Submit className="btn primary block">حفظ والدخول</Submit>
              </ActionForm>
            </>
          )}
        </div>
      </main>
    </>
  );
}
