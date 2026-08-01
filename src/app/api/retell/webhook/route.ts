import {
  createSession,
  getBakery,
  getLead,
  markSessionDone,
  replaceTranscript,
  updateLead,
  upsertLead,
} from "@/lib/server/db";
import { emptyState, hasContent, stateFromExtractedOrder } from "@/lib/agent/ontology";
import { extractOrderFromTranscript } from "@/lib/server/llm";
import type { Lead, TranscriptMessage } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

interface RetellCall {
  call_id: string;
  call_status?: string;
  direction?: "inbound" | "outbound";
  from_number?: string;
  to_number?: string;
  disconnection_reason?: string;
  metadata?: { lead_id?: string };
  transcript?: string;
  transcript_object?: { role: "agent" | "user"; content: string }[];
  call_analysis?: { call_summary?: string };
}

function toTranscript(call: RetellCall): TranscriptMessage[] {
  return (call.transcript_object ?? [])
    .filter((t) => t.content?.trim())
    .map((t) => ({
      speaker: t.role === "agent" ? ("agent" as const) : ("customer" as const),
      text: t.content.trim(),
    }));
}

/** Retell posts call lifecycle events here (configured as the agent webhook). */
export async function POST(req: Request) {
  const payload = (await req.json().catch(() => null)) as {
    event?: string;
    call?: RetellCall;
  } | null;
  const call = payload?.call;
  if (!payload?.event || !call) return Response.json({ ok: true });

  // Whichever way the call was placed, this is the number on the customer's
  // end. It matters beyond display: the tools text design photos to it, so
  // taking `from_number` on an outbound call would send them to the bakery.
  const inbound = call.direction === "inbound";
  const customerPhone = (inbound ? call.from_number : call.to_number) ?? "";

  // Outbound calls placed against a lead carry its id. Everything else — an
  // inbound caller, a number typed into the test dialler, a browser mic test —
  // gets a lead created on the spot, so the call lands in the pipeline and has
  // somewhere to accumulate state while the tools run.
  let leadId = call.metadata?.lead_id ?? null;
  if (!leadId) {
    leadId = `retell-${call.call_id}`;
    if (!(await getLead(leadId))) {
      const lead: Lead = {
        id: leadId,
        name: customerPhone ? `Caller ${customerPhone.slice(-4)}` : "Browser test call",
        phone: customerPhone,
        source: inbound
          ? "Live phone call (Retell line)"
          : customerPhone
            ? "Outbound call (Retell test dialler)"
            : "Browser test call (Retell)",
        createdAt: Date.now(),
        status: "calling",
        transcript: [],
        callOutcome: null,
        // The tool endpoints accumulate into this while the call runs, so it
        // has to be a real container from the first turn rather than null.
        order: emptyState(),
        nextAction: null,
      };
      await upsertLead(lead);
    }
  }

  if (payload.event === "call_started") {
    // Without this row `loadCallContext` finds nothing and every custom
    // function runs stateless — book_order never sees the cake that price_cake
    // just chose. The session is keyed by Retell's call_id, which is exactly
    // what Retell sends the tool endpoints as `call.call_id`.
    await createSession({ callSid: call.call_id, leadId, from: customerPhone });
    return Response.json({ ok: true });
  }

  if (payload.event === "call_ended") {
    await markSessionDone(call.call_id);

    const transcript = toTranscript(call);
    if (transcript.length) await replaceTranscript(leadId, transcript);

    if (!transcript.length) {
      // Nobody spoke — the dial failed or went nowhere.
      await updateLead(leadId, {
        status: "new",
        callOutcome: `Call didn't connect (${call.disconnection_reason ?? "unknown"}).`,
        nextAction: "Try calling again",
      });
    }
    return Response.json({ ok: true });
  }

  if (payload.event === "call_analyzed") {
    const transcript = toTranscript(call);
    if (transcript.length) await replaceTranscript(leadId, transcript);

    const text =
      call.transcript ??
      transcript.map((t) => `${t.speaker}: ${t.text}`).join("\n");
    const bakery = await getBakery();
    const extracted = text.trim()
      ? await extractOrderFromTranscript(bakery, text)
      : null;

    // The tools write into the lead as the call runs, so by now the state may
    // already hold a real order number and prices the catalog actually
    // returned. That beats anything reconstructed from a transcript, so the
    // extraction only fills in when the tools produced nothing.
    const live = (await getLead(leadId))?.order ?? null;
    const keepLive = hasContent(live);

    await updateLead(leadId, {
      ...(extracted?.customerName && !live?.draft.customerName
        ? { name: extracted.customerName }
        : {}),
      status: live?.booked || extracted?.qualified ? "qualified" : "follow_up",
      // Mapped into the same CallState the TeXML agent writes, so a lead
      // looks identical whichever transport took the call.
      ...(keepLive
        ? {}
        : { order: extracted ? stateFromExtractedOrder(extracted) : null }),
      callOutcome:
        extracted?.outcome ??
        call.call_analysis?.call_summary ??
        "Call completed.",
      nextAction: extracted?.nextAction ?? "Review the transcript and follow up",
    });
    return Response.json({ ok: true });
  }

  return Response.json({ ok: true });
}
