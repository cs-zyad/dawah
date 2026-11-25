import { notFound } from "next/navigation";
import { requireOrganizer } from "@/lib/session";
import { getSupportTicket, listReplies, SUPPORT_STATUS_AR, SUPPORT_KIND_AR } from "@/lib/core/support";
import { BackLink, PageHead, Tag } from "@/components/ui";
import { DesignThread } from "@/components/Thread";
import { AppError } from "@/lib/util";
import { supportReplyAction } from "../../actions";

export default async function SupportDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const u = await requireOrganizer();
  let t;
  try {
    t = await getSupportTicket(u, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const replies = await listReplies(id);
  return (
    <div className="medium stack">
      <BackLink href="/dashboard/support">الدعم</BackLink>
      <PageHead title={t.subject} sub={SUPPORT_KIND_AR[t.kind]} actions={<Tag tone="info">{SUPPORT_STATUS_AR[t.status]}</Tag>} />
      <DesignThread
        messages={[{ id: "root", mine: true, who: t.ownerName, body: t.body, at: t.createdAt }, ...replies.map((r) => ({ id: r.id, mine: r.authorRole === "organizer", who: r.authorRole === "admin" ? "فريق المنصة" : r.authorName, body: r.body, at: r.createdAt }))]}
        action={supportReplyAction.bind(null, id)}
      />
    </div>
  );
}
