import { loadOwnedEvent } from "@/lib/owned";
import { listWaitlist } from "@/lib/core/rsvp";
import { availableSeats } from "@/lib/core/events";
import { getSettings } from "@/lib/core/settings";
import { ActionForm, Submit } from "@/components/client";
import { IdemKey } from "@/components/IdemKey";
import { Alert, Empty, Ltr, Tag } from "@/components/ui";
import { fmtShort, formatSAR } from "@/lib/util";
import { offerAction } from "../../../actions";

export default async function WaitlistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, event: e } = await loadOwnedEvent(id);
  const [list, s] = await Promise.all([listWaitlist(user.id, e.id), getSettings()]);
  const avail = availableSeats(e);
  return (
    <div className="stack">
      {e.fullPolicy !== "waitlist" ? <Alert tone="info">سياسة هذه الفعالية «إغلاق عند اكتمال العدد»، لذلك لا تُستقبل طلبات انتظار جديدة.</Alert> : null}
      <Alert tone={avail > 0 ? "ok" : "warn"}>
        المقاعد المتاحة الآن: <b className="num">{avail}</b>.{" "}
        {avail > 0
          ? `اختر شخصًا وأرسل له فرصة للتأكيد صالحة ${s.policies.waitlistOfferHours} ساعة. الفرصة لا تحجز المقعد؛ يُحجز عند تأكيده إن كان لا يزال متاحًا.`
          : "لا يمكن إرسال فرصة قبل توفر مقعد (مثلًا بعد اعتذار ضيف أو شراء أماكن إضافية)."}{" "}
        تكلفة رسالة الفرصة تُخصم من رصيد الرسائل ({formatSAR(s.pricing.messagePrice.whatsapp)} واتساب / {formatSAR(s.pricing.messagePrice.email)} بريد).
      </Alert>
      {list.length ? (
        <div className="list">
          {list.map((r, i) => (
            <div className="item row between" key={r.id}>
              <div className="grow">
                <b>
                  {i + 1}. {r.name}
                </b>{" "}
                <Tag tone="neutral">{r.requestedSeats > 1 ? "يطلب مقعدين (مع مرافق)" : "مقعد واحد"}</Tag>
                <div className="meta">
                  <Ltr>{r.contact}</Ltr> · في الانتظار منذ {fmtShort(r.waitlistedAt ?? r.createdAt)}
                </div>
                {r.status === "offered" ? (
                  <div style={{ marginTop: 4 }}>
                    <Tag tone="info">وصلته فرصة — صالحة حتى {fmtShort(r.offerExpiresAt!)}</Tag>
                  </div>
                ) : null}
              </div>
              {r.status === "waitlisted" ? (
                <ActionForm action={offerAction.bind(null, e.id, r.id)} confirm={`إرسال فرصة تأكيد إلى ${r.name}؟`}>
                  <IdemKey />
                  <Submit className="btn small primary" disabled={avail < 1}>
                    إرسال فرصة
                  </Submit>
                </ActionForm>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <Empty>قائمة الانتظار فارغة.</Empty>
      )}
    </div>
  );
}
