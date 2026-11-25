import Link from "next/link";
import { notFound } from "next/navigation";
import { loadOwnedEvent } from "@/lib/owned";
import { estimateSend, listReminders, needsReminder } from "@/lib/core/sending";
import { listInvitations } from "@/lib/core/events";
import { getSettings } from "@/lib/core/settings";
import { getUser } from "@/lib/core/users";
import { ActionForm, Submit } from "@/components/client";
import { IdemKey } from "@/components/IdemKey";
import { Alert, Stat, Tag } from "@/components/ui";
import { AppError, fmtShort, formatSAR, msToRiyadhLocal, now } from "@/lib/util";
import type { ChannelMode } from "@/lib/types";
import { sendAction, scheduleReminderAction, cancelReminderAction } from "../../../actions";

async function safeEstimate(...a: Parameters<typeof estimateSend>) {
  try {
    return { ok: true as const, e: await estimateSend(...a) };
  } catch (err) {
    return { ok: false as const, error: err instanceof AppError ? err.message : "تعذّر الحساب" };
  }
}

const MODES: [ChannelMode, string][] = [
  ["both", "واتساب + البريد"],
  ["whatsapp", "واتساب"],
  ["email", "البريد"],
];

function ModeSelect() {
  return (
    <fieldset>
      <legend className="label">القناة للقائمة كاملة</legend>
      <div className="choice-grid">
        {MODES.map(([m, l]) => (
          <label className="choice" key={m}>
            <input type="radio" name="mode" value={m} defaultChecked={m === "both"} />
            <span>{l}</span>
          </label>
        ))}
      </div>
      <small className="hint">تُعدّل تلقائيًا حسب بيانات التواصل المتاحة لكل مدعو، ويمكن تعديل القناة لكل مدعو من قائمة المدعوين.</small>
    </fieldset>
  );
}

