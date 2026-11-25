"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Result =
  | { result: "ok"; label: string; at: number }
  | { result: "already"; label: string; at: number; method: "scan" | "manual" | null; byName: string | null }
  | { result: "wrong_event" }
  | { result: "cancelled"; label: string }
  | { result: "event_cancelled" }
  | { result: "not_found" };

type Hit = { registrationId: string; name: string; contactMasked: string; tickets: { id: string; kind: string; label: string; status: string; checkedInAt: number | null; method: string | null }[] };

const timeFmt = new Intl.DateTimeFormat("ar-SA-u-nu-latn-ca-gregory", { timeZone: "Asia/Riyadh", hour: "numeric", minute: "2-digit" });

declare global {
  interface Window {
    BarcodeDetector?: new (o: { formats: string[] }) => { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };
  }
}

export function Scanner({ eventId, initialCount, capacity }: { eventId: string; initialCount: number; capacity: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const busyRef = useRef(false);
  const [camState, setCamState] = useState<"idle" | "starting" | "on" | "error" | "insecure">("idle");
  const [camError, setCamError] = useState("");
  const [engine, setEngine] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [count, setCount] = useState(initialCount);
  const [reserved, setReserved] = useState(capacity);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [msg, setMsg] = useState("");

  const call = useCallback(
    async (op: string, value: string) => {
      const r = await fetch(`/api/checkin/${eventId}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op, value }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "خطأ");
      if (typeof j.count === "number") setCount(j.count);
      if (typeof j.reserved === "number") setReserved(j.reserved);
      return j;
    },
    [eventId],
  );

  const handle = useCallback(
    async (op: "scan" | "token" | "manual", value: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setMsg("");
      try {
        const j = (await call(op, value)) as Result;
        setRes(j);
        if (navigator.vibrate) navigator.vibrate(j.result === "ok" ? 120 : [90, 70, 90]);
        if (op === "manual") setHits(null);
      } catch (e) {
        setMsg((e as Error).message);
      } finally {
        busyRef.current = false;
      }
    },
    [call],
  );

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamState("idle");
  }, []);

  const start = useCallback(async () => {
    if (!window.isSecureContext) {
      setCamState("insecure");
      return;
    }
    setCamState("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      streamRef.current = stream;
      const v = videoRef.current!;
      v.srcObject = stream;
      await v.play();
      setCamState("on");
      let detector: InstanceType<NonNullable<Window["BarcodeDetector"]>> | null = null;
      const forceJsqr = new URLSearchParams(location.search).get("engine") === "jsqr";
      if (window.BarcodeDetector && !forceJsqr) {
        try {
          detector = new window.BarcodeDetector({ formats: ["qr_code"] });
          await detector.detect(v);
          setEngine("BarcodeDetector");
        } catch {
          detector = null;
        }
      }
      const jsQR = detector ? null : (await import("jsqr")).default;
      if (!detector) setEngine("jsQR");
      const canvas = (canvasRef.current ||= document.createElement("canvas"));
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const tick = async () => {
        if (!streamRef.current) return;
        try {
          if (v.readyState >= 2 && !busyRef.current) {
            let text: string | null = null;
            if (detector) {
              const codes = await detector.detect(v);
              text = codes[0]?.rawValue ?? null;
            } else if (jsQR) {
              const w = Math.min(v.videoWidth, 640);
              const h = Math.round((v.videoHeight / v.videoWidth) * w);
              canvas.width = w;
              canvas.height = h;
              ctx.drawImage(v, 0, 0, w, h);
              const img = ctx.getImageData(0, 0, w, h);
              text = jsQR(img.data, w, h, { inversionAttempts: "dontInvert" })?.data ?? null;
            }
            const now = Date.now();
            if (text && !(text === lastRef.current.text && now - lastRef.current.at < 3500)) {
              lastRef.current = { text, at: now };
              await handle("scan", text);
            }
          }
        } catch {}
        setTimeout(tick, 120);
      };
      tick();
    } catch (e) {
      setCamState("error");
      setCamError((e as Error).name === "NotAllowedError" ? "لم يُسمح باستخدام الكاميرا. فعّل الإذن من إعدادات المتصفح." : "تعذّر تشغيل الكاميرا على هذا الجهاز.");
    }
  }, [handle]);

  useEffect(() => () => stop(), [stop]);

  return (
    <div className="stack">
      <div className="row between">
        <div className="stat" style={{ padding: "8px 14px" }}>
          <span className="k">الحاضرون</span>{" "}
          <b className="num" style={{ fontSize: "1.4rem" }} data-testid="count">
            {count}
          </b>{" "}
          <span className="s">من {reserved} محجوز</span>
        </div>
        {camState === "on" ? (
          <button className="btn small ghost" onClick={stop}>
            إيقاف الكاميرا
          </button>
        ) : (
          <button className="btn primary" onClick={start} disabled={camState === "starting"}>
            {camState === "starting" ? "جارٍ التشغيل…" : "تشغيل الكاميرا"}
          </button>
        )}
      </div>

      <div className={`scanner-video${camState === "on" || camState === "starting" ? "" : " hidden"}`}>
        <video ref={videoRef} playsInline muted aria-label="معاينة الكاميرا" />
        <div className="scanner-frame" />
      </div>
      {engine && camState === "on" ? <p className="tiny muted center" style={{ margin: 0 }}>وجّه الكاميرا نحو رمز QR ({engine})</p> : null}
      {camState === "insecure" ? (
        <div className="alert warn">
          الكاميرا على الجوال تحتاج اتصالًا آمنًا (HTTPS). افتح المنصة من رابطها الآمن، أو استخدم البدائل بالأسفل: إدخال الرمز أو رابط التذكرة، أو البحث بالاسم أو الجوال.
        </div>
      ) : null}
      {camState === "error" ? <div className="alert bad">{camError} استخدم البدائل بالأسفل.</div> : null}

      <div aria-live="assertive" data-testid="scan-result">
        {res ? <ResultCard r={res} /> : <div className="scan-result idle">جاهز للمسح</div>}
      </div>
      {msg ? <div className="alert bad">{msg}</div> : null}

      <details className="card" open={camState === "insecure" || camState === "error"}>
        <summary>إدخال الرمز أو رابط التذكرة يدويًا</summary>
        <form
          className="row"
          style={{ marginTop: 10 }}
          onSubmit={(e) => {
            e.preventDefault();
            const v = new FormData(e.currentTarget).get("code") as string;
            if (v) handle("token", v);
          }}
        >
          <input type="text" name="code" placeholder="الصق الرمز أو الرابط" dir="ltr" className="grow" aria-label="الرمز أو الرابط" style={{ flex: 1, minWidth: 0 }} />
          <button className="btn dark" type="submit">
            تحقق
          </button>
        </form>
      </details>

      <details className="card" open={hits !== null}>
        <summary>تعذّر عرض الرمز؟ بحث بالاسم أو الجوال أو البريد</summary>
        <form
          className="row"
          style={{ marginTop: 10 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const v = new FormData(e.currentTarget).get("q") as string;
            setMsg("");
            try {
              const j = await call("search", v);
              setHits(j.hits);
            } catch (err) {
              setMsg((err as Error).message);
            }
          }}
        >
          <input type="search" name="q" required minLength={2} placeholder="الاسم أو جزء من الجوال أو البريد" className="grow" aria-label="بحث" style={{ flex: 1, minWidth: 0 }} />
          <button className="btn dark" type="submit">
            بحث
          </button>
        </form>
        {hits ? (
          hits.length ? (
            <div className="list" style={{ marginTop: 10 }}>
              {hits.map((h) => (
                <div key={h.registrationId} className="item">
                  <b>{h.name}</b>{" "}
                  <span className="meta">
                    <bdi dir="ltr">{h.contactMasked}</bdi>
                  </span>
                  <div className="stack" style={{ marginTop: 8 }}>
                    {h.tickets.map((t) => (
                      <div key={t.id} className="row between">
                        <span>{t.label}</span>
                        {t.status !== "active" ? (
                          <span className="tag bad">ملغاة</span>
                        ) : t.checkedInAt ? (
                          <span className="tag plum">حضر {timeFmt.format(t.checkedInAt)} ({t.method === "manual" ? "يدوي" : "مسح"})</span>
                        ) : (
                          <button className="btn small primary" onClick={() => handle("manual", t.id)}>
                            تسجيل الحضور يدويًا
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted small">لا توجد نتائج مؤكدة داخل هذه الفعالية.</p>
          )
        ) : null}
      </details>
    </div>
  );
}

function ResultCard({ r }: { r: Result }) {
  switch (r.result) {
    case "ok":
      return (
        <div className="scan-result ok" role="status">
          ✓ تم تسجيل الدخول
          <span className="who">{r.label}</span>
          <span className="small">الساعة {timeFmt.format(r.at)}</span>
        </div>
      );
    case "already":
      return (
        <div className="scan-result already" role="status">
          ! حضر مسبقًا
          <span className="who">{r.label}</span>
          <span className="small">
            الساعة {timeFmt.format(r.at)} — {r.method === "manual" ? "يدويًا" : "بالمسح"}
            {r.byName ? ` بواسطة ${r.byName}` : ""}
          </span>
        </div>
      );
    case "wrong_event":
      return (
        <div className="scan-result bad" role="alert">
          ✕ هذه التذكرة لا تخص هذه الفعالية
        </div>
      );
    case "cancelled":
      return (
        <div className="scan-result bad" role="alert">
          ✕ تذكرة ملغاة
          <span className="who">{r.label}</span>
          <span className="small">اعتذر صاحبها أو أُلغي تسجيله</span>
        </div>
      );
    case "event_cancelled":
      return <div className="scan-result bad">✕ الفعالية ملغاة</div>;
    default:
      return (
        <div className="scan-result bad" role="alert">
          ✕ رمز غير معروف
        </div>
      );
  }
}
