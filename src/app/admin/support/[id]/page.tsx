import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { getSupportTicket, listReplies, SUPPORT_STATUS_AR, SUPPORT_KIND_AR } from "@/lib/core/support";
import { ActionForm, Submit } from "@/components/client";
import { BackLink, PageHead, Tag } from "@/components/ui";
import { AppError, fmtShort } from "@/lib/util";
import { supportAdminAction } from "../../actions";

export default async function AdminSupportDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await requireAdmin();
  let t;
  try {
    t = await getSupportTicket(a, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const replies = await listReplies(id);
  return (
    <div className="medium stack">
      <BackLink href="/admin/support">الدعم</BackLink>
      <PageHead title={t.subject} sub={`${SUPPORT_KIND_AR[t.kind]} · ${t.ownerName}`} actions={<Tag tone="info">{SUPPORT_STATUS_AR[t.status]}</Tag>} />
      <div className="list">
        <div className="item">
          <div className="meta">
            {t.ownerName} · {fmtShort(t.createdAt)}
          </div>
          <div style={{ whiteSpace: "pre-wrap" }}>{t.body}</div>
        </div>
        {replies.map((r) => (
          <div key={r.id} className="item" style={{ background: r.authorRole === "admin" ? "var(--lilac-2)" : undefined }}>
            <div className="meta">
              {r.authorName} {r.authorRole === "admin" ? "(المنصة)" : ""} · {fmtShort(r.createdAt)}
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{r.body}</div>
          </div>
        ))}
      </div>
      <ActionForm action={supportAdminAction.bind(null, id)} className="card stack" resetOnSuccess>
        <label className="field">
          <span>الرد</span>
          <textarea name="body" maxLength={4000} />
        </label>
        <label className="field">
          <span>الحالة</span>
          <select name="status" defaultValue={t.status}>
            {Object.entries(SUPPORT_STATUS_AR).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <Submit>حفظ</Submit>
      </ActionForm>
    </div>
  );
}
