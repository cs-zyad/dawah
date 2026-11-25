"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function Tabs({ base, items }: { base: string; items: [string, string][] }) {
  const path = usePathname();
  return (
    <nav className="tabs" aria-label="أقسام الفعالية">
      {items.map(([seg, label]) => {
        const href = seg ? `${base}/${seg}` : base;
        const current = seg ? path.startsWith(href) : path === base;
        return (
          <Link key={seg} href={href} aria-current={current ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
