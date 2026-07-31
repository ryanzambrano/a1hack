import type { Bakery, Lead } from "../types";

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

interface ServerState {
  bakery: Bakery | null;
  leads: Map<string, Lead>;
  sessions: Map<string, CallSession>;
}

// Module-level singleton on globalThis so it survives Next.js HMR reloads.
const g = globalThis as unknown as { __sweetleads?: ServerState };

export const serverState: ServerState = (g.__sweetleads ??= {
  bakery: null,
  leads: new Map(),
  sessions: new Map(),
});

export function upsertLead(lead: Lead): void {
  serverState.leads.set(lead.id, lead);
}

export function leadForCall(callSid: string): Lead | undefined {
  const session = serverState.sessions.get(callSid);
  return session ? serverState.leads.get(session.leadId) : undefined;
}
