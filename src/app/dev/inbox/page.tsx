import { notFound } from "next/navigation";
import { db, C } from "@/lib/db";
import { isDemo } from "@/lib/session";
import { PublicHeader } from "@/components/Shell";
import { Alert, Empty, Ltr, Tag, MSG_KIND } from "@/components/ui";
import { fmtShort } from "@/lib/util";

export const metadata = { title: "صندوق الرسائل التجريبي", robots: { index: false } };

type InboxMsg = { id: string; channel: "whatsapp" | "email"; to: string; subject: string; body: string; kind: string; template: string; createdAt: number };

/** يحوّل الروابط في نص الرسالة إلى روابط قابلة للنقر */
function Linkify({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} className="ltr" style={{ wordBreak: "break-all" }}>
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export default async function DevInbox({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  if (!isDemo()) notFound();
  const { to = "" } = await searchParams;
  const q = to ? db().collection(C.devInbox).where("to", "==", to.trim()) : db().collection(C.devInbox);
  const list = (await q.get()).docs.map((d) => d.data() as InboxMsg).sort((a, b) => b.createdAt - a.createdAt).slice(0, 200);
  return (
    <>
      <PublicHeader />
      <main className="container page medium stack">
        <h1>صندوق الرسائل التجريبي</h1>
        <Alert tone="info">
          رسائل واتساب والبريد في الوضع التجريبي تظهر هنا. محاكاة الحالات: رقم ينتهي بـ <Ltr>0000</Ltr> أو بريد يحتوي <Ltr>fail</Ltr> = فشل نهائي؛ رقم ينتهي بـ <Ltr>1111</Ltr> أو بريد يحتوي <Ltr>flaky</Ltr> = فشل مؤقت ثم نجاح.
        </Alert>
        <form className="row" role="search">
          <input type="search" name="to" defaultValue={to} placeholder="تصفية بالمستلم (مثال: +9665… أو بريد)" dir="ltr" className="grow" aria-label="المستلم" style={{ maxWidth: 360 }} />
          <button className="btn small">تصفية</button>
        </form>
        {list.length ? (
          <div className="list">
            {list.map((m) => (
              <article key={m.id} className="item stack" style={{ gap: 6 }} data-testid="inbox-item">
                <div className="row between">
                  <div className="row" style={{ gap: 6 }}>
                    <Tag tone={m.channel === "whatsapp" ? "ok" : "info"}>{m.channel === "whatsapp" ? "واتساب" : "البريد"}</Tag>
                    <Tag tone="neutral">{MSG_KIND[m.kind] ?? m.kind}</Tag>
                    <Ltr className="small">{m.to}</Ltr>
                  </div>
                  <span className="tiny muted">{fmtShort(m.createdAt)}</span>
                </div>
                {m.channel === "email" ? <b className="small">{m.subject}</b> : null}
                <div className={`msg-preview${m.channel === "email" ? " email" : ""}`}>
                  <Linkify text={m.body} />
                </div>
                <span className="tiny muted ltr">template: {m.template}</span>
              </article>
            ))}
          </div>
        ) : (
          <Empty>لا توجد رسائل.</Empty>
        )}
      </main>
    </>
  );
}
