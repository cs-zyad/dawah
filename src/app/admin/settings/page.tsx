import { getSettings } from "@/lib/core/settings";
import { ActionForm, Submit } from "@/components/client";
import { Alert, PageHead } from "@/components/ui";
import { settingsAction } from "../actions";

export const metadata = { title: "الأسعار والسياسات" };
const r = (h: number) => (h / 100).toFixed(2);

export default async function SettingsPage() {
  const s = await getSettings();
  return (
    <div className="medium stack">
      <PageHead title="الباقات والتسعير وسياسات التشغيل" sub="كل تعديل يُسجّل في سجل التدقيق. المبالغ بالريال وتُخزن بالهللة." />
      <ActionForm action={settingsAction} className="stack">
        <section className="card stack">
          <h2>الباقات</h2>
          <label className="check">
            <input type="checkbox" name="demo" defaultChecked={s.pricing.demo} />
            <span>الأسعار تجريبية (تظهر علامة «تجريبية» للمنظّمين)</span>
          </label>
          {s.pricing.packages.map((p, i) => (
            <div className="row" key={i}>
              <label className="field" style={{ maxWidth: 180 }}>
                <span>أماكن الباقة {i + 1}</span>
                <input type="number" name={`pk${i}_places`} defaultValue={p.places} min={1} required />
              </label>
              <label className="field" style={{ maxWidth: 180 }}>
                <span>السعر (ر.س)</span>
                <input type="number" name={`pk${i}_price`} defaultValue={r(p.price)} step="0.01" min={0} required />
              </label>
            </div>
          ))}
          <label className="field" style={{ maxWidth: 220 }}>
            <span>سعر المكان الإضافي (ر.س)</span>
            <input type="number" name="extraPlacePrice" defaultValue={r(s.pricing.extraPlacePrice)} step="0.01" min={0} required />
          </label>
        </section>
        <section className="card stack">
          <h2>الرسائل</h2>
          <div className="grid grid-2">
            <label className="field">
              <span>سعر رسالة واتساب للمنظّم (ر.س)</span>
              <input type="number" name="wa" defaultValue={r(s.pricing.messagePrice.whatsapp)} step="0.01" min={0} required />
            </label>
            <label className="field">
              <span>سعر رسالة البريد للمنظّم (ر.س)</span>
              <input type="number" name="em" defaultValue={r(s.pricing.messagePrice.email)} step="0.01" min={0} required />
            </label>
            <label className="field">
              <span>تكلفة تشغيل رسالة تأكيد واتساب (تقديرية)</span>
              <input type="number" name="opWa" defaultValue={r(s.pricing.confirmationOpCost.whatsapp)} step="0.01" min={0} required />
            </label>
            <label className="field">
              <span>تكلفة تشغيل رسالة تأكيد بريد (تقديرية)</span>
              <input type="number" name="opEm" defaultValue={r(s.pricing.confirmationOpCost.email)} step="0.01" min={0} required />
            </label>
          </div>
        </section>
        <section className="card stack">
          <h2>سياسات التشغيل</h2>
          <fieldset>
            <legend className="label">عند عدم كفاية الرصيد</legend>
            <div className="choice-grid">
              <label className="choice">
                <input type="radio" name="insufficientCredit" value="block" defaultChecked={s.policies.insufficientCredit === "block"} />
                <span>منع الإرسال كاملًا (الافتراضي)</span>
              </label>
              <label className="choice">
                <input type="radio" name="insufficientCredit" value="partial" defaultChecked={s.policies.insufficientCredit === "partial"} />
                <span>إرسال ما يغطيه الرصيد بترتيب القائمة</span>
              </label>
            </div>
          </fieldset>
          <div className="grid grid-3">
            <label className="field">
              <span>محاولات الإرسال</span>
              <input type="number" name="maxAttempts" defaultValue={s.policies.maxAttempts} min={1} max={10} required />
            </label>
            <label className="field">
              <span>مهلة إعادة المحاولة الأساسية (ث)</span>
              <input type="number" name="retryBaseSeconds" defaultValue={s.policies.retryBaseSeconds} min={0} max={3600} required />
              <small>تتضاعف مع كل محاولة</small>
            </label>
            <label className="field">
              <span>صلاحية فرصة الانتظار (ساعة)</span>
              <input type="number" name="waitlistOfferHours" defaultValue={s.policies.waitlistOfferHours} min={1} max={336} required />
            </label>
            <label className="field">
              <span>أدنى مدة بين إعادة إرسال التذكرة (دقيقة)</span>
              <input type="number" name="ticketResendMinMinutes" defaultValue={s.policies.ticketResendMinMinutes} min={0} max={1440} required />
            </label>
            <label className="field">
              <span>صلاحية دعوة عضو الاستقبال (يوم)</span>
              <input type="number" name="staffInviteDays" defaultValue={s.policies.staffInviteDays} min={1} max={30} required />
            </label>
          </div>
          <Alert tone="info">إعادة الإرسال من المنظّم (بعد تصحيح الرقم مثلًا) رسالة جديدة بتكلفة جديدة.</Alert>
        </section>
        <Submit>حفظ الإعدادات</Submit>
      </ActionForm>
    </div>
  );
}