function EstimateTable({ rows }: { rows: { mode: string; r: Awaited<ReturnType<typeof safeEstimate>> }[] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>القناة</th>
            <th>المستلمون</th>
            <th>الرسائل</th>
            <th>التكلفة المتوقعة</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ mode, r }) => (
            <tr key={mode}>
              <td>{mode}</td>
              {r.ok ? (
                <>
                  <td className="num">{r.e.recipients}</td>
                  <td className="num">
                    {r.e.messages} <span className="tiny muted">(واتساب {r.e.byChannel.whatsapp} · بريد {r.e.byChannel.email})</span>
                  </td>
                  <td className="num">
                    {formatSAR(r.e.cost)} {r.e.enough ? null : <Tag tone="bad">الرصيد غير كافٍ</Tag>}
                  </td>
                </>
              ) : (
                <td colSpan={3} className="small muted">
                  {r.error}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function SendPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, event: e } = await loadOwnedEvent(id);
  if (e.type !== "private") notFound();
  const [invs, settings, fresh, reminders] = await Promise.all([listInvitations(e.id), getSettings(), getUser(user.id), listReminders(e.id)]);
  const balance = fresh?.creditBalance || 0;
  const failedIds = invs.filter((i) => i.sendStatus === "failed").map((i) => i.id);
  const notSent = invs.filter((i) => i.sendStatus === "not_sent").length;
  const remindable = invs.filter(needsReminder).length;
  const [inv, rem, fail] = await Promise.all([
    Promise.all(MODES.map(async ([m, l]) => ({ mode: l, r: await safeEstimate(user.id, e.id, "invitation", m) }))),
    Promise.all(MODES.map(async ([m, l]) => ({ mode: l, r: await safeEstimate(user.id, e.id, "reminder", m) }))),
    failedIds.length ? Promise.all(MODES.map(async ([m, l]) => ({ mode: l, r: await safeEstimate(user.id, e.id, "invitation", m, failedIds) }))) : Promise.resolve([]),
  ]);
  const blocked = inv[0].r.ok ? null : inv[0].r.error;
  const base = `/dashboard/events/${e.id}`;
  return (
    <div className="stack-lg">
      <div className="grid grid-4">
        <Stat k="رصيد الرسائل" v={formatSAR(balance)} s={<Link href="/dashboard/credit">شحن الرصيد</Link>} hl />
        <Stat k="سعر الرسالة" v={formatSAR(settings.pricing.messagePrice.whatsapp)} s={`واتساب · البريد ${formatSAR(settings.pricing.messagePrice.email)}${settings.pricing.demo ? " (أسعار تجريبية)" : ""}`} />
        <Stat k="لم تُرسل بعد" v={notSent} />
        <Stat k="بحاجة لتذكير" v={remindable} s="وصلتهم الدعوة ولم يردوا" />
      </div>
      <Alert tone="info">
        رسوم الدعوات والتذكيرات تُخصم من رصيد الرسائل حسب القناة. رسالة تأكيد الحضور مع التذكرة <b>مشمولة في الباقة</b> ولا تُخصم من الرصيد. عند عدم كفاية الرصيد:{" "}
        {settings.policies.insufficientCredit === "block" ? "يُمنع الإرسال كاملًا (لا يُرسل ولا يُخصم شيء)" : "يُرسل ما يغطيه الرصيد بترتيب القائمة"}.
      </Alert>
      {blocked ? (
        <Alert tone="warn">
          {blocked}{" "}
          <Link href={`${base}/payment`}>الباقة والدفع</Link>
        </Alert>
      ) : null}

      <section className="card stack">
        <h2>إرسال الدعوة الأولى</h2>
        <p className="small muted">تُرسل لكل من لم تصله الدعوة بعد ({notSent} مدعو).</p>
        <EstimateTable rows={inv} />
        <ActionForm action={sendAction.bind(null, e.id)} className="stack" confirm="تأكيد الإرسال؟ ستُخصم التكلفة من رصيد الرسائل.">
          <IdemKey />
          <input type="hidden" name="kind" value="invitation" />
          <ModeSelect />
          <Submit disabled={!!blocked || !notSent}>إرسال الدعوات</Submit>
        </ActionForm>
      </section>

      {failedIds.length ? (
        <section className="card stack">
          <h2>إعادة الإرسال لمن تعذّر الإرسال إليهم ({failedIds.length})</h2>
          <p className="small muted">صحّح الرقم أو البريد من قائمة المدعوين أولًا. إعادة الإرسال رسالة جديدة بتكلفة جديدة.</p>
          <EstimateTable rows={fail} />
          <ActionForm action={sendAction.bind(null, e.id)} className="stack" confirm="تأكيد إعادة الإرسال؟">
            <IdemKey />
            <input type="hidden" name="kind" value="invitation" />
            {failedIds.map((x) => (
              <input key={x} type="hidden" name="ids" value={x} />
            ))}
            <ModeSelect />
            <Submit className="btn dark">إعادة الإرسال</Submit>
          </ActionForm>
        </section>
      ) : null}

      <section className="card stack">
        <h2>تذكير من لم يؤكد</h2>
        <p className="small muted">يصل فقط لمن وصلته الدعوة ولم يرد بعد ({remindable} مدعو).</p>
        <EstimateTable rows={rem} />
        <div className="grid grid-2" style={{ alignItems: "start" }}>
          <ActionForm action={sendAction.bind(null, e.id)} className="stack card soft" confirm="إرسال التذكير الآن؟">
            <h3>تذكير الآن</h3>
            <IdemKey />
            <input type="hidden" name="kind" value="reminder" />
            <ModeSelect />
            <Submit className="btn dark" disabled={!remindable || !!blocked}>
              إرسال التذكير الآن
            </Submit>
          </ActionForm>
          <ActionForm action={scheduleReminderAction.bind(null, e.id)} className="stack card soft">
            <h3>جدولة تذكير</h3>
            <label className="field">
              <span>الموعد (بتوقيت الرياض)</span>
              <input type="datetime-local" name="runAt" required min={msToRiyadhLocal(now())} max={msToRiyadhLocal(e.endAt)} />
            </label>
            <ModeSelect />
            <small className="hint">عند التنفيذ يُعاد فحص حالة كل مدعو، فلا يصل لمن أكّد أو اعتذر في الأثناء. التكلفة المتوقعة أعلاه تقديرية بحسب الحالة الآن.</small>
            <Submit className="btn dark" disabled={!!blocked}>
              جدولة
            </Submit>
          </ActionForm>
        </div>
        {reminders.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الموعد</th>
                  <th>القناة</th>
                  <th>الحالة</th>
                  <th>النتيجة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {reminders.map((r) => (
                  <tr key={r.id}>
                    <td className="nowrap">{fmtShort(r.runAt)}</td>
                    <td>{MODES.find(([m]) => m === r.mode)?.[1]}</td>
                    <td>
                      <Tag tone={r.status === "done" ? "ok" : r.status === "failed" ? "bad" : r.status === "cancelled" ? "neutral" : "info"}>
                        {{ scheduled: "مجدول", running: "قيد التنفيذ", done: "نُفّذ", failed: "فشل", cancelled: "ملغى" }[r.status]}
                      </Tag>
                    </td>
                    <td className="small">{r.result || "—"}</td>
                    <td>
                      {r.status === "scheduled" ? (
                        <ActionForm action={cancelReminderAction.bind(null, e.id, r.id)}>
                          <Submit className="btn small ghost">إلغاء</Submit>
                        </ActionForm>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
