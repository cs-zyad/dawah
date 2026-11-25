import Link from "next/link";
import { loadOwnedEvent } from "@/lib/owned";
import { packageSummary, listPayments } from "@/lib/core/payments";
import { capacityOf } from "@/lib/core/events";
import { links } from "@/lib/core/view";
import { ActionForm, Submit, CopyBox } from "@/components/client";
import { Alert, Stat, Tag } from "@/components/ui";
import { fmtShort, formatSAR } from "@/lib/util";
import { payPackageAction, extraPlacesAction } from "../../../actions";

const PURPOSE: Record<string, string> = { package: "الباقة", extra_places: "أماكن إضافية", credit: "شحن رصيد", design: "تصميم خاص" };

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, event: e } = await loadOwnedEvent(id);
  const [sum, pays] = await Promise.all([packageSummary(user.id, e.id), listPayments(user.id)]);
  const mine = pays.filter((p) => p.eventId === e.id);
  const paid = e.paidPlaces > 0;
  const s = sum.settings;
  return (
    <div className="stack-lg">
      {s.pricing.demo ? <Alert tone="info">الأسعار المعروضة تجريبية وقابلة للتعديل من لوحة الأدمن.</Alert> : null}
      {!paid ? (
        <section className="card stack">
          <h2>ملخص الباقة قبل الدفع</h2>
          {e.type === "private" ? (
            <p>
              <b className="num">{sum.invitations}</b> دعوة، منها <b className="num">{sum.withCompanion}</b> تسمح بمرافق ={" "}
              <b className="num">{sum.needed}</b> مكانًا في الباقة.
            </p>
          ) : (
            <p>
              الحد الأقصى للحضور: <b className="num">{e.maxAttendees}</b> مكانًا.
            </p>
          )}
          {sum.quote ? (
            <div className="grid grid-3">
              <Stat k="الباقة" v={sum.quote.label} />
              <Stat k="الأماكن" v={sum.quote.places} />
              <Stat k="المبلغ" v={formatSAR(sum.quote.price)} hl />
            </div>
          ) : null}
          <p className="small muted">
            رسوم الدعوات والتذكيرات منفصلة عن الباقة وتُخصم من <Link href="/dashboard/credit">رصيد الرسائل</Link>. رسالة التأكيد مع التذكرة مشمولة في الباقة.
          </p>
          {sum.blockers.length ? <Alert tone="warn">قبل الدفع: {sum.blockers.join("، ")}.</Alert> : null}
          <ActionForm action={payPackageAction.bind(null, e.id)}>
            <Submit disabled={!!sum.blockers.length || e.status === "cancelled"}>{e.type === "private" ? "ادفع قبل إرسال الدعوات" : "ادفع وانشر الرابط العام"}</Submit>
          </ActionForm>
        </section>
      ) : (
        <>
          <div className="grid grid-4">
            <Stat k="الأماكن المدفوعة" v={e.paidPlaces} hl />
            {e.type === "private" ? <Stat k="المطلوب للمدعوين" v={sum.needed} s="دعوة + مرافق مسموح" /> : <Stat k="الحد الأقصى" v={e.maxAttendees} />}
            <Stat k="السعة الفعلية" v={capacityOf(e)} s="الأقل بين الحد الأقصى والمدفوع" />
            <Stat k="المقاعد المحجوزة" v={e.reservedSeats} />
          </div>
          {e.type === "private" && sum.missing > 0 ? (
            <Alert tone="warn">
              المدعوون يحتاجون {sum.needed} مكانًا والباقة {e.paidPlaces}. اشترِ <b>{sum.missing}</b> مكانًا إضافيًا ({formatSAR(sum.extraPrice)}) قبل أي إرسال.
            </Alert>
          ) : null}
          {e.type === "public" ? (
            <section className="card soft stack">
              <h3>الرابط العام</h3>
              <CopyBox value={links.publicEvent(e.publicSlug)} />
              <p className="small muted" style={{ margin: 0 }}>
                شاركه في أي مكان. أي شخص يسجّل ضمن السعة وسياسة التسجيل.{" "}
                <a href={links.publicEvent(e.publicSlug)} target="_blank" rel="noopener">
                  فتح الصفحة
                </a>
              </p>
            </section>
          ) : null}
          <section className="card stack">
            <h3>شراء أماكن إضافية</h3>
            <p className="small muted">
              {formatSAR(s.pricing.extraPlacePrice)} للمكان. {e.type === "public" ? "في الرابط العام ترفع الحد الأقصى بنفس العدد." : ""} تُضاف بعد وصول إشعار الدفع الموثّق.
            </p>
            <ActionForm action={extraPlacesAction.bind(null, e.id)} className="row">
              <input type="number" name="places" min={1} max={5000} defaultValue={sum.missing || 10} required aria-label="عدد الأماكن" style={{ maxWidth: 140 }} />
              <Submit className="btn dark">شراء</Submit>
            </ActionForm>
          </section>
        </>
      )}
      {mine.length ? (
        <section className="stack">
          <h3>مدفوعات هذه الفعالية</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الوقت</th>
                  <th>النوع</th>
                  <th>الأماكن</th>
                  <th>المبلغ</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((p) => (
                  <tr key={p.id}>
                    <td className="nowrap">{fmtShort(p.createdAt)}</td>
                    <td>{PURPOSE[p.purpose]}</td>
                    <td className="num">{p.places}</td>
                    <td className="num">{formatSAR(p.amount)}</td>
                    <td>
                      {p.status === "paid" ? <Tag tone="ok">مدفوع</Tag> : p.status === "failed" ? <Tag tone="bad">فشل</Tag> : <Link href={`/dev/checkout/${p.id}`}><Tag tone="warn">بانتظار الدفع</Tag></Link>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
