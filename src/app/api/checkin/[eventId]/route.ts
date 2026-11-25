import { NextResponse } from "next/server";
import { currentUser, allowedOrigins } from "@/lib/session";
import { canCheckIn, checkInByToken, checkInManually, searchAttendees } from "@/lib/core/checkin";
import { getEvent } from "@/lib/core/events";
import { AppError } from "@/lib/util";

/** واجهة التحضير لتطبيق الماسح. التحقق من الجلسة والصلاحية والفعالية في الخادم. */
export async function POST(req: Request, { params }: { params: Promise<{ eventId: string }> }) {
  // حماية CSRF: نقبل فقط من نفس المصدر وبمحتوى JSON
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (origin && host && ![host, ...allowedOrigins()].includes(new URL(origin).host)) return NextResponse.json({ error: "مصدر غير موثوق" }, { status: 403 });
  if (!(req.headers.get("content-type") || "").includes("application/json")) return NextResponse.json({ error: "طلب غير صالح" }, { status: 415 });
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "سجّل الدخول" }, { status: 401 });
  const { eventId } = await params;
  const access = await canCheckIn(user, eventId);
  if (!access.ok) return NextResponse.json({ error: "الفعالية غير موجودة" }, { status: 404 });
  let body: { op?: string; value?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }
  const value = String(body.value ?? "").slice(0, 300);
  try {
    let result: unknown;
    if (body.op === "scan") result = await checkInByToken(user, eventId, value, "scan");
    else if (body.op === "token") result = await checkInByToken(user, eventId, value, "manual");
    else if (body.op === "manual") result = await checkInManually(user, eventId, value);
    else if (body.op === "search") result = { hits: await searchAttendees(user, eventId, value) };
    else if (body.op === "stats") result = {};
    else return NextResponse.json({ error: "عملية غير معروفة" }, { status: 400 });
    const e = await getEvent(eventId);
    return NextResponse.json({ ...(result as object), count: (e?.checkedInGuests || 0) + (e?.checkedInCompanions || 0), reserved: e?.reservedSeats || 0 });
  } catch (err) {
    if (err instanceof AppError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(err);
    return NextResponse.json({ error: "خطأ غير متوقع" }, { status: 500 });
  }
}
