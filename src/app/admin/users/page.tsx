import { db, C } from "@/lib/db";
import type { User } from "@/lib/types";
import { ActionForm, Submit } from "@/components/client";
import { IdemKey } from "@/components/IdemKey";
import { Empty, Ltr, PageHead, Tag } from "@/components/ui";
import { fmtShort, formatSAR, normalizeEmail } from "@/lib/util";
import { suspendAction, adjustCreditAction } from "../actions";

export const metadata = { title: "الحسابات" };
const ROLE = { organizer: "منظّم", staff: "استقبال", admin: "أدمن" };

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const users = (await db().collection(C.users).get()).docs.map((d) => d.data() as User).sort((a, b) => b.createdAt - a.createdAt);
  const nq = q.trim().toLowerCase();
  const list = nq ? users.filter((u) => u.name.toLowerCase().includes(nq) || u.email.includes(normalizeEmail(nq) || nq)) : users;
  return (
    <div className="stack">
      <PageHead title="الحسابات" />
      <form className="row" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="بحث بالاسم أو البريد" className="grow" style={{ maxWidth: 360 }} aria-label="بحث" />
        <button className="btn small">بحث</button>
      </form>
      {list.length ? (
        <div className="list">
          {list.map((u) => (
            <div key={u.id} className="item">
              <div className="row between">
                <div>
                  <b>{u.name}</b> <Tag tone="neutral">{ROLE[u.role]}</Tag> {u.status === "suspended" ? <Tag tone="bad">موقوف</Tag> : u.status === "invited" ? <Tag tone="warn">مدعو</Tag> : <Tag tone="ok">نشط</Tag>}
                  <div className="meta">
                    <Ltr>{u.email}</Ltr> · منذ {fmtShort(u.createdAt)} {u.role === "organizer" ? `· الرصيد ${formatSAR(u.creditBalance || 0)}` : ""}
                  </div>
                </div>
              </div>
              {u.role !== "admin" ? (
                <details style={{ marginTop: 8 }}>
                  <summary className="small">إجراءات</summary>
                  <div className="grid grid-2" style={{ marginTop: 8 }}>
                    <ActionForm action={suspendAction.bind(null, u.id, u.status !== "suspended")} className="stack card soft">
                      <label className="field">
                        <span>{u.status === "suspended" ? "سبب التفعيل" : "سبب الإيقاف"}</span>
                        <input type="text" name="reason" required maxLength={300} />
                      </label>
                      <Submit className={u.status === "suspended" ? "btn primary small" : "btn danger small"}>{u.status === "suspended" ? "تفعيل الحساب" : "إيقاف الحساب (ينهي الجلسات)"}</Submit>
                    </ActionForm>
                    {u.role === "organizer" ? (
                      <ActionForm action={adjustCreditAction.bind(null, u.id)} className="stack card soft">
                        <IdemKey />
                        <div className="row">
                          <select name="direction" defaultValue="credit" aria-label="الاتجاه" style={{ maxWidth: 120 }}>
                            <option value="credit">إضافة</option>
                            <option value="debit">خصم</option>
                          </select>
                          <input type="number" name="amount" step="0.01" min="0.01" required placeholder="المبلغ ر.س" aria-label="المبلغ" style={{ maxWidth: 140 }} />
                        </div>
                        <label className="field">
                          <span>سبب التسوية (يُسجّل)</span>
                          <input type="text" name="reason" required maxLength={300} />
                        </label>
                        <Submit className="btn small dark">تسوية الرصيد</Submit>
                      </ActionForm>
                    ) : null}
                  </div>
                </details>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <Empty>لا نتائج.</Empty>
      )}
    </div>
  );
}
