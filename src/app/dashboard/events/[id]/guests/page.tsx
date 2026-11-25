import Link from "next/link";
import { loadOwnedEvent } from "@/lib/owned";
import { loadEventData } from "@/lib/core/stats";
import { links } from "@/lib/core/view";
import { ActionForm, Submit, CopyButton } from "@/components/client";
import { ImportPanel } from "@/components/ImportPanel";
import { AttendTag, Empty, Ltr, RegTag, SendTag, Tag, CHANNEL_LABEL } from "@/components/ui";
import { normalizeArabic } from "@/lib/core/checkin";
import { phoneSearchVariants, fmtShort } from "@/lib/util";
import type { Invitation, Registration, Ticket } from "@/lib/types";
import {
  addInvitationAction,
  updateInvitationAction,
  deleteInvitationAction,
  parseImportAction,
  recheckImportAction,
  commitImportAction,
  cancelRegistrationAction,
  resendTicketAction,
} from "../../../actions";

const FILTERS: [string, string][] = [
  ["all", "الكل"],
  ["none", "لم يؤكد"],
  ["confirmed", "مؤكد"],
  ["attended", "حضر"],
  ["declined", "اعتذر"],
  ["waitlist", "الانتظار"],
  ["failed", "تعذّر الإرسال"],
  ["not_sent", "لم تُرسل"],
];

function matches(q: string, name: string, contacts: (string | null)[]) {
  if (!q) return true;
  if (normalizeArabic(name).includes(normalizeArabic(q))) return true;
  const v = phoneSearchVariants(q);
  return contacts.some((c) => c && (c.toLowerCase().includes(q.toLowerCase()) || v.some((x) => c.replace(/\D/g, "").includes(x))));
}

function RegActions({ eventId, reg, tickets }: { eventId: string; reg: Registration; tickets: Ticket[] }) {
  if (reg.status !== "confirmed") return null;
  const checked = tickets.some((t) => t.status === "active" && t.checkedInAt);
  return (
    <div className="row" style={{ gap: 6 }}>
      <ActionForm action={resendTicketAction.bind(null, eventId, reg.id)}>
        <Submit className="btn small ghost">إعادة إرسال التذكرة</Submit>
      </ActionForm>
      {!checked ? (
        <ActionForm action={cancelRegistrationAction.bind(null, eventId, reg.id)} confirm={`إلغاء تسجيل ${reg.name}؟ تُحرَّر المقاعد وتُلغى التذاكر.`}>
          <Submit className="btn small danger">إلغاء التسجيل</Submit>
        </ActionForm>
      ) : null}
    </div>
  );
}

