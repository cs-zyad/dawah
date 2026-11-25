"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import type { ActionResult } from "@/lib/session";

type Action = (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>;

/** نموذج موحّد لإجراءات الخادم مع رسالة النتيجة وحالة الانتظار. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
  confirm,
  id,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  confirm?: string;
  id?: string;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form
      ref={ref}
      id={id}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      <ResultMsg state={state} />
    </form>
  );
}

export function ResultMsg({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  if (state.ok && !state.message) return null;
  return (
    <div className={`alert ${state.ok ? "ok" : "bad"}`} role={state.ok ? "status" : "alert"} style={{ marginTop: 10 }}>
      {state.ok ? state.message : state.error}
    </div>
  );
}

export function Submit({ children, className = "btn primary", pendingText = "جارٍ التنفيذ…", name, value, disabled }: { children: ReactNode; className?: string; pendingText?: string; name?: string; value?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} aria-busy={pending} name={name} value={value}>
      {pending ? pendingText : children}
    </button>
  );
}

export function CopyButton({ text, label = "نسخ", className = "btn small ghost" }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const t = document.createElement("textarea");
          t.value = text;
          document.body.appendChild(t);
          t.select();
          document.execCommand("copy");
          t.remove();
        }
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "تم النسخ ✓" : label}
    </button>
  );
}

export function CopyBox({ value, label = "نسخ الرابط" }: { value: string; label?: string }) {
  return (
    <div className="copy-box">
      <input type="text" readOnly value={value} aria-label="الرابط" onFocus={(e) => e.currentTarget.select()} />
      <CopyButton text={value} label={label} className="btn small dark" />
    </div>
  );
}

export function ShareButton({ url, title, text }: { url: string; title: string; text: string }) {
  const [msg, setMsg] = useState("");
  return (
    <>
      <button
        type="button"
        className="btn primary block"
        onClick={async () => {
          if (navigator.share) {
            try {
              await navigator.share({ title, text, url });
              return;
            } catch {
              return;
            }
          }
          await navigator.clipboard.writeText(url);
          setMsg("نُسخ الرابط. أرسله لمرافقك.");
        }}
      >
        مشاركة التذكرة مع المرافق
      </button>
      {msg ? <p className="small muted center">{msg}</p> : null}
    </>
  );
}

/** تحديث تلقائي للصفحة أثناء الفعالية */
export function AutoRefresh({ seconds = 15, enabled = true }: { seconds?: number; enabled?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds, enabled]);
  return enabled ? <span className="tag info">تحديث تلقائي كل {seconds} ث</span> : null;
}
