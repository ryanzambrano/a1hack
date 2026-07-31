"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/lib/store";

const LINKS = [
  { href: "/setup", label: "Setup" },
  { href: "/campaign", label: "Campaign" },
  { href: "/leads", label: "Leads" },
];

export function Nav() {
  const pathname = usePathname();
  const { bakery, leads, resetDemo } = useApp();
  const newLeads = leads.filter((l) => l.status === "new").length;

  return (
    <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="text-xl">🍰</span>
          <span className="text-stone-800">
            Sweet<span className="text-rose-600">Leads</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {LINKS.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`relative rounded-full px-3 py-1.5 font-medium transition-colors ${
                  active
                    ? "bg-rose-600 text-white"
                    : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                {link.label}
                {link.href === "/leads" && newLeads > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                    {newLeads}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {bakery && (
            <span className="hidden text-sm text-stone-500 sm:inline">
              {bakery.name}
            </span>
          )}
          <button
            onClick={resetDemo}
            className="rounded-full border border-stone-200 px-3 py-1 text-xs text-stone-500 transition-colors hover:bg-stone-100"
            title="Clear all demo data"
          >
            Reset demo
          </button>
        </div>
      </div>
    </header>
  );
}
