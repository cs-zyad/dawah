import { notFound } from "next/navigation";
import { requireOrganizer } from "@/lib/session";
import { getDesignRequest, listDesignMessages, DESIGN_STATUS_AR } from "@/lib/core/designs";
import { getTemplate } from "@/lib/core/templates";
import { ActionForm, Submit } from "@/components/client";
import { Alert, BackLink, PageHead, Tag } from "@/components/ui";
import { DesignThread } from "@/components/Thread";
import { fmtShort, formatSAR, now } from "@/lib/util";
import { designAction, designMessageAction } from "../../actions";

export default async function DesignDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireOrganizer();
  const d = await getDesignRequest(id);
  if (!d || d.ownerId !== u.id) notFound();
  const [msgs, tpl] = await Promise.all([listDesignMessages(id), getTemplate(d.templateId)]);
  const expired = d.quote && d.quote.expiresAt < now();
  return (
    <div className="medium stack">
      <BackLink href="/dashboard/designs">طلبات التصميم</BackLink>
      <PageHead title={d.title} actions={<Tag tone="info">{DESIGN_STATUS_AR[d.status]}</Tag>} />
      <div className="card stack">
        <p style={{ whiteSpace: "pre-wrap" }}>{d.details}</p>
        {d.refUrl ? (
          <a href={d.refUrl} target="_blank" rel="noopener noreferrer" className="small ltr">
            {d.refUrl}
          </a>
        ) : null}
      </div>
      {d.quote ? (
        <div className="card stack">
          <h3>عرض السعر</h3>
          <p>
            المبلغ: <b>{formatSAR(d.quote.amount)}</b> · صالح حتى {fmtShort(d.quote.expiresAt)} {expired ? <Tag tone="bad">منتهي</Tag> : null}
          </p>
          {d.quote.notes ? <p className="small" style={{ whiteSpace: "pre-wrap" }}>{d.quote.notes}</p> : null}
          <div className="row">
            {d.status === "quoted" && !expired ? (
              <ActionForm action={designAction.bind(null, d.id, "accept")}>
                <Submit>قبول العرض</Submit>
              </ActionForm>
            ) : null}
            {d.status === "accepted" ? (
              <ActionForm action={designAction.bind(null, d.id, "pay")}>
                <Submit>ادفع {formatSAR(d.quote.amount)}</Submit>
              </ActionForm>
            ) : null}
          </div>
        </div>
      ) : null}
      {d.status === "rejected" ? <Alert tone="bad">رُفض الطلب: {d.rejectReason}</Alert> : null}
      {d.status === "delivered" ? <Alert tone="ok">تم التسليم: القالب «{tpl?.name}» متاح لك الآن عند اختيار قالب أي فعالية.</Alert> : null}
      {["pending_review", "quoted", "accepted"].includes(d.status) ? (
        <ActionForm action={designAction.bind(null, d.id, "cancel")} confirm="إلغاء الطلب؟">
          <Submit className="btn small ghost">إلغاء الطلب</Submit>
        </ActionForm>
      ) : null}
      <DesignThread messages={msgs.map((m) => ({ id: m.id, mine: m.authorRole === "organizer", who: m.authorRole === "admin" ? "فريق المنصة" : m.authorName, body: m.body, at: m.createdAt }))} action={designMessageAction.bind(null, d.id)} />
    </div>
  );
}
