import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runJobs } from "@/lib/core/jobs";

/** Vercel Cron: يرسل Authorization: Bearer CRON_SECRET */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") || "";
  const expected = `Bearer ${secret}`;
  if (!secret || auth.length !== expected.length || !timingSafeEqual(Buffer.from(auth), Buffer.from(expected))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const r = await runJobs();
  return NextResponse.json(r);
}
