import type { CSSProperties, ReactNode } from "react";
import type { LayoutKey } from "@/lib/types";
import type { EventView } from "@/lib/core/view";
import { LogoMark } from "./Logo";

/**
 * تخطيطات الدعوة الخمسة. التصميم ثابت في الكود، والمنظّم يعبّي البيانات فقط.
 * كل البيانات من buildEventView (المصدر الوحيد).
 * الألوان: [الخلفية، النص الرئيسي، اللون المميز، الأسطح الثانوية، النص الثانوي]
 */
export function InvitationCard({ layout, colors, view, children }: { layout: LayoutKey; colors: string[]; view: EventView; children?: ReactNode }) {
  const [bg, text, accent, surface, muted] = colors;
  const vars = { "--t-bg": bg, "--t-text": text, "--t-accent": accent, "--t-surface": surface, "--t-muted": muted } as CSSProperties;
  return (
    <article className={`inv inv-${layout}`} style={vars} aria-label={`دعوة ${view.title}`}>
      <style>{CSS}</style>
      {layout === "corporate" ? <div className="inv-band" /> : null}
      {layout === "workshop" ? (
        <div className="inv-ws-top">
          <span>{view.orgName}</span>
          <span className="inv-pill">ورشة / تدريب</span>
        </div>
      ) : null}
      <div className="inv-inner">
        {layout === "plum_frame" ? (
          <>
            <span className="inv-corner inv-c1" />
            <span className="inv-corner inv-c2" />
          </>
        ) : null}
        {layout !== "workshop" && view.orgName ? <p className="inv-org">{view.orgName}</p> : null}
        {view.guestName ? <p className="inv-guest">{layout === "corporate" ? "السيد/السيدة" : "عزيزنا"} {view.guestName}</p> : null}
        <p className="inv-lead">{layout === "corporate" ? "يتشرف بدعوتكم لحضور" : layout === "workshop" ? "ندعوك للمشاركة في" : "يسعدنا دعوتك لحضور"}</p>
        <h2 className="inv-title">{view.title}</h2>
        {layout === "ivory_classic" ? <div className="inv-orn" aria-hidden="true">✦ ✦ ✦</div> : null}
        {view.description ? <p className="inv-desc">{view.description}</p> : null}
        <dl className="inv-meta">
          <div>
            <dt>الموعد</dt>
            <dd>
              {view.dateText}
              <br />
              <span className="inv-time">
                الساعة {view.timeText}
                {view.endTimeText ? ` — ${view.endTimeText}` : ""}
              </span>
            </dd>
          </div>
          <div>
            <dt>المكان</dt>
            <dd>
              {view.venue || "—"}
              {view.address ? (
                <>
                  <br />
                  <span className="inv-addr">{view.address}</span>
                </>
              ) : null}
              {view.mapUrl ? (
                <>
                  <br />
                  <a href={view.mapUrl} target="_blank" rel="noopener noreferrer" className="inv-map">
                    فتح الموقع على الخريطة
                  </a>
                </>
              ) : null}
            </dd>
          </div>
        </dl>
        {children ? <div className="inv-slot">{children}</div> : null}
        <p className="inv-brand">
          <LogoMark size={16} color={text} accent={accent} /> {view.brandName}
        </p>
      </div>
    </article>
  );
}

