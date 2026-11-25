import { requireOrganizer } from "@/lib/session";
import { listOwnerEvents } from "@/lib/core/events";
import { ActionForm, Submit } from "@/components/client";
import { BackLink, PageHead } from "@/components/ui";
import { createSupportAction } from "../../actions";

export default async function NewSupport() {
  const u = await requireOrganizer();
  const events = await listOwnerEvents(u.id);
  return (
    <div className="medium">
      <BackLink href="/dashboard/support">الدعم</BackLink>
      <PageHead title="طلب دعم أو شكوى" />
      <div className="card">
        <ActionForm action={createSupportAction} className="stack">
          <label className="field">
            <span>النوع</span>
            <select name="kind" defaultValue="support">
              <option value="support">استفسار/دعم</option>
              <option value="complaint">شكوى</option>
              <option value="billing">فوترة ومدفوعات</option>
            </select>
          </label>
          <label className="field">
            <span>العنوان</span>
            <input type="text" name="subject" required minLength={3} maxLength={160} />
          </label>
          <label className="field">
            <span>التفاصيل</span>
            <textarea name="body" required maxLength={4000} />
          </label>
          <label className="field">
            <span>الفعالية (اختياري)</span>
            <select name="eventId" defaultValue="">
              <option value="">بدون</option>
              {events.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.title}
                </option>
              ))}
            </select>
          </label>
          <Submit>إرسال</Submit>
        </ActionForm>
      </div>
    </div>
  );
}
