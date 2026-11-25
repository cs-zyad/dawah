import Link from "next/link";
import { redirect } from "next/navigation";
import { PublicHeader } from "@/components/Shell";
import { currentUser, homeFor, isDemo } from "@/lib/session";
import { brand } from "@/config/brand";

export default async function Home() {
  const u = await currentUser();
  if (u) redirect(homeFor(u));
  return (
    <>
      <PublicHeader />
      <section className="hero">
        <div className="container">
          <p className="tag plum" style={{ marginBottom: 14 }}>
            {brand.fullName}
          </p>
          <h1>{brand.tagline}</h1>
          <p className="lead">
            جهّز دعوتك، أرسلها عبر واتساب أو البريد، واستلم تأكيدات الحضور مع تذكرة QR لكل ضيف ومرافقه، ثم سجّل الدخول عند الباب بمسح سريع من الجوال.
          </p>
          <div className="row" style={{ marginTop: 22 }}>
            <Link className="btn primary big" href="/register">
              أنشئ فعاليتك
            </Link>
            <Link className="btn big" href="/login" style={{ background: "transparent", color: "var(--ivory)", borderColor: "rgba(255,255,255,.3)" }}>
              تسجيل الدخول
            </Link>
          </div>
        </div>
      </section>
      <main className="container page">
        <div className="grid grid-3">
          {[
            ["١. جهّز الدعوة", "البيانات مرة واحدة، والقالب يعرضها كما هي في صفحة الدعوة ورسالة واتساب والبريد."],
            ["٢. أرسل وتابع", "من دُعي، من أكّد، ومن اعتذر، ومن تعذّر الإرسال إليه — مع تذكير لمن لم يرد."],
            ["٣. استقبل بالباب", "فريق الاستقبال يمسح QR من الجوال، ويعرف فورًا: دخل، أو حضر مسبقًا، أو تذكرة لا تخص الفعالية."],
          ].map(([t, d]) => (
            <div className="card" key={t}>
              <h3>{t}</h3>
              <p className="muted" style={{ margin: 0 }}>
                {d}
              </p>
            </div>
          ))}
        </div>
        {isDemo() ? (
          <div className="card soft" style={{ marginTop: 20 }}>
            <h3>تجربة سريعة</h3>
            <p className="small">
              كلمة المرور لكل حسابات التجربة: <bdi className="ltr">Wafda@2026</bdi>
            </p>
            <ul className="small" style={{ margin: 0, paddingInlineStart: 18 }}>
              <li>
                منظّم: <bdi className="ltr">organizer@wafda.test</bdi>
              </li>
              <li>
                استقبال: <bdi className="ltr">staff@wafda.test</bdi>
              </li>
              <li>
                أدمن: <bdi className="ltr">admin@wafda.test</bdi>
              </li>
            </ul>
          </div>
        ) : null}
      </main>
      <footer className="site container">
        {brand.fullName} — {brand.tagline}
      </footer>
    </>
  );
}