const CSS = `
.inv{background:var(--t-bg);color:var(--t-text);border-radius:22px;overflow:hidden;position:relative;box-shadow:0 10px 40px rgba(40,24,44,.12);}
.inv-inner{padding:30px 22px 18px;position:relative;text-align:center}
.inv-org{font-weight:700;letter-spacing:.02em;color:var(--t-muted);margin:0 0 10px;font-size:.95rem}
.inv-guest{font-family:var(--font-head);font-size:1.05rem;margin:0 0 4px}
.inv-lead{color:var(--t-muted);margin:0 0 6px}
.inv-title{font-family:var(--font-head);font-size:clamp(1.45rem,6vw,2rem);line-height:1.4;margin:0 0 12px;color:var(--t-text);overflow-wrap:anywhere}
.inv-desc{color:var(--t-muted);font-size:.95rem;margin:0 auto 14px;max-width:420px;white-space:pre-line}
.inv-meta{display:grid;gap:10px;margin:16px 0 8px;text-align:right}
.inv-meta>div{background:var(--t-surface);border-radius:14px;padding:12px 14px}
.inv-meta dt{font-size:.8rem;color:var(--t-muted);font-weight:700}
.inv-meta dd{margin:2px 0 0;font-weight:600;overflow-wrap:anywhere}
.inv-time,.inv-addr{font-weight:400;color:var(--t-muted);font-size:.92rem}
.inv-map{color:var(--t-text);font-size:.9rem}
.inv-slot{margin-top:16px;text-align:right}
.inv-brand{margin:18px 0 0;font-size:.72rem;color:var(--t-muted);display:flex;gap:6px;align-items:center;justify-content:center}
/* إطار برقوقي */
.inv-plum_frame .inv-inner{margin:12px;border:2px solid color-mix(in srgb,var(--t-accent) 55%,transparent);border-radius:18px}
.inv-plum_frame .inv-title,.inv-plum_frame .inv-guest{color:var(--t-accent)}
.inv-plum_frame .inv-map{color:var(--t-accent)}
.inv-corner{position:absolute;width:38px;height:38px;border:5px solid var(--t-accent)}
.inv-c1{top:-3px;right:-3px;border-left:0;border-bottom:0;border-top-right-radius:16px}
.inv-c2{bottom:-3px;left:-3px;border-right:0;border-top:0;border-bottom-left-radius:16px}
/* عاجي كلاسيكي */
.inv-ivory_classic .inv-inner{margin:10px;border:1px solid var(--t-accent);outline:1px solid var(--t-accent);outline-offset:-8px;border-radius:6px;padding-top:36px}
.inv-ivory_classic .inv-title{font-size:clamp(1.5rem,6.5vw,2.1rem)}
.inv-orn{color:var(--t-accent);letter-spacing:.4em;margin:-4px 0 12px;font-size:.8rem}
.inv-ivory_classic .inv-meta>div{background:transparent;border-top:1px solid var(--t-accent);border-radius:0;text-align:center}
/* ليلكي ناعم */
.inv-lilac_soft{background:linear-gradient(180deg,var(--t-bg),color-mix(in srgb,var(--t-bg) 70%,#fff))}
.inv-lilac_soft .inv-inner{padding-top:38px}
.inv-lilac_soft .inv-inner::before{content:"";position:absolute;top:-60px;left:-60px;width:180px;height:180px;border-radius:50%;background:var(--t-accent);opacity:.45}
.inv-lilac_soft .inv-meta>div{background:var(--t-surface);box-shadow:0 2px 10px rgba(0,0,0,.04)}
.inv-lilac_soft .inv-title{position:relative}
/* رسمي للشركات */
.inv-corporate{border-radius:12px}
.inv-band{height:10px;background:linear-gradient(90deg,var(--t-text) 70%,var(--t-accent) 70%)}
.inv-corporate .inv-inner{text-align:right;padding-top:24px}
.inv-corporate .inv-meta{grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))}
.inv-corporate .inv-meta>div{border-radius:8px;border-inline-start:4px solid var(--t-accent)}
.inv-corporate .inv-brand{justify-content:flex-start}
/* ورش وتدريب */
.inv-ws-top{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:14px 18px;background:var(--t-text);color:var(--t-bg);font-weight:700;font-size:.9rem;flex-wrap:wrap}
.inv-pill{background:var(--t-bg);color:var(--t-text);border-radius:999px;padding:2px 10px;font-size:.78rem}
.inv-workshop .inv-inner{text-align:right;background:var(--t-surface)}
.inv-workshop .inv-title{border-inline-start:6px solid var(--t-accent);padding-inline-start:10px}
.inv-workshop .inv-meta>div{background:var(--t-bg)}
.inv-workshop .inv-brand{justify-content:flex-start}
`;
