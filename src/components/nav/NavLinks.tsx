"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/settings", label: "My details" },
];

export function NavLinks() {
  const path = usePathname();
  return (
    <>
      {LINKS.map((l) => {
        const active = path === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-md px-2 py-2 whitespace-nowrap ${active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </>
  );
}
