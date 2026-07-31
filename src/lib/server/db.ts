import { adminClient } from "@/lib/supabase/admin";
import type { Json, Tables, TablesUpdate } from "@/lib/supabase/database.types";
import type {
  Bakery,
  CakeOrder,
  Campaign,
  Lead,
  TranscriptMessage,
} from "../types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CallSession {
  callSid: string;
  from: string;
  leadId: string;
  startedAt: number;
  done: boolean;
}

// The app represents a single bakery, so its profile lives in one known row.
const BAKERY_ID = "default";

const LEAD_SELECT = "*, transcript_messages(id, speaker, text)";

type LeadRow = Tables<"leads"> & {
  transcript_messages?: Pick<
    Tables<"transcript_messages">,
    "id" | "speaker" | "text"
  >[] | null;
};

function fail(op: string, message: string): never {
  throw new Error(`${op}: ${message}`);
}

function now(): string {
  return new Date().toISOString();
}

// A CakeOrder is plain JSON, but TypeScript gives interfaces no implicit index
// signature, so it needs a nudge to satisfy the jsonb column's type.
function toJson(order: CakeOrder | null): Json {
  return order as unknown as Json;
}

/* ------------------------------- mapping -------------------------------- */

function toBakery(row: Tables<"bakeries">): Bakery {
  return {
    name: row.name,
    location: row.location,
    cakeTypes: row.cake_types,
    priceMin: row.price_min,
    priceMax: row.price_max,
    fulfillment: row.fulfillment,
    phone: row.phone,
    hours: row.hours,
    monthlyBudget: row.monthly_budget,
  };
}

function toCampaign(row: Tables<"campaigns">): Campaign {
  return {
    id: row.id,
    headline: row.headline,
    body: row.body,
    cta: row.cta,
    audience: row.audience,
    dailyBudget: row.daily_budget,
    status: row.status,
    launchedAt: row.launched_at ? Date.parse(row.launched_at) : null,
  };
}

function toLead(row: LeadRow): Lead {
  // Ordered by the identity column, which is insertion order.
  const transcript = [...(row.transcript_messages ?? [])]
    .sort((a, b) => a.id - b.id)
    .map(({ speaker, text }): TranscriptMessage => ({ speaker, text }));

  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    source: row.source,
    createdAt: Date.parse(row.created_at),
    status: row.status,
    transcript,
    callOutcome: row.call_outcome,
    order: (row.cake_order as CakeOrder | null) ?? null,
    nextAction: row.next_action,
  };
}

/* -------------------------------- bakery -------------------------------- */

export async function getBakery(): Promise<Bakery | null> {
  const { data, error } = await adminClient()
    .from("bakeries")
    .select("*")
    .eq("id", BAKERY_ID)
    .maybeSingle();

  if (error) fail("getBakery", error.message);
  return data ? toBakery(data) : null;
}

export async function saveBakery(bakery: Bakery): Promise<void> {
  const { error } = await adminClient().from("bakeries").upsert({
    id: BAKERY_ID,
    name: bakery.name,
    location: bakery.location,
    cake_types: bakery.cakeTypes,
    price_min: bakery.priceMin,
    price_max: bakery.priceMax,
    fulfillment: bakery.fulfillment,
    phone: bakery.phone,
    hours: bakery.hours,
    monthly_budget: bakery.monthlyBudget,
    updated_at: now(),
  });

  if (error) fail("saveBakery", error.message);
}

/* ------------------------------- campaign ------------------------------- */

export async function getCampaign(): Promise<Campaign | null> {
  const { data, error } = await adminClient()
    .from("campaigns")
    .select("*")
    .eq("bakery_id", BAKERY_ID)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) fail("getCampaign", error.message);
  return data ? toCampaign(data) : null;
}

export async function saveCampaign(campaign: Campaign): Promise<void> {
  const { error } = await adminClient().from("campaigns").upsert({
    id: campaign.id,
    bakery_id: BAKERY_ID,
    headline: campaign.headline,
    body: campaign.body,
    cta: campaign.cta,
    audience: campaign.audience,
    daily_budget: campaign.dailyBudget,
    status: campaign.status,
    launched_at: campaign.launchedAt
      ? new Date(campaign.launchedAt).toISOString()
      : null,
    updated_at: now(),
  });

  if (error) fail("saveCampaign", error.message);
}

/* --------------------------------- leads -------------------------------- */

export async function listLeads(): Promise<Lead[]> {
  const { data, error } = await adminClient()
    .from("leads")
    .select(LEAD_SELECT)
    .order("created_at", { ascending: false });

  if (error) fail("listLeads", error.message);
  return (data ?? []).map(toLead);
}