export default async function GuestsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; f?: string }> }) {
  const { id } = await params;
  const { q = "", f = "all" } = await searchParams;
  const { event: e } = await loadOwnedEvent(id);
  const { invs, regs, tickets } = await loadEventData(e);
  const regById = new Map(regs.map((r) => [r.id, r]));
  const tByReg = new Map<string, Ticket[]>();
  tickets.forEach((t) => tByReg.set(t.registrationId, [...(tByReg.get(t.registrationId) || []), t]));
  const attended = (rid?: string | null) => !!rid && (tByReg.get(rid) || []).some((t) => t.status === "active" && t.checkedInAt);
  const base = `/dashboard/events/${e.id}/guests`;
  const filterNav = (
    <form className="row" action={base} role="search">
      <input type="search" name="q" defaultValue={q} placeholder="بحث بالاسم أو الجوال أو البريد" aria-label="بحث" className="grow" style={{ maxWidth: 340 }} />
      <input type="hidden" name="f" value={f} />
      <button className="btn small" type="submit">
        بحث
      </button>
      <div className="pill-nav">
        {FILTERS.filter(([k]) => e.type === "private" || !["none", "failed", "not_sent"].includes(k)).map(([k, l]) => (
          <Link key={k} href={`${base}?f=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} aria-current={f === k ? "true" : undefined}>
            {l}
          </Link>
        ))}
      </div>
    </form>
  );

  if (e.type === "public") {
    const list = regs
      .filter((r) => matches(q, r.name, [r.contact]))
      .filter((r) => f === "all" || (f === "attended" ? attended(r.id) : f === "waitlist" ? r.status === "waitlisted" || r.status === "offered" : r.status === f));
    return (
      <div className="stack">
        <p className="muted small">في الرابط العام: المسجلون والحاضرون. (حالة «مدعو ولم يؤكد» تخص الدعوات الخاصة فقط.)</p>
        {filterNav}
        {list.length ? (
          <div className="list">
            {list.map((r) => {
              const ts = tByReg.get(r.id) || [];
              return (
                <div className="item" key={r.id}>
                  <div className="row between">
                    <b>{r.name}</b>
                    <div className="row" style={{ gap: 6 }}>
                      <RegTag s={r.status} />
                      <AttendTag t={ts.find((t) => t.kind === "guest")} />
                    </div>
                  </div>
                  <div className="meta">
                    {r.contactType === "phone" ? "واتساب" : "البريد"}: <Ltr>{r.contact}</Ltr> · سجّل {fmtShort(r.createdAt)}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <RegActions eventId={e.id} reg={r} tickets={ts} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty>لا يوجد مسجلون مطابقون.</Empty>
        )}
      </div>
    );
  }

  const list = invs
    .filter((i) => {
      const reg = i.regId ? regById.get(i.regId) : undefined;
      return matches(q, reg?.name || i.name, [i.phone, i.email, reg?.contact ?? null]);
    })
    .filter((i) => {
      if (f === "all") return true;
      if (f === "attended") return attended(i.regId);
      if (f === "waitlist") return i.regStatus === "waitlisted" || i.regStatus === "offered";
      if (f === "failed" || f === "not_sent") return i.sendStatus === f;
      return i.regStatus === f;
    });

  return (
    <div className="stack-lg">
      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <section className="card">
          <h3>إضافة مدعو</h3>
          <ActionForm action={addInvitationAction.bind(null, e.id)} className="stack" resetOnSuccess>
            <label className="field">
              <span>الاسم</span>
              <input type="text" name="name" required maxLength={120} />
            </label>
            <div className="grid grid-2">
              <label className="field">
                <span>الجوال</span>
                <input type="tel" name="phone" placeholder="05xxxxxxxx" dir="ltr" />
              </label>
              <label className="field">
                <span>البريد</span>
                <input type="email" name="email" placeholder="name@example.com" dir="ltr" />
              </label>
            </div>
            <label className="check">
              <input type="checkbox" name="allowCompanion" />
              <span>يسمح بمرافق واحد (يُحتسب مكانين في الباقة)</span>
            </label>
            <Submit>إضافة</Submit>
          </ActionForm>
        </section>
        <section className="card">
          <div className="card-head">
            <h3>استيراد من Excel</h3>
            <a className="btn small ghost" href="/api/sample-import">
              تنزيل ملف نموذجي
            </a>
          </div>
          <p className="small muted">
            الأعمدة: الاسم، الجوال، البريد، مرافق (نعم/لا). يقبل .xlsx و.csv. العناوين بالعربي أو الإنجليزي، وإن لم توجد يُفترض هذا الترتيب.
          </p>
          <ImportPanel parse={parseImportAction.bind(null, e.id)} recheck={recheckImportAction.bind(null, e.id)} commit={commitImportAction.bind(null, e.id)} />
        </section>
      </div>
      <section className="stack">
        <h2 style={{ margin: 0 }}>
          المدعوون <span className="muted small">({invs.length} دعوة)</span>
        </h2>
        {filterNav}
        {list.length ? (
          <div className="list">
            {list.map((i: Invitation) => {
              const reg = i.regId ? regById.get(i.regId) : undefined;
              const ts = reg ? tByReg.get(reg.id) || [] : [];
              const g = ts.find((t) => t.kind === "guest");
              const c = ts.find((t) => t.kind === "companion");
              return (
                <div className="item" key={i.id}>
                  <div className="row between">
                    <div>
                      <b>{reg?.name || i.name}</b> {i.allowCompanion ? <Tag tone="neutral">يسمح بمرافق</Tag> : null}
                    </div>
                    <div className="row" style={{ gap: 6 }}>
                      <SendTag s={i.sendStatus} />
                      <RegTag s={i.regStatus} />
                    </div>
                  </div>
                  <div className="meta">
                    {i.phone ? (
                      <>
                        جوال: <Ltr>{i.phone}</Ltr>{" "}
                      </>
                    ) : null}
                    {i.email ? (
                      <>
                        · بريد: <Ltr>{i.email}</Ltr>
                      </>
                    ) : null}
                    {i.channelOverride ? <> · القناة: {i.channelOverride === "both" ? "الاثنان" : CHANNEL_LABEL[i.channelOverride]}</> : null}
                    {reg && reg.status === "confirmed" ? (
                      <>
                        {" "}
                        · مؤكد عبر {reg.contactType === "phone" ? "واتساب" : "البريد"} (<Ltr>{reg.contact}</Ltr>) — {reg.seats > 1 ? "مع مرافق" : "منفرد"}
                      </>
                    ) : null}
                  </div>
                  {reg?.status === "confirmed" ? (
                    <div className="row" style={{ gap: 6, marginTop: 6 }}>
                      <AttendTag t={g} label="الضيف" />
                      {c ? <AttendTag t={c} label="المرافق" /> : null}
                    </div>
                  ) : null}
                  <div className="row" style={{ gap: 6, marginTop: 8 }}>
                    <CopyButton text={links.invitation(i.token)} label="نسخ رابط الدعوة" />
                    {reg ? <RegActions eventId={e.id} reg={reg} tickets={ts} /> : null}
                    <details>
                      <summary className="btn small ghost" style={{ listStyle: "none" }}>
                        تعديل
                      </summary>
                      <div className="card soft" style={{ marginTop: 8 }}>
                        <ActionForm action={updateInvitationAction.bind(null, e.id, i.id)} className="stack">
                          <label className="field">
                            <span>الاسم</span>
                            <input type="text" name="name" defaultValue={i.name} required />
                          </label>
                          <div className="grid grid-2">
                            <label className="field">
                              <span>الجوال</span>
                              <input type="tel" name="phone" defaultValue={i.phone || ""} dir="ltr" />
                            </label>
                            <label className="field">
                              <span>البريد</span>
                              <input type="email" name="email" defaultValue={i.email || ""} dir="ltr" />
                            </label>
                          </div>
                          <label className="field">
                            <span>قناة الإرسال لهذا المدعو</span>
                            <select name="channelOverride" defaultValue={i.channelOverride || ""}>
                              <option value="">حسب اختيار القائمة</option>
                              <option value="whatsapp">واتساب</option>
                              <option value="email">البريد</option>
                              <option value="both">الاثنان</option>
                            </select>
                          </label>
                          <label className="check">
                            <input type="checkbox" name="allowCompanion" defaultChecked={i.allowCompanion} />
                            <span>يسمح بمرافق</span>
                          </label>
                          <Submit className="btn small primary">حفظ</Submit>
                        </ActionForm>
                        {i.regStatus !== "confirmed" ? (
                          <ActionForm action={deleteInvitationAction.bind(null, e.id, i.id)} confirm={`حذف دعوة ${i.name}؟`}>
                            <Submit className="btn small danger" pendingText="جارٍ الحذف…">
                              حذف الدعوة
                            </Submit>
                          </ActionForm>
                        ) : null}
                      </div>
                    </details>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty>{invs.length ? "لا توجد نتائج مطابقة." : "لم تُضف مدعوين بعد."}</Empty>
        )}
      </section>
    </div>
  );
}
