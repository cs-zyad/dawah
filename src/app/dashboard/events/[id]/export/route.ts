import { currentUser } from "@/lib/session";
import { getEvent } from "@/lib/core/events";
import { attendanceCsv } from "@/lib/core/stats";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return new Response("غير مصرح", { status: 401 });
  const e = await getEvent(id);
  if (!e || e.ownerId !== user.id) return new Response("غير موجود", { status: 404 });
  const csv = await attendanceCsv(e);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="attendance-${e.id}.csv"; filename*=UTF-8''${encodeURIComponent(`كشف-الحضور-${e.title}.csv`)}`,
      "cache-control": "no-store",
    },
  });
}
