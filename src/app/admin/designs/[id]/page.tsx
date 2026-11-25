import { notFound } from "next/navigation";
import { getDesignRequest, listDesignMessages, DESIGN_STATUS_AR } from "@/lib/core/designs";
import { getUser } from "@/lib/core/users";
import { ActionForm, Submit } from "@/components/client";
import { DesignThread } from "@/components/Thread";
import { TemplateFields } from "@/components/TemplateFields";
import { BackLink, Ltr, PageHead, Tag } from "@/components/ui";
import { fmtShort, formatSAR } from "@/lib/util";
import { designAdminAction } from "../../actions";

export default async function AdminDesignDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await getDesignRequest(id);
  if (!d) notFound();
  const [msgs, owner] = await Promise.all([listDesignMessages(id), getUser(d.ownerId)]);
  return (
    <div className="medium stack">
      <BackLink href="/admin/designs">طلبات التصميم</BackLink>
      <PageHead title={d.title} sub={<>{owner?.name} (<Ltr>{owner?.email}</Ltr>)</>} actions={<Tag tone="info">{DESIGN_STATUS_AR[d.status]}</Tag>} />
      <div className="card">
        <p style={{ whiteSpace: "pre-wrap" }}>{d.details}</p>
        {d.refUrl ? <a href={d.refUrl} target="_blank" rel="noopener noreferrer" className="ltr small">{d.refUrl}</a> : null}
        {d.quote ? (
          <p className="small muted">
            آخر عرض: {formatSAR(d.quote.amount)} · صالح حتى {fmtShort(d.quote.expiresAt)}
          </p>
        ) : null}
      </div>
      {["pending_review", "quoted"].includes(d.status) ? (
        <div className="grid grid-2" style={{ alignItems: "start" }}>
          <ActionForm action={designAdminAction.bind(null, id, "quote")} className="card stack">
            <h3>إرسال عرض سعر</h3>
            <label className="field">
              <span>المبلغ (ر.س)</span>
              <input type="number" name="amount" min={1} step="0.01" required />
            </label>
            <label className="field">
              <span>صلاحية العرض (أيام)</span>
              <input type="number" name="validDays" min={1} max={60} defaultValue={7} required />
            </label>
            <label className="field">
              <span>ملاحظات</span>
              <textarea name="notes" maxLength={1000} />
            </label>
            <Submit>إرسال العرض</Submit>
          </ActionForm>
          <ActionForm action={designAdminAction.bind(null, id, "reject")} className="card stack" confirm="رفض الطلب؟">
            <h3>رفض الطلب</h3>
            <label className="field">
              <span>السبب</span>
              <input type="text" name="reason" required maxLength={500} />
            </label>
            <Submit className="btn danger">رفض</Submit>
          </ActionForm>
        </div>
      ) : null}
      {d.status === "paid" ? (
        <ActionForm action={designAdminAction.bind(null, id, "start")}>
          <Submit className="btn dark">بدء التنفيذ</Submit>
        </ActionForm>
      ) : null}
      {d.status === "in_progress" || d.status === "paid" ? (
        <ActionForm action={designAdminAction.bind(null, id, "deliver")} className="card stack">
          <h3>التسليم كقالب خاص بهذا المنظّم</h3>
          <TemplateFields t={{ name: `${d.title} (خاص)`, category: "خاص" }} hideVisibility />
          <Submit>تسليم القالب</Submit>
        </ActionForm>
      ) : null}
      <DesignThread
        messages={msgs.map((m) => ({ id: m.id, mine: m.authorRole === "admin", who: m.authorRole === "admin" ? `${m.authorName} (المنصة)` : m.authorName, body: m.body, at: m.createdAt }))}
        action={designAdminAction.bind(null, id, "message")}
      />
    </div>
  );
}
