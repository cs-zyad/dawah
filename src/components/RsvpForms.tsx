"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/session";
import type { ConfirmResult } from "@/lib/core/rsvp";

type RsvpAction = (prev: ActionResult<ConfirmResult> | null, fd: FormData) => Promise<ActionResult<ConfirmResult>>;

function Btn({ children, className = "btn primary big block", name, value }: { children: React.ReactNode; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending} name={name} value={value}>
      {pending ? "جارٍ الإرسال…" : children}
    </button>
  );
}

/** رسائل النتيجة غير المؤكدة (اكتمال العدد، مقعد واحد، تكرار…) مع خيارات المتابعة */
function Outcome({ r }: { r: ConfirmResult }) {
  switch (r.status) {
    case "one_left":
      return (
        <div className="alert warn stack" role="alert">
          <b>تبقّى مقعد واحد فقط</b>
          <p style={{ margin: 0 }}>لا يتسع المكان لك ولمرافقك معًا. يمكنك التأكيد منفردًا{r.canWaitlist ? "، أو الانضمام لقائمة الانتظار بطلب مقعدين" : ""}.</p>
          <div className="row">
            <Btn className="btn dark" name="acceptSingle" value="1">
              أكّد حضوري منفردًا
            </Btn>
            {r.canWaitlist ? (
              <Btn className="btn ghost" name="joinWaitlist" value="1">
                انضم للانتظار بمقعدين
              </Btn>
            ) : null}
          </div>
        </div>
      );
    case "full":
      return (
        <div className="alert bad stack" role="alert">
          <b>اكتمل العدد</b>
          {r.canWaitlist ? (
            <>
              <p style={{ margin: 0 }}>يمكنك الانضمام لقائمة الانتظار، وسيصلك إشعار إن توفر مقعد.</p>
              <Btn className="btn dark" name="joinWaitlist" value="1">
                انضم لقائمة الانتظار
              </Btn>
            </>
          ) : (
            <p style={{ margin: 0 }}>نعتذر، لا توجد مقاعد متاحة لهذه الفعالية.</p>
          )}
        </div>
      );
    case "duplicate":
      return (
        <div className="alert info" role="status">
          <b>وسيلة التواصل هذه مسجّلة مسبقًا.</b>{" "}
          {r.resent ? "أعدنا إرسال التذكرة إلى صاحب الوسيلة المسجلة." : "أُرسلت التذكرة إليها مؤخرًا؛ تحقق من رسائلك، ويمكن طلب إعادة الإرسال بعد دقائق."}
        </div>
      );
    case "closed":
      return <div className="alert bad">{r.reason}</div>;
    case "offer_expired":
      return <div className="alert warn">انتهت صلاحية فرصة التأكيد، وعدت لقائمة الانتظار.</div>;
    case "offer_lost":
      return <div className="alert warn">نعتذر، المقعد لم يعد متاحًا؛ أخذه ضيف آخر قبل تأكيدك. ما زلت في قائمة الانتظار.</div>;
    case "waitlisted":
      return <div className="alert info">أنت في قائمة الانتظار.</div>;
    default:
      return null;
  }
}

export function GuestRsvpForm({
  action,
  defaults,
  allowCompanion,
  submitLabel = "أكّد حضورك",
  idemKey,
  waitlistOnly,
}: {
  action: RsvpAction;
  defaults: { name: string; phone: string; email: string };
  allowCompanion: boolean;
  submitLabel?: string;
  idemKey?: string;
  waitlistOnly?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const [type, setType] = useState<"phone" | "email">(defaults.phone || !defaults.email ? "phone" : "email");
  const r = state?.ok ? state.data : null;
  return (
    <form action={formAction} className="stack" noValidate={false}>
      {idemKey ? <input type="hidden" name="idemKey" value={idemKey} /> : null}
      {waitlistOnly ? <input type="hidden" name="joinWaitlist" value="1" /> : null}
      <label className="field">
        <span>الاسم</span>
        <input type="text" name="name" required minLength={2} maxLength={120} defaultValue={defaults.name} autoComplete="name" />
      </label>
      <fieldset>
        <legend className="label">أين نرسل لك التذكرة؟</legend>
        <div className="choice-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <label className="choice">
            <input type="radio" name="contactType" value="phone" checked={type === "phone"} onChange={() => setType("phone")} />
            <span>واتساب</span>
          </label>
          <label className="choice">
            <input type="radio" name="contactType" value="email" checked={type === "email"} onChange={() => setType("email")} />
            <span>البريد</span>
          </label>
        </div>
      </fieldset>
      {type === "phone" ? (
        <label className="field" key="phone">
          <span>رقم الجوال (واتساب)</span>
          <input type="tel" name="contact" required inputMode="tel" placeholder="05xxxxxxxx" defaultValue={defaults.phone} autoComplete="tel" dir="ltr" />
        </label>
      ) : (
        <label className="field" key="email">
          <span>البريد الإلكتروني</span>
          <input type="email" name="contact" required placeholder="name@example.com" defaultValue={defaults.email} autoComplete="email" dir="ltr" />
        </label>
      )}
      {allowCompanion ? (
        <label className="check">
          <input type="checkbox" name="withCompanion" />
          <span>
            معي مرافق <span className="muted small">(يُحجز مقعدان، وتصلك تذكرة مستقلة لمرافقك)</span>
          </span>
        </label>
      ) : null}
      {r ? <Outcome r={r} /> : null}
      {state && !state.ok ? (
        <div className="alert bad" role="alert">
          {state.error}
        </div>
      ) : null}
      {!r || (r.status !== "one_left" && !(r.status === "full" && r.canWaitlist)) ? <Btn>{waitlistOnly ? "انضم لقائمة الانتظار" : submitLabel}</Btn> : null}
      <p className="tiny muted center" style={{ margin: 0 }}>
        يُحجز مقعدك لحظة التأكيد، ويُسجَّل حضورك الفعلي عند الدخول.
      </p>
    </form>
  );
}

/** تأكيد من صفحة الإدارة (فرصة انتظار أو بعد الاعتذار) */
export function ConfirmExistingForm({ action, label = "أكّد حضورك" }: { action: RsvpAction; label?: string }) {
  const [state, formAction] = useActionState(action, null);
  const r = state?.ok ? state.data : null;
  return (
    <form action={formAction} className="stack">
      {r ? <Outcome r={r} /> : null}
      {state && !state.ok ? <div className="alert bad">{state.error}</div> : null}
      {!r || (r.status !== "one_left" && r.status !== "full") ? <Btn>{label}</Btn> : null}
    </form>
  );
}

export function DeclineForm({ action, label = "أعتذر عن الحضور" }: { action: (prev: ActionResult | null) => Promise<ActionResult>; label?: string }) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("هل تريد الاعتذار عن الحضور؟ سيُحرَّر مقعدك وتُلغى تذكرتك.")) e.preventDefault();
      }}
    >
      {state && !state.ok ? <div className="alert bad">{state.error}</div> : null}
      {state?.ok ? <div className="alert ok">{state.message}</div> : null}
      <Btn className="btn ghost block">{label}</Btn>
    </form>
  );
}
