import {
  getBakery,
  getLead,
  replaceTranscript,
  updateLead,
  upsertLead,
} from "@/lib/server/db";
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

  // Outbound calls carry the lead id; inbound calls to the Retell line get a
  // lead created on the spot so they land in the pipeline like any other call.
  let leadId = call.metadata?.lead_id ?? null;
  if (!leadId && call.direction === "inbound" && call.from_number) {
    leadId = `retell-${call.call_id}`;
    if (payload.event !== "call_started" && !(await getLead(leadId))) {
      const lead: Lead = {
        id: leadId,
        name: `Caller ${call.from_number.slice(-4)}`,
        phone: call.from_number,
        source: "Live phone call (Retell line)",
        createdAt: Date.now(),
        status: "calling",
        transcript: [],
        callOutcome: null,
        order: null,
        nextAction: null,
      };
      await upsertLead(lead);
    }
  }
  if (!leadId) return Response.json({ ok: true });

  if (payload.event === "call_ended") {
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

    await updateLead(leadId, {
      ...(extracted?.customerName ? { name: extracted.customerName } : {}),
      status: extracted?.qualified ? "qualified" : "follow_up",
      order: extracted?.order ?? null,
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
