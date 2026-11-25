import { loadOwnedEvent } from "@/lib/owned";
import { listStaff } from "@/lib/core/staff";
import { ActionForm, Submit } from "@/components/client";
import { Empty, Ltr, Tag, Alert } from "@/components/ui";
import { fmtShort } from "@/lib/util";
import { addStaffAction, removeStaffAction } from "../../../actions";

export default async function StaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { event: e } = await loadOwnedEvent(id);
  const members = await listStaff(e.id);
  return (
    <div className="grid grid-2" style={{ alignItems: "start" }}>
      <section className="card stack">
        <h2>إضافة عضو استقبال</h2>
        <p className="small muted">يعمل العضو على هذه الفعالية فقط، ووظيفته المسح والتحضير. إن لم يكن له حساب يصله رابط إنشاء كلمة مرور صالح 7 أيام ولمرة واحدة. أنت كمنظّم تستطيع التحضير دائمًا.</p>
        <ActionForm action={addStaffAction.bind(null, e.id)} className="stack" resetOnSuccess>
          <label className="field">
            <span>الاسم</span>
            <input type="text" name="name" required maxLength={120} />
          </label>
          <label className="field">
            <span>البريد</span>
            <input type="email" name="email" required dir="ltr" />
          </label>
          <Submit>إضافة وإرسال الدعوة</Submit>
        </ActionForm>
      </section>
      <section className="stack">
        <h2>الفريق</h2>
        <Alert tone="info">رابط التحضير للفريق: /checkin (من الجوال، ويحتاج HTTPS لتشغيل الكاميرا).</Alert>
        {members.length ? (
          <div className="list">
            {members.map((m) => (
              <div className="item row between" key={m.id}>
                <div>
                  <b>{m.user?.name}</b> {m.user?.status === "invited" ? <Tag tone="warn">مدعو — لم يُنشئ كلمة المرور</Tag> : m.user?.status === "suspended" ? <Tag tone="bad">موقوف</Tag> : <Tag tone="ok">نشط</Tag>}
                  <div className="meta">
                    <Ltr>{m.user?.email}</Ltr> · أُضيف {fmtShort(m.addedAt)}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {m.user?.status === "invited" ? (
                    <ActionForm action={addStaffAction.bind(null, e.id)}>
                      <input type="hidden" name="name" value={m.user.name} />
                      <input type="hidden" name="email" value={m.user.email} />
                      <Submit className="btn small ghost">إعادة إرسال الرابط</Submit>
                    </ActionForm>
                  ) : null}
                  <ActionForm action={removeStaffAction.bind(null, e.id, m.userId)} confirm="إزالة العضو من هذه الفعالية؟">
                    <Submit className="btn small danger">إزالة</Submit>
                  </ActionForm>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty>لم تُضف أعضاء بعد.</Empty>
        )}
      </section>
    </div>
  );
}
