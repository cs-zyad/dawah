import Link from "next/link";
import type { ReactNode } from "react";
import type { User } from "@/lib/types";
import { Logo } from "./Logo";
import { logoutAction } from "@/app/auth-actions";
import { isDemo } from "@/lib/session";

const NAV: Record<User["role"], [string, string][]> = {
  organizer: [
    ["/dashboard", "فعالياتي"],
    ["/dashboard/credit", "الرصيد والمدفوعات"],
    ["/dashboard/designs", "طلبات التصميم"],
    ["/dashboard/support", "الدعم"],
    ["/checkin", "التحضير"],
  ],
  staff: [["/checkin", "التحضير"]],
  admin: [
    ["/admin", "نظرة عامة"],
    ["/admin/users", "الحسابات"],
    ["/admin/events", "الفعاليات"],
    ["/admin/templates", "القوالب"],
    ["/admin/designs", "التصاميم"],
    ["/admin/support", "الدعم"],
    ["/admin/settings", "الأسعار والسياسات"],
    ["/admin/payments", "المدفوعات"],
    ["/admin/messages", "الرسائل"],
    ["/admin/audit", "سجل التدقيق"],
  ],
};

export function DemoBanner() {
  if (!isDemo()) return null;
  return (
    <div className="demo-banner">
      وضع تجريبي: الرسائل والدفع محاكاة. <Link href="/dev/inbox">صندوق الرسائل التجريبي</Link>
    </div>
  );
}

export function Shell({ user, children, wide = true }: { user: User; children: ReactNode; wide?: boolean }) {
  return (
    <>
      <DemoBanner />
      <header className="topbar">
        <div className="container">
          <Link href={user.role === "admin" ? "/admin" : user.role === "staff" ? "/checkin" : "/dashboard"} aria-label="الرئيسية">
            <Logo light size={30} />
          </Link>
          <nav aria-label="القائمة الرئيسية">
            {NAV[user.role].map(([href, label]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
            <form action={logoutAction}>
              <button type="submit" title={user.email}>
                خروج
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className={`container page ${wide ? "" : "narrow"}`}>{children}</main>
    </>
  );
}

export function PublicHeader() {
  return (
    <>
      <DemoBanner />
      <header className="topbar">
        <div className="container">
          <Link href="/" aria-label="الرئيسية">
            <Logo light size={30} />
          </Link>
          <nav>
            <Link href="/login">دخول</Link>
            <Link href="/register">حساب منظّم</Link>
          </nav>
        </div>
      </header>
    </>
  );
}
