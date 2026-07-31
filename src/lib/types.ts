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

export interface CakeOrder {
  eventType: string;
  eventDate: string;
  guests: number;
  size: string;
  flavor: string;
  design: string;
  dietary: string;
  fulfillment: string;
  budget: string;
  callbackTime: string;
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
  order: CakeOrder | null;
  nextAction: string | null;
}

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  calling: "Calling",
  qualified: "Qualified",
  follow_up: "Needs follow-up",
  closed: "Closed",
};