export async function getLead(id: string): Promise<Lead | null> {
  const { data, error } = await adminClient()
    .from("leads")
    .select(LEAD_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) fail("getLead", error.message);
  return data ? toLead(data) : null;
}

/** Writes the lead row. Transcript lines live in their own table — see appendTranscript. */
export async function upsertLead(lead: Lead): Promise<void> {
  const { error } = await adminClient().from("leads").upsert({
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    source: lead.source,
    status: lead.status,
    call_outcome: lead.callOutcome,
    next_action: lead.nextAction,
    cake_order: toJson(lead.order),
    created_at: new Date(lead.createdAt).toISOString(),
    updated_at: now(),
  });

  if (error) fail("upsertLead", error.message);
}

export type LeadPatch = Partial<Omit<Lead, "id" | "createdAt" | "transcript">>;

export async function updateLead(id: string, patch: LeadPatch): Promise<void> {
  const row: TablesUpdate<"leads"> = { updated_at: now() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.phone !== undefined) row.phone = patch.phone;
  if (patch.source !== undefined) row.source = patch.source;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.callOutcome !== undefined) row.call_outcome = patch.callOutcome;
  if (patch.nextAction !== undefined) row.next_action = patch.nextAction;
  if (patch.order !== undefined) row.cake_order = toJson(patch.order);

  const { error } = await adminClient().from("leads").update(row).eq("id", id);
  if (error) fail("updateLead", error.message);
}

/* ------------------------------ transcripts ----------------------------- */

export async function appendTranscript(
  leadId: string,
  messages: TranscriptMessage[]
): Promise<void> {
  if (!messages.length) return;

  const { error } = await adminClient()
    .from("transcript_messages")
    .insert(
      messages.map((m) => ({
        lead_id: leadId,
        speaker: m.speaker,
        text: m.text,
      }))
    );

  if (error) fail("appendTranscript", error.message);
}

/** Used by the simulated call, which produces its whole transcript at once. */
export async function replaceTranscript(
  leadId: string,
  messages: TranscriptMessage[]
): Promise<void> {
  const { error } = await adminClient()
    .from("transcript_messages")
    .delete()
    .eq("lead_id", leadId);

  if (error) fail("replaceTranscript", error.message);
  await appendTranscript(leadId, messages);
}

/**
 * The LLM's view of the call. Every spoken line is already stored as a
 * transcript row, so the chat history is derived rather than duplicated.
 */
export async function chatHistory(leadId: string): Promise<ChatMessage[]> {
  const { data, error } = await adminClient()
    .from("transcript_messages")
    .select("speaker, text")
    .eq("lead_id", leadId)
    .order("id", { ascending: true });

  if (error) fail("chatHistory", error.message);
  return (data ?? []).map((m) => ({
    role: m.speaker === "agent" ? "assistant" : "user",
    content: m.text,
  }));
}

/* ----------------------------- call sessions ---------------------------- */

export async function createSession(session: {
  callSid: string;
  leadId: string;
  from: string;
}): Promise<void> {
  const { error } = await adminClient().from("call_sessions").upsert({
    call_sid: session.callSid,
    lead_id: session.leadId,
    from_number: session.from,
    done: false,
    started_at: now(),
  });

  if (error) fail("createSession", error.message);
}

export async function getSession(callSid: string): Promise<CallSession | null> {
  const { data, error } = await adminClient()
    .from("call_sessions")
    .select("*")
    .eq("call_sid", callSid)
    .maybeSingle();

  if (error) fail("getSession", error.message);
  if (!data) return null;

  return {
    callSid: data.call_sid,
    from: data.from_number,
    leadId: data.lead_id,
    startedAt: Date.parse(data.started_at),
    done: data.done,
  };
}

export async function markSessionDone(callSid: string): Promise<void> {
  const { error } = await adminClient()
    .from("call_sessions")
    .update({ done: true })
    .eq("call_sid", callSid);

  if (error) fail("markSessionDone", error.message);
}

/* --------------------------------- reset -------------------------------- */

/** Clears the demo. Transcripts and call sessions cascade from leads. */
export async function resetAll(): Promise<void> {
  const supabase = adminClient();

  const { error: leadsError } = await supabase
    .from("leads")
    .delete()
    .neq("id", "");
  if (leadsError) fail("resetAll", leadsError.message);

  // Campaigns cascade from the bakery row.
  const { error: bakeryError } = await supabase
    .from("bakeries")
    .delete()
    .neq("id", "");
  if (bakeryError) fail("resetAll", bakeryError.message);
}
