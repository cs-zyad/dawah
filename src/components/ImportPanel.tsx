"use client";

import { useActionState, useState, useTransition } from "react";
import type { ActionResult } from "@/lib/session";
import type { ClassifiedRow, RawRow } from "@/lib/core/importer";
import { Submit } from "./client";

type Parse = (p: ActionResult<ClassifiedRow[]> | null, fd: FormData) => Promise<ActionResult<ClassifiedRow[]>>;
type Recheck = (rows: RawRow[]) => Promise<ActionResult<ClassifiedRow[]>>;
type Commit = (rows: RawRow[]) => Promise<ActionResult<{ added: number; skipped: number }>>;

const STATUS: Record<ClassifiedRow["status"], [string, string]> = { ok: ["مقبول", "ok"], duplicate: ["مكرر", "warn"], invalid: ["يحتاج تصحيحًا", "bad"] };

export function ImportPanel({ parse, recheck, commit }: { parse: Parse; recheck: Recheck; commit: Commit }) {
  const [rows, setRows] = useState<ClassifiedRow[]>([]);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<ActionResult | null>(null);
  const [parsed, parseAction] = useActionState(async (p: ActionResult<ClassifiedRow[]> | null, fd: FormData) => {
    const r = await parse(p, fd);
    if (r.ok && r.data) {
      setRows(r.data);
      setExcluded(new Set());
      setResult(null);
    }
    return r;
  }, null);
  const [pending, start] = useTransition();
  const kept = rows.filter((r) => !excluded.has(r.index));
  const raw = (rs: ClassifiedRow[]): RawRow[] => rs.map(({ name, phone, email, companion }) => ({ name, phone, email, companion }));
  const counts = { ok: kept.filter((r) => r.status === "ok").length, duplicate: kept.filter((r) => r.status === "duplicate").length, invalid: kept.filter((r) => r.status === "invalid").length };

  const edit = (idx: number, k: keyof RawRow, v: string) => setRows((rs) => rs.map((r) => (r.index === idx ? { ...r, [k]: v } : r)));
  const doRecheck = () =>
    start(async () => {
      const r = await recheck(raw(kept));
      if (r.ok && r.data) {
        // نحافظ على أرقام الصفوف الأصلية
        const map = kept.map((k) => k.index);
        setRows(r.data.map((x, i) => ({ ...x, index: map[i] })));
        setExcluded(new Set());
      }
      setResult(r.ok ? { ok: true, message: "أُعيد التحقق" } : r);
    });
  const doCommit = () =>
    start(async () => {
      const r = await commit(raw(kept));
      setResult(r);
      if (r.ok) setRows([]);
    });

  return (
    <div className="stack">
      <form action={parseAction} className="row">
        <input type="file" name="file" accept=".xlsx,.csv,.xls" required aria-label="ملف المدعوين" className="grow" />
        <Submit className="btn dark">معاينة الاستيراد</Submit>
      </form>
      {parsed && !parsed.ok ? <div className="alert bad">{parsed.error}</div> : null}
      {result ? <div className={`alert ${result.ok ? "ok" : "bad"}`}>{result.ok ? result.message : result.error}</div> : null}
      {rows.length ? (
        <>
          <div className="row">
            <span className="tag ok">مقبول {counts.ok}</span>
            <span className="tag warn">مكرر {counts.duplicate}</span>
            <span className="tag bad">يحتاج تصحيحًا {counts.invalid}</span>
            {excluded.size ? <span className="tag neutral">مستبعد {excluded.size}</span> : null}
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>الصف</th>
                  <th>الحالة</th>
                  <th>الاسم</th>
                  <th>الجوال</th>
                  <th>البريد</th>
                  <th>مرافق</th>
                  <th>استبعاد</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.index} style={{ opacity: excluded.has(r.index) ? 0.45 : 1 }}>
                    <td className="num">{r.index}</td>
                    <td style={{ minWidth: 150 }}>
                      <span className={`tag ${STATUS[r.status][1]}`}>{STATUS[r.status][0]}</span>
                      {r.reasons.length ? <div className="tiny muted">{r.reasons.join("، ")}</div> : null}
                    </td>
                    <td>
                      <input type="text" value={r.name} onChange={(e) => edit(r.index, "name", e.target.value)} aria-label="الاسم" style={{ minWidth: 140 }} />
                    </td>
                    <td>
                      <input type="tel" value={r.phone} onChange={(e) => edit(r.index, "phone", e.target.value)} aria-label="الجوال" dir="ltr" style={{ minWidth: 130 }} />
                    </td>
                    <td>
                      <input type="email" value={r.email} onChange={(e) => edit(r.index, "email", e.target.value)} aria-label="البريد" dir="ltr" style={{ minWidth: 170 }} />
                    </td>
                    <td>
                      <select value={["نعم", "yes", "1", "true"].includes(r.companion.trim().toLowerCase()) ? "نعم" : r.companion.trim() === "" || ["لا", "no", "0", "false"].includes(r.companion.trim().toLowerCase()) ? "لا" : r.companion} onChange={(e) => edit(r.index, "companion", e.target.value)} aria-label="مرافق">
                        <option value="لا">لا</option>
                        <option value="نعم">نعم</option>
                        {!["نعم", "لا", ""].includes(r.companion) && !["yes", "no", "1", "0", "true", "false"].includes(r.companion.toLowerCase()) ? <option value={r.companion}>{r.companion}</option> : null}
                      </select>
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        checked={excluded.has(r.index)}
                        aria-label="استبعاد الصف"
                        onChange={(e) =>
                          setExcluded((s) => {
                            const n = new Set(s);
                            if (e.target.checked) n.add(r.index);
                            else n.delete(r.index);
                            return n;
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row">
            <button type="button" className="btn" onClick={doRecheck} disabled={pending}>
              إعادة التحقق
            </button>
            <button type="button" className="btn primary" onClick={doCommit} disabled={pending || counts.ok === 0}>
              {pending ? "جارٍ التنفيذ…" : `اعتماد المقبول (${counts.ok})`}
            </button>
            <span className="small muted">الاعتماد يعيد التحقق في الخادم ولا يضيف إلا الصفوف المقبولة.</span>
          </div>
        </>
      ) : null}
    </div>
  );
}
