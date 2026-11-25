import { requireOrganizer } from "@/lib/session";
import { listOwnerEvents } from "@/lib/core/events";
import { ActionForm, Submit } from "@/components/client";
import { BackLink, PageHead } from "@/components/ui";
import { createDesignAction } from "../../actions";

export default async function NewDesignPage() {
  const u = await requireOrganizer();
  const events = await listOwnerEvents(u.id);
  return (
    <div className="medium">
      <BackLink href="/dashboard/designs">طلبات التصميم</BackLink>
      <PageHead title="طلب تصميم خاص" />
      <div className="card">
        <ActionForm action={createDesignAction} className="stack">
          <label className="field">
            <span>العنوان</span>
            <input type="text" name="title" required minLength={3} maxLength={120} placeholder="مثال: قالب بهوية النادي" />
          </label>
          <label className="field">
            <span>التفاصيل</span>
            <textarea name="details" required minLength={10} maxLength={3000} placeholder="الألوان، الشعار، الأسلوب، أي نصوص ثابتة…" />
          </label>
          <label className="field">
            <span>رابط مرجعي (اختياري)</span>
            <input type="url" name="refUrl" placeholder="https://" dir="ltr" />
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
          <Submit>إرسال الطلب</Submit>
        </ActionForm>
      </div>
    </div>
  );
}
