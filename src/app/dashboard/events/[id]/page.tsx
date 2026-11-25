import Link from "next/link";
import { loadOwnedEvent } from "@/lib/owned";
import { loadEventData } from "@/lib/core/stats";
import { recentCheckIns } from "@/lib/core/checkin";
import { links } from "@/lib/core/view";
import { Stat, Tag, Alert } from "@/components/ui";
import { AutoRefresh, CopyBox, ActionForm, Submit } from "@/components/client";
import { fmtShort, HOUR, now } from "@/lib/util";
import { cancelEventAction } from "../../actions";

export default async function EventOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event: e } = await loadOwnedEvent(id);
  const [{ stats: s }, recent] = await Promise.all([loadEventData(e), recentCheckIns(e.id, 8)]);
  const live = e.status === "active" && now() > e.startAt - 6 * HOUR && now() < e.endAt + 2 * HOUR;
  const attended = s.attendedGuests + s.attendedCompanions;
  const pct = (n: number) => (s.capacity ? Math.min(100, Math.round((n / s.capacity) * 100)) : 0);
  const base = `/dashboard/events/${e.id}`;
  return (
    <div className="stack-lg">
      {e.status === "draft" ? (
        <Alert tone="warn">
          الفعالية مسودة. أكمل الخطوات: {!e.templateId ? <Link href={`${base}/template`}>اختر القالب</Link> : e.type === "private" && !s.invitations ? <Link href={`${base}/guests`}>أضف المدعوين</Link> : <Link href={`${base}/payment`}>ادفع الباقة</Link>}
          .
        </Alert>
      ) : null}
      {e.type === "public" && e.status === "active" ? (
        <div className="card soft">
          <div className="label" style={{ marginBottom: 6 }}>
            الرابط العام للتسجيل
          </div>
          <CopyBox value={links.publicEvent(e.publicSlug)} />
        </div>
      ) : null}
      <div className="row between">
        <h2 style={{ margin: 0 }}>الأرقام</h2>
        <div className="row">
          <AutoRefresh enabled={live} seconds={15} />
          <a className="btn small ghost" href={`${base}/export`}>
            تنزيل كشف الحضور CSV
          </a>
        </div>
      </div>
      <div>
        <div className="row between small" style={{ marginBottom: 6 }}>
          <span>
            الامتلاء: <b className="num">{e.reservedSeats}</b> مقعد محجوز من <b className="num">{s.capacity}</b> (حضر فعليًا <b className="num">{attended}</b>)
          </span>
          <span className="muted">
            متاح <b className="num">{s.available}</b>
          </span>
        </div>
        <div className="bar" role="img" aria-label={`محجوز ${pct(e.reservedSeats)}٪، حضر ${pct(attended)}٪`}>
          <span style={{ width: `${pct(attended)}%` }} />
          <span className="lime" style={{ width: `${Math.max(0, pct(e.reservedSeats) - pct(attended))}%` }} />
        </div>
        <div className="row tiny muted" style={{ marginTop: 4 }}>
          <span>
            <span className="swatch" style={{ background: "var(--plum)" }} /> حضر
          </span>
          <span>
            <span className="swatch" style={{ background: "var(--lime-2)" }} /> مؤكد لم يحضر بعد
          </span>
          <span>
            <span className="swatch" style={{ background: "var(--lilac)" }} /> متاح
          </span>
        </div>
      </div>
      <div className="grid grid-4">
        {e.type === "private" ? <Stat k="الدعوات" v={s.invitations} s={`${s.invitedPersons} شخصًا بالمرافقين المسموحين`} /> : <Stat k="المسجلون" v={s.registrations} s="كل حالات التسجيل" />}
        {e.type === "private" ? <Stat k="لم يؤكد" v={s.notResponded} s="دعوات بلا رد" /> : null}
        <Stat k="المؤكدون" v={s.confirmedPersons} s={`أشخاص (${s.confirmedInvitations} ${e.type === "private" ? "دعوة" : "تسجيل"})`} hl />
        <Stat k="الحاضرون" v={attended} s={`${s.attendedGuests} ضيف + ${s.attendedCompanions} مرافق`} />
        <Stat k="المقاعد المتاحة" v={s.available} s={`من سعة ${s.capacity}`} />
        {e.type === "private" ? <Stat k="تعذّر الإرسال" v={s.sendFailed} s={s.notSent ? `${s.notSent} لم تُرسل بعد` : "—"} /> : null}
        <Stat k="الانتظار" v={s.waitlist} />
        <Stat k="اعتذر" v={s.declined} s={s.cancelled ? `${s.cancelled} أُلغي من المنظّم` : undefined} />
      </div>
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <section className="card">
          <div className="card-head">
            <h3>آخر من حضر</h3>
            <Link className="small" href={`/checkin/${e.id}`}>
              فتح التحضير
            </Link>
          </div>
          {recent.length ? (
            <ul className="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {recent.map((r, i) => (
                <li key={i} className="row between small" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 6 }}>
                  <span className="break">{r.label}</span>
                  <span className="muted">
                    {fmtShort(r.at)} <Tag tone="neutral">{r.method === "manual" ? "يدوي" : "مسح"}</Tag>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">لم يحضر أحد بعد.</p>
          )}
        </section>
        <section className="card">
          <h3>إجراءات</h3>
          <div className="row">
            {e.type === "private" ? (
              <Link className="btn small" href={`${base}/send`}>
                الإرسال والتذكير
              </Link>
            ) : null}
            <Link className="btn small" href={`${base}/guests`}>
              {e.type === "private" ? "قائمة المدعوين" : "قائمة المسجلين"}
            </Link>
            <Link className="btn small" href={`${base}/staff`}>
              فريق الاستقبال
            </Link>
          </div>
          {e.status !== "cancelled" ? (
            <details style={{ marginTop: 16 }}>
              <summary className="small">إلغاء الفعالية</summary>
              <p className="small muted">يوقف التسجيل والتحضير. لا يمكن التراجع.</p>
              <ActionForm action={cancelEventAction.bind(null, e.id)} confirm="هل تريد إلغاء الفعالية نهائيًا؟">
                <Submit className="btn danger small">تأكيد إلغاء الفعالية</Submit>
              </ActionForm>
            </details>
          ) : null}
        </section>
      </div>
    </div>
  );
}
