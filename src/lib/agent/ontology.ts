import type { Fulfillment } from "@/lib/types";
import { speakDate } from "./dates";
import { speakMoney } from "./speech";

/**
 * What the agent knows at any point in a call.
 *
 * The draft is written back after EVERY turn, not just at the end. A call
 * that drops four minutes in still leaves the bakery a half-filled order they
 * can act on, which is the difference between a lost customer and a callback.
 */

export interface OrderDraft {
  productId: number | null;
  productName: string | null;
  /** Real option ids, resolved from the catalog — never invented. */
  optionIds: number[];
  /** Group -> chosen value, kept for reading the order back aloud. */
  selections: Record<string, string>;
  qty: number;
  cakeText: string;
  guests: number | null;
  occasion: string | null;
  /** Who it is for and how old they are turning — a custom brief needs both. */
  recipient: string | null;
  /** The look in the caller's own words: theme, characters, colours, finish. */
  designNotes: string;
  pickupDate: string | null;
  pickupSlot: string | null;
  /** Collection or a van. Set by quote_delivery, defaults to collection. */
  fulfillment: Fulfillment;
  customerName: string | null;
  notes: string;
}

/**
 * A delivery the tools have actually priced.
 *
 * Distance and fee both come from `quote_delivery`; nothing here is ever
 * filled in from the model's reading of the conversation, because the fee
 * lands on the order total and on the caller's card.
 */
export interface DeliveryPlan {
  address: string;
  /** As the geocoder rendered it — what the driver will actually be given. */
  resolvedAddress: string;
  /** Straight-line miles from the shop. */
  miles: number;
  feeCents: number;
}

export interface PaymentRecord {
  /** "card" for a simulated charge on the call, "link" for one texted over. */
  method: "card" | "link";
  /** Whole balance, or the deposit percentage from the bakery's profile. */
  portion: "full" | "deposit";
  amountCents: number;
  /** What the provider called it: paid, or awaiting the texted link. */
  status: string;
  reference: string;
}

export interface Escalation {
  reason: string;
  /** What a human needs to know when they pick this up. */
  note: string;
}

export interface BookedOrder {
  /** Row id, so a later payment can find the order it belongs to. */
  orderId: number;
  orderNumber: string;
  /** Everything the caller owes: the cake, plus delivery if it is being driven. */
  totalCents: number;
  pickupDate: string;
  pickupSlot: string;
  fulfillment: Fulfillment;
}

export interface CallState {
  draft: OrderDraft;
  /**
   * The model's working memory, carried with the state so a turn needs one
   * database round trip rather than two. `transcript_messages` stays the
   * durable record the dashboard reads; this is the bounded window the model
   * actually sees.
   */
  history: Array<{ role: "user" | "assistant"; content: string }>;
  /** Agent turns taken, for the hard stop. */
  turns: number;
  /** Consecutive turns where speech did not come through. */
  misses: number;
  /** Last price a tool actually computed. The agent may not say any other. */
  quotedCents: number | null;
  /**
   * Price-band endpoints from design options already offered. These are
   * tool-computed too, so they join the set of figures the agent is allowed
   * to say out loud.
   */
  offeredCents: number[];
  /** Short code of the design set texted to the caller, if any. */
  proposalCode: string | null;
  /** The design the caller picked off that list. */
  chosenDesign: {
    position: number;
    title: string;
    archiveCakeId: number;
    lowCents: number;
    highCents: number;
    confidence: string;
    /** Low-confidence comps mean a human prices it, not the agent. */
    needsKitchenReview: boolean;
  } | null;
  /** Priced by quote_delivery. Null means collection, or not asked yet. */
  delivery: DeliveryPlan | null;
  /** Written by take_payment once money has actually been asked for. */
  payment: PaymentRecord | null;
  escalation: Escalation | null;
  booked: BookedOrder | null;
  startedAt: number;
  /**
   * Guards against a retried webhook running the same turn twice. Keyed on
   * the turn number as well as the words, so a caller who genuinely says
   * "yes" twice is still heard twice.
   */
  lastKey: string | null;
  lastReply: { say: string; done: boolean } | null;
}

export function emptyDraft(): OrderDraft {
  return {
    productId: null,
    productName: null,
    optionIds: [],
    selections: {},
    qty: 1,
    cakeText: "",
    guests: null,
    occasion: null,
    recipient: null,
    designNotes: "",
    pickupDate: null,
    pickupSlot: null,
    fulfillment: "pickup",
    customerName: null,
    notes: "",
  };
}

/** Long enough to hold a whole cake order, short enough to stay fast. */
export const HISTORY_LIMIT = 24;

export function rememberTurn(
  state: CallState,
  caller: string,
  agent: string
): void {
  if (caller) state.history.push({ role: "user", content: caller });
  if (agent) state.history.push({ role: "assistant", content: agent });
  if (state.history.length > HISTORY_LIMIT) {
    state.history = state.history.slice(-HISTORY_LIMIT);
  }
}

export function emptyState(startedAt = Date.now()): CallState {
  return {
    draft: emptyDraft(),
    history: [],
    turns: 0,
    misses: 0,
    quotedCents: null,
    offeredCents: [],
    proposalCode: null,
    chosenDesign: null,
    delivery: null,
    payment: null,
    escalation: null,
    booked: null,
    startedAt,
    lastKey: null,
    lastReply: null,
  };
}

/* -------------------------------- reading -------------------------------- */

