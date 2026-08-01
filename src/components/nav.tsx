"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import {
  IconLogout,
  IconMark,
  IconMegaphone,
  IconActivity,
  IconPhone,
  IconPipeline,
  IconSettings,
  IconTrash,
} from "@/components/icons";
import { Button, StatusDot, cx } from "@/components/ui";
import { useApp } from "@/lib/store";
import { createClient } from "@/lib/supabase/client";

// /home only ever redirects, so it is not a rail destination.
const LINKS = [
  { href: "/setup", label: "Bakery", icon: IconSettings },
  { href: "/campaign", label: "Campaign", icon: IconMegaphone },
  { href: "/leads", label: "Pipeline", icon: IconPipeline },
  { href: "/test-call", label: "Agent Console", icon: IconPhone },
  { href: "/intelligence", label: "Intelligence", icon: IconActivity },
];

/** Left rail + top bar. Fixed rail, scrolling content — a console, not a page. */
export function AppShell({
  userEmail,
  children,
}: {
  userEmail: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { bakery, leads, campaign, resetDemo } = useApp();
  const newLeads = leads.filter((l) => l.status === "new").length;
  const live = campaign?.status === "active";

  const current = LINKS.find(
    (l) => pathname === l.href || pathname.startsWith(l.href + "/"),
  );

  async function signOut() {
    await createClient().auth.signOut();
    window.location.assign("/");
  }

  return (
    <div className="flex min-h-dvh">
      {/* ---------------------------------------------------------------- */}
      {/* Rail                                                              */}
      {/* ---------------------------------------------------------------- */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-gray-200 bg-surface md:flex">
        <div className="flex h-12 items-center gap-2 border-b border-gray-200 px-4">
          <Link href="/home" className="flex min-w-0 items-center gap-2 rounded-md">
            <IconMark className="shrink-0 text-honey" />
            <span className="truncate font-display text-[15px] font-semibold text-gray-1000">
              {bakery?.name ?? "SweetLeads"}
            </span>
          </Link>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {LINKS.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(link.href + "/");
            const Glyph = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cx(
                  "group flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors duration-150",
                  active
                    ? "bg-alpha-200 font-medium text-gray-1000"
                    : "text-gray-900 hover:bg-alpha-100 hover:text-gray-1000",
                )}
              >
                <Glyph
                  className={cx(
                    "shrink-0 transition-colors",
                    active ? "text-gray-1000" : "text-gray-700 group-hover:text-gray-900",
                  )}
                />
                <span className="truncate">{link.label}</span>
                {link.href === "/leads" && newLeads > 0 && (
                  <span className="ml-auto rounded bg-alpha-300 px-1.5 font-mono text-[11px] text-gray-1000 tnum">
                    {newLeads}
                  </span>
                )}
              </Link>
            );
          })}

          {/* Pipeline health, always visible — the point of an ops rail. */}
          <div className="mt-auto rounded-lg border border-gray-200 p-3">
            <p className="label-micro">Campaign</p>
            <div className="mt-2 flex items-center gap-2 text-sm text-gray-1000">
              <StatusDot tone={live ? "green" : "gray"} pulse={live} />
              {live ? "Delivering" : "Not launched"}
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-xs text-gray-900">Leads</span>
              <span className="font-mono text-sm text-gray-1000 tnum">
                {leads.length}
              </span>
            </div>
          </div>
        </nav>

        <div className="border-t border-gray-200 p-2">
          <p className="truncate px-2 pb-2 pt-1 font-mono text-[11px] text-gray-700">
            {userEmail ?? "signed out"}
          </p>
          <button
            onClick={signOut}
            className="flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-sm text-gray-900 transition-colors hover:bg-alpha-100 hover:text-gray-1000"
          >
            <IconLogout className="text-gray-700" />
            Sign out
          </button>
        </div>
      </aside>

      {/* ---------------------------------------------------------------- */}
      {/* Content                                                           */}
      {/* ---------------------------------------------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-12 items-center gap-3 border-b border-gray-200 bg-background/80 px-4 backdrop-blur-md sm:px-6">
          {/* Breadcrumb: org / section, Vercel-style slash separator. */}
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <Link href="/home" className="md:hidden">
              <IconMark className="text-honey" />
            </Link>
            <span className="truncate text-gray-900">
              {bakery?.name ?? "SweetLeads"}
            </span>
            {current && (
              <>
                <span className="text-gray-500">/</span>
                <span className="truncate font-medium text-gray-1000">
                  {current.label}
                </span>
              </>
            )}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {live && (
              <span className="hidden items-center gap-1.5 text-xs text-gray-900 sm:flex">
                <StatusDot tone="green" pulse />
                Live
              </span>
            )}
            <Button
              size="sm"
              variant="tertiary"
              prefix={<IconTrash />}
              onClick={() => {
                if (
                  confirm(
                    "Delete ALL leads, transcripts, the campaign, and the bakery profile?",
                  )
                )
                  resetDemo();
              }}
              title="Delete all leads, transcripts, campaign, and bakery profile"
            >
              <span className="hidden sm:inline">Reset data</span>
            </Button>
          </div>
        </header>

        {/* Mobile nav — the rail collapses to a scrollable tab strip. */}
        <nav className="flex gap-1 overflow-x-auto border-b border-gray-200 px-2 py-1.5 md:hidden">
          {LINKS.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(link.href + "/");
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cx(
                  "shrink-0 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  active
                    ? "bg-alpha-200 font-medium text-gray-1000"
                    : "text-gray-900 hover:text-gray-1000",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
