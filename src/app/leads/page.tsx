"use client";

import Link from "next/link";
import { useApp } from "@/lib/store";
import { LEAD_STATUS_LABELS, type Lead, type LeadStatus } from "@/lib/types";

const COLUMNS: { status: LeadStatus; accent: string; dot: string }[] = [
  { status: "new", accent: "border-t-amber-400", dot: "bg-amber-400" },
  { status: "calling", accent: "border-t-sky-400", dot: "bg-sky-400" },
  { status: "qualified", accent: "border-t-green-500", dot: "bg-green-500" },
  { status: "follow_up", accent: "border-t-orange-400", dot: "bg-orange-400" },
  { status: "closed", accent: "border-t-stone-400", dot: "bg-stone-400" },
];

function timeAgo(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function LeadCard({ lead }: { lead: Lead }) {
  return (
    <Link
      href={`/leads/${lead.id}`}
      className="animate-fade-up block rounded-xl border border-stone-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <p className="font-semibold text-stone-800">{lead.name}</p>
        {lead.status === "calling" && (
          <span className="animate-pulse text-sky-500" title="Call in progress">
            📞
          </span>
        )}
      </div>
      <p className="text-xs text-stone-400">{lead.phone}</p>
      <p className="mt-1 text-xs text-stone-400">
        {lead.source} · {timeAgo(lead.createdAt)}
      </p>
      {lead.order && (
        <p className="mt-2 rounded-lg bg-rose-50 px-2 py-1 text-xs text-rose-700">
          🎂 {lead.order.eventType} · {lead.order.eventDate} ·{" "}
          {lead.order.budget}
        </p>
      )}
      {lead.status === "new" && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
          Ready for AI call →
        </p>
      )}
    </Link>
  );
}

export default function LeadsPage() {
  const { leads, campaign, hydrated, simulateIncomingLead } = useApp();

  if (!hydrated) return null;

  return (
    <div className="animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-800">Leads</h1>
          <p className="mt-1 text-sm text-stone-500">
            {campaign?.status === "active"
              ? "Your campaign is live — new leads land here and get called automatically."
              : "Launch your campaign to start receiving leads."}
          </p>
        </div>
        <button
          onClick={simulateIncomingLead}
          className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-600 shadow-sm hover:bg-stone-50"
        >
          + Simulate incoming lead
        </button>
      </div>

      {process.env.NEXT_PUBLIC_AGENT_NUMBER && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3">
          <span className="text-xl">📞</span>
          <p className="text-sm text-sky-900">
            <span className="font-semibold">Live AI agent line: </span>
            <a
              href={`tel:${process.env.NEXT_PUBLIC_AGENT_NUMBER}`}
              className="font-mono font-semibold underline"
            >
              {process.env.NEXT_PUBLIC_AGENT_NUMBER}
            </a>{" "}
            — call it from any phone and the AI qualifies your cake order live.
            The call appears here in real time.
          </p>
        </div>
      )}

      {leads.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-stone-300 bg-white/60 py-16 text-center">
          <span className="text-4xl">📭</span>
          <p className="font-medium text-stone-700">No leads yet</p>
          <p className="max-w-sm text-sm text-stone-500">
            {campaign?.status === "active"
              ? "Leads from your ad's form land here automatically. Use “Simulate incoming lead” to test the pipeline end to end."
              : "Launch your campaign, then watch leads flow into this pipeline."}
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
          {COLUMNS.map((col) => {
            const items = leads.filter((l) => l.status === col.status);
            return (
              <div
                key={col.status}
                className={`rounded-xl border border-stone-200 border-t-4 bg-stone-50/70 p-2 ${col.accent}`}
              >
                <div className="flex items-center gap-2 px-1 py-2">
                  <span className={`h-2 w-2 rounded-full ${col.dot}`} />
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    {LEAD_STATUS_LABELS[col.status]}
                  </p>
                  <span className="ml-auto text-xs text-stone-400">
                    {items.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {items.map((lead) => (
                    <LeadCard key={lead.id} lead={lead} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
