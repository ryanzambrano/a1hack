"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { IconPhone, IconPlus } from "@/components/icons";
import {
  Badge,
  type BadgeTone,
  Button,
  EmptyState,
  Note,
  StatusDot,
  cx,
} from "@/components/ui";
import { hasContent, shortSummary } from "@/lib/agent/ontology";
import { useApp } from "@/lib/store";
import { LEAD_STATUS_LABELS, type Lead, type LeadStatus } from "@/lib/types";

const COLUMNS: { status: LeadStatus; tone: BadgeTone }[] = [
  { status: "new", tone: "amber" },
  { status: "calling", tone: "blue" },
  { status: "qualified", tone: "green" },
  { status: "follow_up", tone: "purple" },
  { status: "closed", tone: "gray" },
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
  const order = hasContent(lead.order) ? lead.order : null;
  const summary = order ? shortSummary(order) : null;

  return (
    <Link
      href={`/leads/${lead.id}`}
      className="animate-fade-up block rounded-lg border border-gray-200 bg-surface p-3 transition-colors duration-150 hover:border-gray-400"
    >
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-gray-1000">
          {lead.name}
        </p>
        {lead.status === "calling" && (
          <StatusDot tone="blue" pulse />
        )}
      </div>

      <p className="mt-0.5 font-mono text-[11px] text-gray-700 tnum">
        {lead.phone}
      </p>

      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-700">
        <span className="truncate">{lead.source}</span>
        <span className="text-gray-500">·</span>
        <span className="shrink-0 tnum">{timeAgo(lead.createdAt)}</span>
      </div>

      {summary && (
        <p
          className={cx(
            "mt-2 line-clamp-2 rounded border px-2 py-1 text-[11px] leading-relaxed",
            order?.booked
              ? "border-green-300 bg-green-100 text-green-1000"
              : "border-gray-200 bg-background text-gray-900",
          )}
        >
          {summary}
        </p>
      )}

      {lead.status === "new" && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-amber-900">
          <StatusDot tone="amber" />
          Queued for AI call
        </p>
      )}
    </Link>
  );
}

export default function LeadsPage() {
  const { leads, campaign, hydrated, simulateIncomingLead } = useApp();
  const [demoMode, setDemoMode] = useState(false);

  // Demo mode: one clearly-labeled simulated lead per minute. The leads it
  // creates carry the "(simulated)" source like the manual button's do.
  useEffect(() => {
    if (!demoMode) return;
    void simulateIncomingLead();
    const id = setInterval(() => void simulateIncomingLead(), 60_000);
    return () => clearInterval(id);
  }, [demoMode, simulateIncomingLead]);

  if (!hydrated) return null;

  const agentNumber = process.env.NEXT_PUBLIC_AGENT_NUMBER;

  return (
    <div className="animate-fade-up mx-auto w-full max-w-7xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-1000">Pipeline</h1>
          <p className="mt-1 text-sm text-gray-900">
            {campaign?.status === "active"
              ? "Campaign is delivering. New leads are dialed automatically."
              : "Launch the campaign to start receiving leads."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setDemoMode((d) => !d)}
            className={demoMode ? "ring-2 ring-amber-400" : undefined}
          >
            {demoMode ? "⏸ Stop demo feed (simulated)" : "▶ Demo feed (simulated, 1/min)"}
          </Button>
          <Button prefix={<IconPlus />} onClick={simulateIncomingLead}>
            Simulate lead
          </Button>
        </div>
      </div>

      {agentNumber && (
        <Note tone="blue" className="mt-5">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <IconPhone className="shrink-0" />
            <span className="font-medium">Inbound agent line</span>
            <a
              href={`tel:${agentNumber}`}
              className="rounded font-mono text-[13px] underline underline-offset-2 tnum"
            >
              {agentNumber}
            </a>
            <span className="text-blue-900">
              — call it from any phone; the transcript streams into this board
              live.
            </span>
          </span>
        </Note>
      )}

      {leads.length === 0 ? (
        <EmptyState
          className="mt-6"
          title="No leads yet"
          description={
            campaign?.status === "active"
              ? "Leads from your ad's form land here automatically. Simulate one to exercise the pipeline end to end."
              : "Launch your campaign, then watch leads flow into this board."
          }
          action={
            <Button prefix={<IconPlus />} onClick={simulateIncomingLead}>
              Simulate lead
            </Button>
          }
        />
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {COLUMNS.map((col) => {
            const items = leads.filter((l) => l.status === col.status);
            return (
              <section key={col.status} className="flex min-w-0 flex-col">
                <div className="flex items-center gap-2 px-1 pb-2">
                  <StatusDot
                    tone={col.tone}
                    pulse={col.status === "calling" && items.length > 0}
                  />
                  <p className="label-micro">{LEAD_STATUS_LABELS[col.status]}</p>
                  <span className="ml-auto font-mono text-[11px] text-gray-700 tnum">
                    {items.length}
                  </span>
                </div>

                <div className="flex flex-col gap-2 rounded-lg border border-dashed border-gray-200 p-2">
                  {items.length === 0 ? (
                    <p className="px-1 py-4 text-center text-[11px] text-gray-700">
                      Empty
                    </p>
                  ) : (
                    items.map((lead) => <LeadCard key={lead.id} lead={lead} />)
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {leads.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="label-micro">Totals</span>
          {COLUMNS.map((col) => (
            <Badge key={col.status} tone={col.tone} dot>
              {LEAD_STATUS_LABELS[col.status]}{" "}
              <span className="tnum">
                {leads.filter((l) => l.status === col.status).length}
              </span>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
