import type { CallState } from "./agent/ontology";

export type Fulfillment = "pickup" | "delivery";

/** How the delivery fee inside the zone is worked out. */
export type DeliveryPricing = "per_mile" | "flat" | "free";

/**
 * Everything the product knows about the bakery it works for. The ad copy is
 * written from this and the phone agent is briefed from it, so it is
 * deliberately closer to a real intake form than to a settings page — see
 * src/lib/bakery-profile.ts for the question vocabulary and defaults.
 */
export interface Bakery {
  /* identity */
  name: string;
  /** City/metro, used for ad targeting. `address` is the street address. */
  location: string;
  address: string;
  phone: string;
  email: string;
  description: string;
  website: string;
  instagram: string;
  /** 0 when the bakery skipped the question. */
  foundedYear: number;

  /* hours — `hours` is derived from the three structured fields below */
  hours: string;
  openHour: number;
  closeHour: number;
  /** JS getDay(): 0 = Sunday. */
  closedWeekdays: number[];
  /** Order after this local hour and the lead time starts counting tomorrow. */
  orderCutoffHour: number;

  /* what they bake */
  cakeTypes: string[];
  flavors: string[];
  fillings: string[];
  decorations: string[];
  maxTiers: number;
  minServings: number;
  maxServings: number;
  priceMin: number;
  priceMax: number;
  pricePerServing: number;
  signatureItems: string;
  tastingsOffered: boolean;

  /* dietary */
  dietaryOptions: string[];
  allergensOnSite: string[];
  sharedKitchen: boolean;

  /* capacity */
  leadTimeDays: number;
  weddingLeadTimeDays: number;
  rushAvailable: boolean;
  rushFeeUsd: number;
  weeklyCakeCapacity: number;
  peakSeasons: string[];

  /* fulfillment */
  fulfillment: Fulfillment[];
  /** How far they will drive, straight-line — the circle on the map. */
  deliveryRadiusMiles: number;
  deliveryPricing: DeliveryPricing;
  /** Per mile driven, when deliveryPricing is "per_mile". */
  deliveryPerMileUsd: number;
  /** Added on top of the per-mile rate — the cost of getting a van moving. */
  deliveryBaseFeeUsd: number;
  /** The single fee for the whole zone, when deliveryPricing is "flat". */
  deliveryFeeUsd: number;
  deliveryMinimumUsd: number;
  /**
   * The shop, placed on the map. Geocoded from `address` when the profile is
   * saved; 0 means it could not be placed, and the agent quotes distance-based
   * delivery only once it can.
   */
  latitude: number;
  longitude: number;
  weddingSetup: boolean;
  nationwideShipping: boolean;

  /* ordering policy */
  depositPercent: number;
  paymentMethods: string[];
  cancellationDays: number;
  /** Above this total the agent stops quoting and hands off for a real quote. */
  customQuoteThresholdUsd: number;

  /* phone agent brief */
  tone: string;
  greeting: string;
  differentiators: string;
  doNotPromise: string;
  escalationContact: string;

  /* ads */
  monthlyBudget: number;
  targetCustomers: string[];
  adRadiusMiles: number;
  currentOffer: string;
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
