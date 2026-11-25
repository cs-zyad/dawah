import type { EventDoc } from "@/lib/types";
import { msToRiyadhLocal } from "@/lib/util";
import { ActionForm, Submit } from "./client";
import type { ActionResult } from "@/lib/session";

export function EventForm({ action, event, submitLabel }: { action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>; event?: EventDoc; submitLabel: string }) {
  const paid = !!event && event.paidPlaces > 0;
  return (
    <ActionForm action={action} className="stack">
      <div className="grid grid-2">
        <label className="field">
          <span>اسم الفعالية</span>
          <input type="text" name="title" required minLength={3} maxLength={120} defaultValue={event?.title} placeholder="مثال: ملتقى النادي السنوي" />
        </label>
        <label className="field">
          <span>الجهة المنظّمة (تظهر في الدعوة)</span>
          <input type="text" name="orgName" required maxLength={120} defaultValue={event?.orgName} placeholder="مثال: نادي التقنية — جامعة الملك سعود" />
        </label>
      </div>
      <label className="field">
        <span>الوصف</span>
        <textarea name="description" maxLength={2000} defaultValue={event?.description} placeholder="نبذة قصيرة تظهر في الدعوة" />
      </label>
      <div className="grid grid-2">
        <label className="field">
          <span>البداية (بتوقيت الرياض)</span>
          <input type="datetime-local" name="startLocal" required defaultValue={event ? msToRiyadhLocal(event.startAt) : ""} />
        </label>
        <label className="field">
          <span>النهاية (بتوقيت الرياض)</span>
          <input type="datetime-local" name="endLocal" required defaultValue={event ? msToRiyadhLocal(event.endAt) : ""} />
        </label>
      </div>
      <div className="grid grid-3">
        <label className="field">
          <span>المكان</span>
          <input type="text" name="venue" required maxLength={160} defaultValue={event?.venue} placeholder="مثال: قاعة الملتقى" />
        </label>
        <label className="field">
          <span>العنوان</span>
          <input type="text" name="address" maxLength={300} defaultValue={event?.address} placeholder="الحي، المدينة" />
        </label>
        <label className="field">
          <span>رابط الخريطة</span>
          <input type="url" name="mapUrl" maxLength={500} defaultValue={event?.mapUrl} placeholder="https://maps.google.com/..." dir="ltr" />
        </label>
      </div>
      <div className="grid grid-3">
        <label className="field">
          <span>الحد الأقصى للحضور</span>
          <input type="number" name="maxAttendees" required min={1} max={20000} defaultValue={event?.maxAttendees ?? 50} inputMode="numeric" />
          <small>السعة الفعلية = الأقل بين الحد الأقصى والأماكن المدفوعة.</small>
        </label>
        <fieldset>
          <legend className="label">نوع الدعوة</legend>
          <div className="stack" style={{ gap: 6 }}>
            <label className="choice">
              <input type="radio" name="type" value="private" defaultChecked={!event || event.type === "private"} disabled={paid && event?.type !== "private"} />
              <span>
                <b>خاصة بالاسم</b>
                <br />
                <span className="small muted">قائمة مدعوين، ولكل مدعو رابط خاص</span>
              </span>
            </label>
            <label className="choice">
              <input type="radio" name="type" value="public" defaultChecked={event?.type === "public"} disabled={paid && event?.type !== "public"} />
              <span>
                <b>رابط عام</b>
                <br />
                <span className="small muted">أي شخص يسجّل ضمن السعة</span>
              </span>
            </label>
            {paid ? <input type="hidden" name="type" value={event!.type} /> : null}
          </div>
        </fieldset>
        <fieldset>
          <legend className="label">عند اكتمال العدد</legend>
          <div className="stack" style={{ gap: 6 }}>
            <label className="choice">
              <input type="radio" name="fullPolicy" value="close" defaultChecked={!event || event.fullPolicy === "close"} />
              <span>إغلاق التسجيل مع رسالة «اكتمل العدد»</span>
            </label>
            <label className="choice">
              <input type="radio" name="fullPolicy" value="waitlist" defaultChecked={event?.fullPolicy === "waitlist"} />
              <span>قائمة انتظار</span>
            </label>
          </div>
        </fieldset>
      </div>
      <div className="row end">
        <Submit>{submitLabel}</Submit>
      </div>
    </ActionForm>
  );
}
