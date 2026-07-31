import type {
  Bakery,
  CakeOrder,
  Lead,
  LeadStatus,
  TranscriptMessage,
} from "../types";
import { supabaseAdmin } from "./supabase";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CallSession {
  callSid: string;
  from: string;
  leadId: string;
  messages: ChatMessage[];
  startedAt: number;
  done: boolean;
}

// The app manages a single bakery profile; it lives in one well-known row.
const BAKERY_ID = "default";

interface LeadRow {
  id: string;
  name: string;
  phone: string;
  source: string;
  status: LeadStatus;
  call_outcome: string | null;
  next_action: string | null;
  cake_order: CakeOrder | null;
  created_at: string;
  transcript_messages?: { id: number; speaker: "agent" | "customer"; text: string }[];
}

const LEAD_SELECT = "*, transcript_messages(id, speaker, text)";

function rowToLead(row: LeadRow): Lead {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    source: row.source,
    createdAt: Date.parse(row.created_at),
    status: row.status,
    transcript: (row.transcript_messages ?? [])
      .sort((a, b) => a.id - b.id)
      .map(({ speaker, text }): TranscriptMessage => ({ speaker, text })),
    callOutcome: row.call_outcome,
    order: row.cake_order,
    nextAction: row.next_action,
  };
}

export async function getBakery(): Promise<Bakery | null> {
  const { data, error } = await supabaseAdmin()
    .from("bakeries")
    .select("*")
    .eq("id", BAKERY_ID)
    .maybeSingle();
  if (error) throw new Error(`getBakery: ${error.message}`);
  if (!data) return null;
  return {
    name: data.name,
    location: data.location,
    cakeTypes: data.cake_types,
    priceMin: data.price_min,
    priceMax: data.price_max,
    fulfillment: data.fulfillment,
    phone: data.phone,
    hours: data.hours,
    monthlyBudget: data.monthly_budget,
  };
}

export async function setBakery(bakery: Bakery): Promise<void> {
  const { error } = await supabaseAdmin().from("bakeries").upsert({
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
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`setBakery: ${error.message}`);
}

/** Upserts the lead row and replaces its transcript with `lead.transcript`. */
export async function upsertLead(lead: Lead): Promise<void> {
  const db = supabaseAdmin();
  const { error } = await db.from("leads").upsert({
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    source: lead.source,
    status: lead.status,
    call_outcome: lead.callOutcome,
    next_action: lead.nextAction,
    cake_order: lead.order,
    created_at: new Date(lead.createdAt).toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(`upsertLead: ${error.message}`);

  const del = await db.from("transcript_messages").delete().eq("lead_id", lead.id);
  if (del.error) throw new Error(`upsertLead transcript: ${del.error.message}`);
  if (lead.transcript.length > 0) {
    const ins = await db.from("transcript_messages").insert(
      lead.transcript.map((m) => ({
        lead_id: lead.id,
        speaker: m.speaker,
        text: m.text,
      }))
    );
    if (ins.error) throw new Error(`upsertLead transcript: ${ins.error.message}`);
  }
}

export async function getLead(id: string): Promise<Lead | null> {
  const { data, error } = await supabaseAdmin()
    .from("leads")
    .select(LEAD_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`getLead: ${error.message}`);
  return data ? rowToLead(data as LeadRow) : null;
}

export async function listLeads(): Promise<Lead[]> {
  const { data, error } = await supabaseAdmin()
    .from("leads")
    .select(LEAD_SELECT)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listLeads: ${error.message}`);
  return ((data ?? []) as LeadRow[]).map(rowToLead);
}

export async function saveSession(session: CallSession): Promise<void> {
  const { error } = await supabaseAdmin().from("call_sessions").upsert({
    call_sid: session.callSid,
    lead_id: session.leadId,
    from_number: session.from,
    done: session.done,
    started_at: new Date(session.startedAt).toISOString(),
  });
  if (error) throw new Error(`saveSession: ${error.message}`);
}

/**
 * Loads a session. `messages` is reconstructed from the lead's transcript
 * (customer -> user, agent -> assistant) — the DB doesn't store them separately.
 */
export async function getSession(callSid: string): Promise<CallSession | null> {
  const { data, error } = await supabaseAdmin()
    .from("call_sessions")
    .select("*")
    .eq("call_sid", callSid)
    .maybeSingle();
  if (error) throw new Error(`getSession: ${error.message}`);
  if (!data) return null;
  const lead = await getLead(data.lead_id);
  return {
    callSid: data.call_sid,
    from: data.from_number,
    leadId: data.lead_id,
    messages: (lead?.transcript ?? []).map((m) => ({
      role: m.speaker === "agent" ? ("assistant" as const) : ("user" as const),
      content: m.text,
    })),
    startedAt: Date.parse(data.started_at),
    done: data.done,
  };
}

export async function leadForCall(callSid: string): Promise<Lead | null> {
  const session = await getSession(callSid);
  return session ? getLead(session.leadId) : null;
}
