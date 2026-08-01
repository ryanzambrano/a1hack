/**
 * Loading and saving the state of a call in progress.
 *
 * The hot path of a live call is one database round trip: the call session
 * and its lead (which carries the accumulated state) come back together via
 * an embedded select. The catalog is cached in `catalog.ts`, so a turn does
 * no other reads before the model is called. Every extra round trip here is
 * silence the caller hears.
 */

import { adminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { type CallState, hydrateState } from "./ontology";

export interface CallContext {
  callSid: string;
  leadId: string;
  phone: string;
  done: boolean;
  state: CallState;
}

export async function loadCallContext(callSid: string): Promise<CallContext | null> {
  const { data, error } = await adminClient()
    .from("call_sessions")
    .select("call_sid, lead_id, from_number, done, started_at, leads(cake_order)")
    .eq("call_sid", callSid)
    .maybeSingle();

  if (error) throw new Error(`loadCallContext: ${error.message}`);
  if (!data) return null;

  const lead = data.leads as { cake_order: Json | null } | null;
  return {
    callSid: data.call_sid,
    leadId: data.lead_id,
    phone: data.from_number,
    done: data.done,
    state: hydrateState(lead?.cake_order, Date.parse(data.started_at)),
  };
}

/**
 * Persist after every turn, not just at the end. A call that drops halfway
 * still leaves the bakery a usable half-filled order.
 */
export async function saveCallState(leadId: string, state: CallState): Promise<void> {
  const { error } = await adminClient()
    .from("leads")
    .update({
      cake_order: state as unknown as Json,
      updated_at: new Date().toISOString(),
    })
    .eq("id", leadId);

  if (error) throw new Error(`saveCallState: ${error.message}`);
}
