"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", icon: "📋", label: "プラン診断" },
  { href: "/gear", icon: "🎒", label: "マイギア" },
  { href: "/diary", icon: "📔", label: "日記" },
  { href: "/history", icon: "🗂️", label: "履歴" },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {ITEMS.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}>
            <span className="icon">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
