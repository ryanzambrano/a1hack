"use client";

import Link from "next/link";
import { use, useEffect, useRef } from "react";

import { IconArrowLeft, IconPhone } from "@/components/icons";
import {
  Badge,
  type BadgeTone,
  Button,
  ButtonLink,
  Card,
  CardHeader,
  DataRow,
  EmptyState,
  Note,
  SectionLabel,
  StatusDot,
  cx,
} from "@/components/ui";
import { hasContent, orderRows } from "@/lib/agent/ontology";
import { useApp } from "@/lib/store";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/types";

const STATUS_TONES: Record<LeadStatus, BadgeTone> = {
  new: "amber",
  calling: "blue",
  qualified: "green",
  follow_up: "purple",
  closed: "gray",
};

export default function LeadDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { leads, bakery, hydrated, startAiCall, updateLeadStatus } = useApp();
  const lead = leads.find((l) => l.id === id);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const transcriptLength = lead?.transcript.length ?? 0;
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcriptLength]);

  if (!hydrated) return null;

  if (!lead) {
    return (
      <EmptyState
        className="mx-auto mt-10 max-w-lg"
        title="Lead not found"
        description="It may have been removed, or the id in the URL is stale."
        action={
          <ButtonLink href="/leads" prefix={<IconArrowLeft />}>
            Back to pipeline
          </ButtonLink>
        }
      />
    );
  }

  const calling = lead.status === "calling";

  return (
    <div className="animate-fade-up mx-auto w-full max-w-6xl">
      <Link
        href="/leads"
        className="inline-flex items-center gap-1.5 rounded text-sm text-gray-900 transition-colors hover:text-gray-1000"
      >
        <IconArrowLeft />
        Pipeline
      </Link>

      {/* Record header: identity on the left, state + actions on the right. */}
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold text-gray-1000">
            {lead.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-900">
            <span className="font-mono text-[13px] tnum">{lead.phone}</span>
            <span className="text-gray-500">·</span>
            <span>{lead.source}</span>
            <span className="text-gray-500">·</span>
            <span className="font-mono text-[12px] text-gray-700">{lead.id}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONES[lead.status]} dot pulse={calling}>
            {LEAD_STATUS_LABELS[lead.status]}
          </Badge>
          {lead.status === "new" && (
            <Button
              variant="primary"
              prefix={<IconPhone />}
              onClick={async () => {
                const error = await startAiCall(lead.id);
                if (error) alert(error);
              }}
            >
              Trigger AI call
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_minmax(0,340px)]">
        {/* ---------------------------------------------------------------- */}
        {/* Transcript                                                        */}
        {/* ---------------------------------------------------------------- */}
        <Card className="flex min-w-0 flex-col">
          <CardHeader
            title="Call transcript"
            actions={
              calling ? (
                <span className="flex items-center gap-1.5 text-xs font-medium text-blue-900">
                  <StatusDot tone="blue" pulse />
                  Live
                </span>
              ) : (
                <span className="font-mono text-[11px] text-gray-700 tnum">
                  {lead.transcript.length} turns
                </span>
              )
            }
          />

          <div className="flex max-h-[30rem] min-h-[18rem] flex-col gap-3 overflow-y-auto p-5">
            {lead.transcript.length === 0 && (
              <p className="m-auto max-w-xs text-center text-sm text-gray-700">
                {calling
                  ? `Dialing ${lead.phone}…`
                  : lead.status === "new"
                    ? "No call yet. Trigger the AI call and turns will stream in here."
                    : "No transcript recorded for this lead."}
              </p>
            )}

            {lead.transcript.map((msg, i) => {
              const agent = msg.speaker === "agent";
              return (
                <div
                  key={i}
                  className={cx(
                    "animate-fade-up max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed",
                    agent
                      ? "self-start bg-gray-100 text-gray-1000"
                      : "self-end bg-blue-100 text-blue-1000 shadow-[inset_0_0_0_1px_var(--ds-blue-300)]",
                  )}
                >
                  <p
                    className={cx(
                      "mb-1 font-mono text-[10px] font-medium uppercase tracking-[0.06em]",
                      agent ? "text-gray-700" : "text-blue-900",
                    )}
                  >
                    {agent
                      ? `AI · ${bakery?.name ?? "Bakery"}`
                      : lead.name}
                  </p>
                  {msg.text}
                </div>
              );
            })}
            <div ref={transcriptEndRef} />
          </div>

          {lead.callOutcome && (
            <div className="rounded-b-xl border-t border-gray-200 bg-background/60 px-5 py-3">
              <SectionLabel>Outcome</SectionLabel>
              <p className="mt-1 text-sm text-gray-1000">{lead.callOutcome}</p>
            </div>
          )}
        </Card>

        {/* ---------------------------------------------------------------- */}
        {/* Order record                                                      */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex min-w-0 flex-col gap-4">
          {hasContent(lead.order) ? (
            <Card className="animate-fade-up">
              <CardHeader
                title={lead.order.booked ? "Order placed" : "Order in progress"}
                actions={
                  <Badge tone={lead.order.booked ? "green" : "amber"} dot>
                    {lead.order.booked ? "Booked" : "Partial"}
                  </Badge>
                }
              />
              <div className="px-5 py-3">
                <dl>
                  {orderRows(lead.order).map(([label, value]) => (
                    <DataRow key={label} label={label} value={value} />
                  ))}
                </dl>
              </div>

              {lead.nextAction && (
                <div className="border-t border-gray-200 px-5 py-3">
                  <SectionLabel>Recommended action</SectionLabel>
                  <p className="mt-1 text-sm text-gray-1000">{lead.nextAction}</p>
                </div>
              )}

              <div className="border-t border-gray-200 p-3">
                <a
                  href={`tel:${lead.phone.replace(/\D/g, "")}`}
                  className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-solid text-sm font-medium text-on-solid transition-colors duration-150 hover:bg-solid-hover"
                >
                  <IconPhone />
                  Call {lead.name.split(" ")[0]}
                </a>
              </div>
            </Card>
          ) : (
            <Note tone="gray">
              {calling
                ? "The AI is qualifying this lead. The order record populates as fields are confirmed."
                : "The structured cake-order record appears here once the AI call completes."}
            </Note>
          )}

          <Card>
            <div className="px-5 py-4">
              <SectionLabel>Set status</SectionLabel>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(Object.keys(LEAD_STATUS_LABELS) as LeadStatus[])
                  .filter((s) => s !== "calling")
                  .map((s) => {
                    const active = lead.status === s;
                    return (
                      <button
                        key={s}
                        onClick={() => updateLeadStatus(lead.id, s)}
                        disabled={calling || active}
                        className={cx(
                          "h-7 rounded-md px-2 text-xs font-medium transition-all duration-150 disabled:cursor-not-allowed",
                          active
                            ? "bg-solid text-on-solid"
                            : "text-gray-900 shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-400)] hover:text-gray-1000 hover:shadow-[inset_0_0_0_1px_var(--ds-gray-alpha-500)] disabled:opacity-40",
                        )}
                      >
                        {LEAD_STATUS_LABELS[s]}
                      </button>
                    );
                  })}
              </div>
              {calling && (
                <p className="mt-3 text-xs text-gray-700">
                  Status is locked while a call is in flight.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
