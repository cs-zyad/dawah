import { db, C } from "@/lib/db";
import type { AuditEntry } from "@/lib/core/audit";
import type { User } from "@/lib/types";
import { PageHead } from "@/components/ui";
import { fmtShort } from "@/lib/util";

export const metadata = { title: "سجل التدقيق" };

export default async function AuditPage() {
  const [qs, users] = await Promise.all([db().collection(C.audit).get(), db().collection(C.users).get()]);
  const names = new Map(users.docs.map((d) => [d.id, (d.data() as User).name]));
  const list = qs.docs.map((d) => d.data() as AuditEntry).sort((a, b) => b.createdAt - a.createdAt).slice(0, 500);
  return (
    <div className="stack">
      <PageHead title="سجل التدقيق" sub="الدفع، الإعدادات، الصلاحيات، الإلغاء، التسويات." />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>الوقت</th>
              <th>المنفّذ</th>
              <th>العملية</th>
              <th>الهدف</th>
              <th>التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id}>
                <td className="nowrap">{fmtShort(a.createdAt)}</td>
                <td>{names.get(a.actorId) || a.actorId}</td>
                <td className="ltr small">{a.action}</td>
                <td className="ltr tiny mono">{a.target}</td>
                <td>
                  <details>
                    <summary className="tiny">عرض</summary>
                    <pre className="tiny ltr" style={{ whiteSpace: "pre-wrap", maxWidth: 420, overflowWrap: "anywhere" }}>
                      {JSON.stringify(a.details, null, 1)}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
