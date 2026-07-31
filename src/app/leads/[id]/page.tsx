"use client";

import Link from "next/link";
import { use, useEffect, useRef } from "react";
import { useApp } from "@/lib/store";
import { LEAD_STATUS_LABELS, type LeadStatus } from "@/lib/types";

const STATUS_STYLES: Record<LeadStatus, string> = {
  new: "bg-amber-100 text-amber-700",
  calling: "bg-sky-100 text-sky-700",
  qualified: "bg-green-100 text-green-700",
  follow_up: "bg-orange-100 text-orange-700",
  closed: "bg-stone-200 text-stone-600",
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
      <div className="py-12 text-center text-stone-500">
        <p>Lead not found.</p>
        <Link href="/leads" className="mt-2 inline-block text-rose-600 underline">
          ← Back to pipeline
        </Link>
      </div>
    );
  }

  const calling = lead.status === "calling";

  return (
    <div className="animate-fade-up">
      <Link href="/leads" className="text-sm text-stone-500 hover:text-stone-700">
        ← Back to pipeline
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-800">{lead.name}</h1>
          <p className="text-sm text-stone-500">
            {lead.phone} · {lead.source}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${STATUS_STYLES[lead.status]}`}
          >
            {LEAD_STATUS_LABELS[lead.status]}
          </span>
          {lead.status === "new" && (
            <button
              onClick={() => startAiCall(lead.id)}
              className="animate-pulse-ring rounded-xl bg-rose-600 px-5 py-2.5 font-semibold text-white shadow-md hover:bg-rose-700"
            >
              📞 Trigger AI call
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_minmax(0,360px)]">
        {/* Transcript */}
        <div className="rounded-2xl border border-stone-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-stone-100 px-5 py-3">
            <h2 className="font-semibold text-stone-800">Call transcript</h2>
            {calling && (
              <span className="flex items-center gap-2 text-sm font-medium text-sky-600">
                <span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" />
                Live — AI on the phone
              </span>
            )}
          </div>
          <div className="flex max-h-[28rem] min-h-[16rem] flex-col gap-3 overflow-y-auto p-5">
            {lead.transcript.length === 0 && !calling && (
              <p className="m-auto max-w-xs text-center text-sm text-stone-400">
                {lead.status === "new"
                  ? "No call yet. Trigger the AI call and the conversation will appear here in real time."
                  : "No transcript available for this lead."}
              </p>
            )}
            {lead.transcript.length === 0 && calling && (
              <p className="m-auto text-sm text-stone-400">
                Dialing {lead.phone}…
              </p>
            )}
            {lead.transcript.map((msg, i) => (
              <div
                key={i}
                className={`animate-fade-up max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                  msg.speaker === "agent"
                    ? "self-start rounded-bl-sm bg-rose-50 text-stone-800"
                    : "self-end rounded-br-sm bg-stone-100 text-stone-800"
                }`}
              >
                <p
                  className={`mb-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    msg.speaker === "agent" ? "text-rose-500" : "text-stone-400"
                  }`}
                >
                  {msg.speaker === "agent"
                    ? `SweetLeads AI · ${bakery?.name ?? "Bakery"}`
                    : lead.name}
                </p>
                {msg.text}
              </div>
            ))}
            <div ref={transcriptEndRef} />
          </div>
          {lead.callOutcome && (
            <div className="border-t border-stone-100 px-5 py-3 text-sm text-stone-500">
              <span className="font-semibold text-stone-700">Outcome: </span>
              {lead.callOutcome}
            </div>
          )}
        </div>

        {/* Order summary sidebar */}
        <div className="flex flex-col gap-4">
          {lead.order ? (
            <div className="animate-fade-up rounded-2xl border-2 border-green-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-stone-800">
                  🎂 New Cake Request
                </h2>
                <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                  Qualified
                </span>
              </div>
              <dl className="mt-4 grid gap-2.5 text-sm">
                {(
                  [
                    ["Customer", lead.name],
                    ["Event", lead.order.eventType],
                    ["Date", lead.order.eventDate],
                    ["Guests", String(lead.order.guests)],
                    ["Size", lead.order.size],
                    ["Flavor", lead.order.flavor],
                    ["Design", lead.order.design],
                    ["Dietary", lead.order.dietary],
                    ["Fulfillment", lead.order.fulfillment],
                    ["Budget", lead.order.budget],
                    ["Callback", lead.order.callbackTime],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4">
                    <dt className="text-stone-400">{label}</dt>
                    <dd className="text-right font-medium text-stone-800">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="mt-4 rounded-xl bg-rose-50 p-3 text-sm">
                <p className="font-semibold text-rose-700">
                  Recommended next action
                </p>
                <p className="text-rose-600">{lead.nextAction}</p>
              </div>
              <a
                href={`tel:${lead.phone.replace(/\D/g, "")}`}
                className="mt-4 block rounded-xl bg-rose-600 py-2.5 text-center font-semibold text-white hover:bg-rose-700"
              >
                📞 Call {lead.name.split(" ")[0]} now
              </a>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white/60 p-5 text-center text-sm text-stone-400">
              {calling
                ? "The AI is qualifying this lead — the cake-order summary will appear here when the call ends."
                : "Once the AI call completes, the full cake-order summary shows up here."}
            </div>
          )}

          <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-400">
              Update status
            </h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {(Object.keys(LEAD_STATUS_LABELS) as LeadStatus[])
                .filter((s) => s !== "calling")
                .map((s) => (
                  <button
                    key={s}
                    onClick={() => updateLeadStatus(lead.id, s)}
                    disabled={calling || lead.status === s}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed ${
                      lead.status === s
                        ? "border-stone-800 bg-stone-800 text-white"
                        : "border-stone-300 text-stone-600 hover:bg-stone-50 disabled:opacity-40"
                    }`}
                  >
                    {LEAD_STATUS_LABELS[s]}
                  </button>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