/** True once the call has produced anything a baker could act on. */
export function hasContent(state: CallState | null | undefined): state is CallState {
  if (!state) return false;
  const d = state.draft;
  return Boolean(state.booked || d.productName || d.guests || d.pickupDate || d.occasion);
}

/** Label/value pairs for the dashboard, in the order a baker reads them. */
export function orderRows(state: CallState): Array<[string, string]> {
  const d = state.draft;
  const rows: Array<[string, string]> = [];

  const delivering = d.fulfillment === "delivery";

  if (state.booked) {
    rows.push(["Order", state.booked.orderNumber]);
    rows.push(["Total", speakMoney(state.booked.totalCents)]);
    rows.push([
      delivering ? "Deliver" : "Pickup",
      `${speakDate(state.booked.pickupDate)}, ${state.booked.pickupSlot}`,
    ]);
  }
  if (d.customerName) rows.push(["Customer", d.customerName]);
  if (d.occasion) rows.push(["Occasion", d.occasion]);
  if (d.recipient) rows.push(["For", d.recipient]);
  if (d.guests) rows.push(["Guests", String(d.guests)]);
  if (d.productName) rows.push(["Cake", d.productName]);
  for (const [group, value] of Object.entries(d.selections)) rows.push([group, value]);
  if (d.designNotes) rows.push(["Design", d.designNotes]);
  if (d.qty > 1) rows.push(["Quantity", String(d.qty)]);
  if (d.cakeText) rows.push(["Writing", `"${d.cakeText}"`]);
  if (!state.booked && d.pickupDate) rows.push(["Wanted for", speakDate(d.pickupDate)]);
  if (!state.booked && state.quotedCents !== null) {
    rows.push(["Quoted", speakMoney(state.quotedCents)]);
  }
  if (state.delivery) {
    rows.push(["Deliver to", state.delivery.address]);
    rows.push([
      "Delivery",
      `${speakMoney(state.delivery.feeCents)} · ${state.delivery.miles} miles out`,
    ]);
  } else if (delivering) {
    rows.push(["Fulfillment", "Delivery — address not confirmed"]);
  }
  if (state.payment) {
    const p = state.payment;
    rows.push([
      p.portion === "deposit" ? "Deposit" : "Paid",
      `${speakMoney(p.amountCents)} · ${p.status.replace(/_/g, " ")}`,
    ]);
  }
  if (state.escalation) rows.push(["Needs a person", state.escalation.reason]);
  return rows;
}

/** One line for a list card. */
export function shortSummary(state: CallState): string | null {
  if (state.booked) {
    return `${state.booked.orderNumber} · ${speakMoney(state.booked.totalCents)} · ${speakDate(
      state.booked.pickupDate
    )}`;
  }
  const d = state.draft;
  const bits = [
    d.productName,
    d.guests ? `${d.guests} guests` : null,
    d.pickupDate ? speakDate(d.pickupDate) : null,
    state.delivery ? `delivery ${speakMoney(state.delivery.feeCents)}` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(" · ") : null;
}

/**
 * Build a CallState from a transcript the agent did not run.
 *
 * Retell drives its own conversation and hands us a finished transcript, so
 * there is no accumulated state to read — it gets reconstructed afterwards by
 * `extractOrderFromTranscript`. Mapping it here means the dashboard, the lead
 * card and the order summary all see one shape regardless of which transport
 * answered the phone.
 */
export function stateFromExtractedOrder(extracted: {
  customerName?: string | null;
  order?: {
    eventType?: string;
    eventDate?: string;
    guests?: number;
    size?: string;
    flavor?: string;
    design?: string;
    dietary?: string;
    fulfillment?: string;
    budget?: string;
    callbackTime?: string;
  } | null;
}): CallState {
  const state = emptyState();
  const o = extracted.order ?? {};
  // "Not specified" is the prompt's filler for a gap; storing it would show
  // the baker a field that looks answered when it was not.
  const real = (v: string | undefined) =>
    v && !/^not specified$/i.test(v.trim()) ? v.trim() : null;

  state.draft.customerName = extracted.customerName?.trim() || null;
  state.draft.occasion = real(o.eventType);
  state.draft.guests = Number.isFinite(o.guests) ? Number(o.guests) : null;
  state.draft.productName = real(o.flavor) ?? real(o.design);
  state.draft.designNotes = real(o.design) ?? "";
  if (/deliver/i.test(o.fulfillment ?? "")) state.draft.fulfillment = "delivery";

  for (const [group, value] of [
    ["Size", o.size],
    ["Flavor", o.flavor],
    ["Design", o.design],
    ["Dietary", o.dietary],
    ["Fulfillment", o.fulfillment],
  ] as const) {
    const kept = real(value);
    if (kept) state.draft.selections[group] = kept;
  }

  state.draft.notes = [
    real(o.eventDate) ? `Wanted for ${real(o.eventDate)}` : null,
    real(o.budget) ? `Budget ${real(o.budget)}` : null,
    real(o.callbackTime) ? `Call back ${real(o.callbackTime)}` : null,
  ]
    .filter(Boolean)
    .join(". ");

  return state;
}

/** Tolerates a partial or legacy blob read back from `leads.cake_order`. */
export function hydrateState(raw: unknown, startedAt = Date.now()): CallState {
  const base = emptyState(startedAt);
  if (!raw || typeof raw !== "object") return base;
  const s = raw as Partial<CallState>;
  return {
    ...base,
    ...s,
    draft: { ...base.draft, ...(s.draft ?? {}) },
  };
}
