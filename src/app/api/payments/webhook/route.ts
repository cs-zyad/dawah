import { NextResponse } from "next/server";
import { handlePaymentWebhook } from "@/lib/core/payments";

/**
 * إشعار الدفع الموثّق من المزوّد إلى الخادم — المسار الوحيد لتثبيت الدفع وزيادة السعة وشحن الرصيد.
 * التحقق: التوقيع، ثم المبلغ والعملة، ثم تطبيق الأثر مرة واحدة لكل إشعار داخل معاملة.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > 64 * 1024) return NextResponse.json({ error: "too large" }, { status: 413 });
  try {
    const r = await handlePaymentWebhook(raw, req.headers);
    return NextResponse.json(r.error ? { error: r.error } : { outcome: r.outcome }, { status: r.status });
  } catch (e) {
    console.error("webhook error", e);
    // 500 يجعل المزوّد يعيد المحاولة لاحقًا، والمعالجة آمنة للتكرار
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
