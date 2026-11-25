import type { ActionResult } from "@/lib/session";
import { ActionForm, Submit } from "./client";
import { fmtShort } from "@/lib/util";

export function DesignThread({ messages, action, title = "المراسلات" }: { messages: { id: string; mine: boolean; who: string; body: string; at: number }[]; action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>; title?: string }) {
  return (
    <section className="card stack">
      <h3>{title}</h3>
      {messages.length ? (
        <div className="list">
          {messages.map((m) => (
            <div key={m.id} className="item" style={{ background: m.mine ? "var(--lilac-2)" : "var(--white)", marginInlineStart: m.mine ? 0 : 24, marginInlineEnd: m.mine ? 24 : 0 }}>
              <div className="meta">
                {m.who} · {fmtShort(m.at)}
              </div>
              <div style={{ whiteSpace: "pre-wrap" }} className="break">
                {m.body}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted small">لا توجد رسائل بعد.</p>
      )}
      <ActionForm action={action} className="stack" resetOnSuccess>
        <label className="field">
          <span className="sr-only">رسالتك</span>
          <textarea name="body" required maxLength={3000} placeholder="اكتب رسالتك…" />
        </label>
        <Submit className="btn dark">إرسال</Submit>
      </ActionForm>
    </section>
  );
}
