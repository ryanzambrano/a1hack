import type { CallState } from "./agent/ontology";

export type Fulfillment = "pickup" | "delivery";

export interface Bakery {
  name: string;
  location: string;
  cakeTypes: string[];
  priceMin: number;
  priceMax: number;
  fulfillment: Fulfillment[];
  phone: string;
  hours: string;
  monthlyBudget: number;
}

export interface Campaign {
  id: string;
  headline: string;
  body: string;
  cta: string;
  audience: string;
  dailyBudget: number;
  status: "draft" | "active";
  launchedAt: number | null;
}

export type LeadStatus =
  | "new"
  | "calling"
  | "qualified"
  | "follow_up"
  | "closed";

export interface TranscriptMessage {
  speaker: "agent" | "customer";
  text: string;
}

export interface Lead {
  id: string;
  name: string;
  phone: string;
  source: string;
  createdAt: number;
  status: LeadStatus;
  transcript: TranscriptMessage[];
  callOutcome: string | null;
  /**
   * Everything the agent gathered on the call: the draft order as it built
   * up turn by turn, and the booked order once it exists. Written after every
   * turn, so a call that drops halfway still leaves something usable.
   */
  order: CallState | null;
  nextAction: string | null;
}

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  calling: "Calling",
  qualified: "Qualified",
  follow_up: "Needs follow-up",
  closed: "Closed",
};
