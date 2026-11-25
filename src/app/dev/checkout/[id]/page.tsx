import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser, isDemo } from "@/lib/session";
import { getPayment } from "@/lib/core/payments";
import { ActionForm, Submit } from "@/components/client";
import { PublicHeader } from "@/components/Shell";
import { Alert, Tag } from "@/components/ui";
import { formatSAR } from "@/lib/util";
import { mockPayAction } from "../../actions";

export const metadata = { title: "دفع تجريبي" };

export default async function MockCheckout({ params }: { params: Promise<{ id: string }> }) {
  if (!isDemo()) notFound();
  const { id } = await params;
  const u = await currentUser();
  const p = await getPayment(id);
  if (!p || !u || (p.ownerId !== u.id && u.role !== "admin")) notFound();
  const back = p.eventId ? `/dashboard/events/${p.eventId}/payment` : p.designRequestId ? `/dashboard/designs/${p.designRequestId}` : "/dashboard/credit";
  return (
    <>
      <PublicHeader />
      <main className="container page narrow stack">
        <Alert tone="warn">صفحة دفع تجريبية (محاكاة مزوّد). في الإنتاج يُستبدل بها مزوّد دفع فعلي، ويُعطّلها DEMO_MODE=false.</Alert>
        <div className="card stack">
          <h1 style={{ fontSize: "1.3rem" }}>{p.description}</h1>
          <div className="row between">
            <span className="muted">المبلغ</span>
            <b className="num" style={{ fontSize: "1.6rem" }}>
              {formatSAR(p.amount)}
            </b>
          </div>
          <div className="row between">
            <span className="muted">الحالة</span>
            {p.status === "paid" ? <Tag tone="ok">مدفوع</Tag> : p.status === "failed" ? <Tag tone="bad">فشل</Tag> : <Tag tone="warn">بانتظار الدفع</Tag>}
          </div>
          {p.status !== "paid" ? (
            <ActionForm action={mockPayAction.bind(null, p.id, "succeed")}>
              <Submit className="btn primary big block">ادفع الآن (تجريبي)</Submit>
            </ActionForm>
          ) : null}
          {p.lastWebhook ? (
            <ActionForm action={mockPayAction.bind(null, p.id, "resend")}>
              <Submit className="btn block">إعادة إرسال نفس الإشعار</Submit>
              <p className="tiny muted" style={{ marginTop: 6 }}>
                لإثبات عدم التكرار: الخادم يسجل كل إشعار بمعرّفه الفريد ويطبّق الأثر مرة واحدة.
              </p>
            </ActionForm>
          ) : null}
          {p.status === "pending" ? (
            <ActionForm action={mockPayAction.bind(null, p.id, "fail")}>
              <Submit className="btn danger block">محاكاة فشل الدفع</Submit>
            </ActionForm>
          ) : null}
          <Link href={back} className="btn ghost block">
            العودة
          </Link>
          <p className="tiny muted">صفحة العودة لا تثبت الدفع؛ التثبيت يتم فقط عند وصول الإشعار الموقّع إلى الخادم.</p>
        </div>
      </main>
    </>
  );
}
