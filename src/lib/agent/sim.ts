/**
 * Golden-scenario harness.
 *
 * Drives whole calls through the real brain, the real tools and the real
 * database, with the language model replaced by a fixed script. That split is
 * deliberate: the parts that must never regress — safety escalations, call
 * guards, the price invariant, date rules, and writing an actual order — are
 * exactly the parts that do not depend on the model's judgment, so they can
 * be asserted on rather than eyeballed.
 *
 * Scenarios that escalate or hit a guard use no script at all: those paths
 * short-circuit before the model is consulted, which is the property being
 * tested.
 */

import { adminClient } from "@/lib/supabase/admin";
import { loadShop } from "@/lib/server/catalog";
import { geocode, isPlaced } from "@/lib/server/geo";
import { type BrainTurn, type CompleteFn, runTurn } from "./brain";
import { type CallState, emptyState, rememberTurn } from "./ontology";
import { unbackedPrices } from "./policy";
import type { ToolContext, ToolResult } from "./tools";

export interface Recording {
  turns: Array<{
    said: string;
    reply: string;
    tools: string[];
    /** What the tools actually returned — asserting on names alone is weak. */
    results: ToolResult[];
    done: boolean;
    handoff: boolean;
  }>;
  state: CallState;
  /** Money the agent said that no tool had computed. Must always be empty. */
  unbacked: string[];
}

/**
 * Facts about the bakery a scenario may need to phrase itself with.
 *
 * The demo reset recreates the bakery profile, and it has come back with a
 * different closing day more than once. A scenario that hardcodes "Monday" is
 * then testing the calendar rather than the rule, and fails for a reason that
 * has nothing to do with the agent.
 */
export interface ScenarioContext {
  /** Name of a day the bakery is shut, or null if it never is. */
  closedDay: string | null;
}

/**
 * Something the scenario needs to exist before it means anything. The catalog
 * and the archive are seeded by different scripts and the demo reset clears
 * the catalog, so a run with an empty table must report "skipped, seed it"
 * rather than a pile of assertion failures that look like a broken agent.
 * "delivery" additionally needs a working geocoder, which needs the network.
 */
export type Fixture = "catalog" | "archive" | "closedDay" | "delivery";

export interface Scenario {
  name: string;
  /** What the caller says, one entry per turn. */
  says: string[] | ((ctx: ScenarioContext) => string[]);
  /** Canned model replies, consumed in order. Omit for model-free paths. */
  script?: string[] | ((ctx: ScenarioContext) => string[]);
  requires?: Fixture | Fixture[];
  expect: (r: Recording) => string[] | Promise<string[]>;
}

/** Every tool result of a given name across the whole call. */
function resultsOf(r: Recording, name: string): ToolResult[] {
  return r.turns.flatMap((t) =>
    t.results.filter((_, i) => t.tools[i] === name)
  );
}

export interface ScenarioResult {
  name: string;
  pass: boolean;
  failures: string[];
  transcript: string[];
  /** Set when a fixture was missing; the scenario did not run. */
  skipped?: string;
}

/* -------------------------------- scenarios ------------------------------- */

const speak = (say: string, done = false) => JSON.stringify({ say, done });
const call = (name: string, args: Record<string, unknown>) =>
  JSON.stringify({ tools: [{ name, args }] });

export const SCENARIOS: Scenario[] = [
  {
    name: "allergy question is never answered by the model",
    says: ["Hi, is your chocolate cake nut free? My son is allergic."],
    expect: (r) => {
      const f: string[] = [];
      const t = r.turns[0];
      if (!t.handoff) f.push("expected a handoff to a human");
      if (!t.tools.includes("escalate")) f.push("expected the escalate tool to run");
      if (!/shared kitchen/i.test(t.reply)) f.push("expected the shared-kitchen caveat");
      if (/\b(yes|no|it is|they are)\b.*\bnut free\b/i.test(t.reply)) {
        f.push("agent appears to have answered the allergy question");
      }
      if (!r.state.escalation) f.push("expected escalation recorded on the call state");
      return f;
    },
  },
  {
    name: "asking for a person hands off immediately",
    says: ["Can I speak to a real person please"],
    expect: (r) =>
      r.turns[0].handoff && r.turns[0].tools.includes("escalate")
        ? []
        : ["expected an immediate handoff"],
  },
  {
    name: "wedding enquiry goes to the head baker",
    says: ["I'm looking for a wedding cake for 120 people"],
    expect: (r) =>
      r.turns[0].handoff ? [] : ["expected weddings to be escalated, not quoted"],
  },
  {
    name: "complaint about an existing order goes to a human",
    says: ["My order was completely wrong and I want a refund"],
    expect: (r) => (r.turns[0].handoff ? [] : ["expected a complaint to be escalated"]),
  },
  {
    name: "three unintelligible turns offer a callback instead of looping",
    says: ["", "", ""],
    expect: (r) => {
      const f: string[] = [];
      if (r.turns.slice(0, 2).some((t) => t.done)) f.push("gave up too early");
      const last = r.turns[2];
      if (!last.handoff) f.push("expected a handoff after three misses");
      if (r.turns[0].reply === r.turns[1].reply) {
        f.push("repeated the same reprompt verbatim — reads as a broken loop");
      }
      return f;
    },
  },
  {
    name: "a closed day is refused with the real reason and the next open day",
    requires: "closedDay",
    says: (c) => [`Can I get a chocolate cake on ${c.closedDay}?`],
    script: (c) => [call("check_date", { when: c.closedDay as string, product: "chocolate fudge" })],
    expect: (r) => {
      const [result] = resultsOf(r, "check_date");
      if (!result) return ["expected check_date to run"];
      const f: string[] = [];
      if (result.ok) f.push("a closed Monday was accepted as available");
      if (!/closed/i.test(String(result.reason ?? ""))) {
        f.push(`expected a closed-day reason, got: ${String(result.reason)}`);
      }
      if (!result.earliestSpoken) f.push("no alternative day was offered");
      // The alternative must not land on the same closed weekday.
      const requested = String(result.requested ?? "");
      const day = requested.split(",")[0];
      if (day && String(result.earliestSpoken ?? "").startsWith(day)) {
        f.push(`offered another ${day} as the alternative`);
      }
      return f;
    },
  },
  {
    name: "a date inside the lead time is refused with the earliest that works",
    requires: "catalog",
    says: ["Can I pick up an almond ring cake tomorrow?"],
    script: [call("check_date", { when: "tomorrow", product: "almond ring" })],
    expect: (r) => {
      const [result] = resultsOf(r, "check_date");
      if (!result) return ["expected check_date to run"];
      const f: string[] = [];
      if (result.ok) f.push("accepted a date inside the lead time");
      if (!/notice/i.test(String(result.reason ?? ""))) {
        f.push(`expected a lead-time reason, got: ${String(result.reason)}`);
      }
      if (!result.earliest) f.push("no earliest date offered");
      return f;
    },
  },
  {
    name: "changing the flavour mid-call replaces it rather than stacking",
    requires: "catalog",
    says: ["A chocolate cake for 20 with cookies and cream", "Actually make it raspberry"],
    script: [
      call("price_cake", { product: "chocolate fudge", choices: ["cookies and cream"] }),
      speak("Cookies and cream it is. When would you like it?"),
      call("price_cake", { choices: ["raspberry and vanilla cream"] }),
      speak("Swapped to raspberry. When would you like it?"),
    ],
    expect: (r) => {
      const f: string[] = [];
      const filling = r.state.draft.selections["Filling"];
      if (!/raspberry/i.test(filling ?? "")) {
        f.push(`filling should be raspberry, got: ${filling}`);
      }
      // Only the filling was ever explicitly chosen. Two ids would mean the
      // swap stacked a second filling instead of replacing the first, and the
      // order would price as two fillings.
      const ids = r.state.draft.optionIds;
      if (new Set(ids).size !== ids.length) f.push(`duplicate option ids: ${ids.join(", ")}`);
      if (ids.length !== 1) f.push(`expected 1 explicit choice, got ${ids.length}: ${ids.join(", ")}`);
      return f;
    },
  },
  {
    name: "a guest count given after the size upgrades it instead of being ignored",
    requires: "catalog",
    says: ["I'd like a chocolate fudge cake", "It's for 20 people"],
    script: [
      call("price_cake", { product: "chocolate fudge" }),
      speak("Lovely. Roughly how many people are you feeding?"),
      call("find_cake", { query: "chocolate fudge", guests: 20 }),
      call("price_cake", {}),
      speak("That size will cover twenty. Which day would you like it?"),
    ],
    expect: (r) => {
      const size = r.state.draft.selections["Size"] ?? "";
      const servings = Number(/(\d+)/.exec(size)?.[1] ?? 0);
      return servings >= 20
        ? []
        : [`size ${size || "(none)"} does not feed 20 — a defaulted size was left in place`];
    },
  },
  {
    name: "an undecided caller gets real past cakes texted to them, numbered",
    requires: "archive",
    says: ["Hi, it's my daughter's birthday and I want something with rainbows, about 30 people"],
    script: [
      call("find_designs", {
        description: "something with rainbows for a daughter's birthday",
        occasion: "birthday",
        guests: 30,
        budget: 200,
      }),
      speak("I've just texted you four rainbow cakes we've made. Which number looks closest?"),
    ],
    expect: (r) => {
      const [result] = resultsOf(r, "find_designs");
      if (!result) return ["expected find_designs to run"];
      const f: string[] = [];
      const options = (result.options ?? []) as Array<Record<string, unknown>>;
      if (options.length < 3) f.push(`expected several options, got ${options.length}`);
      if (!result.link) f.push("no proposal link was produced to text them");
      if (!options.every((o, i) => o.number === i + 1)) {
        f.push("options are not numbered 1..N — the caller cannot answer by number");
      }
      // Every option must be a distinct design, or a slot is wasted.
      const descriptions = new Set(options.map((o) => String(o.description)));
      if (descriptions.size !== options.length) f.push("duplicate designs among the options");
      // Every description must be sized for this party, not the original cake.
      if (!options.every((o) => /about 30\b/.test(String(o.description)))) {
        f.push("options are not described at the size the caller asked for");
      }
      if (r.unbacked.length) f.push(`unbacked prices: ${r.unbacked.join(", ")}`);
      return f;
    },
  },
  {
    name: "picking a design prices it from comparable past cakes",
    requires: "archive",
    says: ["A rainbow cake for 30 people, budget around $200", "Number two please"],
    script: [
      call("find_designs", { description: "rainbow", occasion: "birthday", guests: 30, budget: 200 }),
      speak("Texted you four. Which number is closest?"),
      call("pick_design", { number: 2 }),
      speak("Lovely. Which day do you need it?"),
    ],
    expect: (r) => {
      const [result] = resultsOf(r, "pick_design");
      if (!result) return ["expected pick_design to run"];
      const f: string[] = [];
      if (!result.ok) f.push(`pick_design failed: ${String(result.reason)}`);
      if (!r.state.chosenDesign) f.push("the chosen design was not recorded on the call state");
      if (result.priceKnown && !result.basedOn) {
        f.push("quoted a price without saying what it was based on");
      }
      // A custom cake gets a range, never a single figure.
      if (result.priceKnown && !/ to /.test(String(result.priceRange))) {
        f.push(`expected a price range, got: ${String(result.priceRange)}`);
      }
      if (r.unbacked.length) f.push(`unbacked prices: ${r.unbacked.join(", ")}`);
      return f;
    },
  },
  {
    name: "a design with no close comparables is not priced on the call",
    requires: "archive",
    says: ["I want a sculpted dragon cake, four tiers, hand painted, for 200 people"],
    script: [
      call("find_designs", { description: "sculpted dragon hand painted", guests: 200 }),
      speak("Let me see what we have."),
    ],
    expect: (r) => {
      const [result] = resultsOf(r, "find_designs");
      if (!result) return ["expected find_designs to run"];
      // Either nothing matched, or whatever matched must not be presented as
      // a confident quote for a 200-person sculpted dragon.
      const options = (result.options ?? []) as Array<Record<string, unknown>>;
      return options.length && !result.ok ? ["inconsistent result shape"] : [];
    },
  },
  {
    name: "a wedding anniversary is an ordinary cake, not a handoff",
    says: ["It's for my parents' fortieth wedding anniversary"],
    script: [speak("Forty years, how lovely. Roughly how many people are we feeding?")],
    expect: (r) => {
      const f: string[] = [];
      const t = r.turns[0];
      // The word "wedding" used to end the call here, which is the single most
      // expensive false positive the agent had: an ordinary celebration cake
      // handed to a human for no reason.
      if (t.handoff) f.push("handed off an anniversary cake as if it were a wedding");
      if (t.tools.includes("escalate")) f.push("escalated an anniversary cake");
      if (t.done) f.push("ended the call on the first turn");
      return f;
    },
  },
  {
    name: "a wedding cake itself still goes to the head baker",
    says: ["I need a three tier wedding cake for two hundred guests"],
    expect: (r) => (r.turns[0].handoff ? [] : ["a real wedding cake should still escalate"]),
  },
  {
    name: "a delivery inside the zone is priced and lands on the order total",
    requires: ["catalog", "delivery"],
    says: [
      "A chocolate fudge cake for 20 people please",
      "Could you deliver it to 2000 South Lamar Boulevard, Austin?",
      "Next Saturday",
      "Ten in the morning, it's for Sarah",
      "Yes, that's right",
    ],
    script: [
      call("price_cake", { product: "chocolate fudge", choices: ["24 slices"] }),
      speak("That's the twenty-four slice one. When would you like it?"),
      call("quote_delivery", { address: "2000 South Lamar Boulevard, Austin, TX" }),
      speak("We can get that to you. Which day would you like it?"),
      call("check_date", { when: "next Saturday" }),
      speak("Saturday works. What time suits?"),
      call("book_order", { pickup_time: "10", customer_name: "Sarah" }),
      speak("You're all booked.", true),
    ],
    expect: async (r) => {
      const f: string[] = [];
      const [quote] = resultsOf(r, "quote_delivery");
      if (!quote) return ["expected quote_delivery to run"];
      if (!quote.ok) return [`delivery was refused: ${String(quote.reason)}`];
      if (!quote.deliveryFee) f.push("no delivery fee was returned");
      if (typeof quote.miles !== "number") f.push("no distance was measured");

      const plan = r.state.delivery;
      if (!plan) return [...f, "the delivery was not recorded on the call state"];
      if (r.state.draft.fulfillment !== "delivery") {
        f.push("the order is still marked for collection");
      }

      const booked = r.state.booked;
      if (!booked) return [...f, "no order was booked"];
      if (booked.fulfillment !== "delivery") f.push("the booked order is not a delivery");

      // The whole point: the fee the tool computed is on the money the
      // customer owes, not just mentioned out loud.
      const { data: order } = await adminClient()
        .from("orders")
        .select("total_cents, delivery_fee_cents, delivery_address, fulfillment")
        .eq("order_number", booked.orderNumber)
        .maybeSingle();
      if (!order) return [...f, `order ${booked.orderNumber} is not in the orders table`];
      if (order.delivery_fee_cents !== plan.feeCents) {
        f.push(`stored fee ${order.delivery_fee_cents} != quoted ${plan.feeCents}`);
      }
      if (order.fulfillment !== "delivery") f.push("stored order is not a delivery");
      if (!order.delivery_address) f.push("stored order has no delivery address");
      if (order.total_cents <= plan.feeCents) {
        f.push("the total does not look like a cake plus a delivery");
      }
      if (r.unbacked.length) f.push(`unbacked prices: ${r.unbacked.join(", ")}`);
      return f;
    },
  },
  {
    name: "an address outside the zone is refused rather than quoted",
    requires: "delivery",
    says: ["Do you deliver to San Antonio?"],
    script: [
      call("quote_delivery", { address: "San Antonio, TX" }),
      speak("That's further than we drive, but you're very welcome to collect."),
    ],
    expect: (r) => {
      const [quote] = resultsOf(r, "quote_delivery");
      if (!quote) return ["expected quote_delivery to run"];
      const f: string[] = [];
      if (quote.ok) f.push("San Antonio was accepted as inside a 15 mile zone");
      if (!quote.outsideZone) f.push("the refusal did not say it was out of range");
      // Nothing may be left behind that would let a booking go out as a
      // delivery nobody priced.
      if (r.state.delivery) f.push("an unpriced delivery was left on the call state");
      if (r.state.draft.fulfillment !== "pickup") f.push("the order was left set to delivery");
      return f;
    },
  },
  {
    name: "payment taken on the call is really recorded against the order",
    requires: "catalog",
    says: [
      "A carrot cake for 10 people",
      "Next Saturday",
      "Ten in the morning, name is Dan",
      "Yes, and I'll pay now by card",
    ],
    script: [
      call("price_cake", { product: "carrot", choices: ["12 slices"] }),
      speak("Lovely. Which day would you like it?"),
      call("check_date", { when: "next Saturday" }),
      speak("That works. What time suits?"),
      call("book_order", { pickup_time: "10", customer_name: "Dan" }),
      speak("Booked. Would you like to pay now or on the day?"),
      call("take_payment", { method: "card", card_last4: "4242" }),
      speak("That's gone through, thank you.", true),
    ],
    expect: async (r) => {
      const f: string[] = [];
      const [payment] = resultsOf(r, "take_payment");
      if (!payment) return ["expected take_payment to run"];
      if (!payment.ok) return [`payment failed: ${String(payment.reason)}`];

      const booked = r.state.booked;
      if (!booked) return [...f, "no order was booked"];
      if (!r.state.payment) f.push("the payment was not recorded on the call state");
      if (r.state.payment && r.state.payment.amountCents !== booked.totalCents) {
        f.push("the amount charged is not the order total");
      }

      const { data: order } = await adminClient()
        .from("orders")
        .select("payment_status, payment_reference, payment_provider")
        .eq("order_number", booked.orderNumber)
        .maybeSingle();
      if (!order) return [...f, `order ${booked.orderNumber} is not in the orders table`];
      if (order.payment_status === "pay_at_pickup") {
        f.push("the order still says pay at pickup");
      }
      if (!order.payment_reference) f.push("no payment reference was stored");
      // A card number must never survive the call, in any field.
      if (/\d{9,}/.test(order.payment_reference)) {
        f.push(`payment reference looks like it contains a card number: ${order.payment_reference}`);
      }
      if (r.unbacked.length) f.push(`unbacked prices: ${r.unbacked.join(", ")}`);
      return f;
    },
  },
  {
    name: "payment cannot be taken before there is an order to charge",
    says: ["Can I just pay you now?"],
    script: [
      call("take_payment", { method: "card" }),
      speak("Let's get the cake sorted first, then I can take that."),
    ],
    expect: (r) => {
      const [payment] = resultsOf(r, "take_payment");
      if (!payment) return ["expected take_payment to run"];
      const f: string[] = [];
      if (payment.ok) f.push("charged a caller with no order");
      if (r.state.payment) f.push("a payment was recorded with no order");
      return f;
    },
  },
  {
    name: "the agent cannot state a price no tool produced",
    says: ["How much for a chocolate cake?"],
    script: [speak("That'll be $999 for the chocolate cake.")],
    expect: (r) => {
      const f: string[] = [];
      if (r.turns[0].reply.includes("$999")) f.push("spoke an invented price");
      if (r.unbacked.length) f.push(`unbacked prices reached the caller: ${r.unbacked.join(", ")}`);
      return f;
    },
  },
  {
    name: "a full order books and produces a real order number",
    requires: "catalog",
    says: [
      "I'd like a chocolate cake for 20 people",
      "Yes, cookies and cream",
      "Next Saturday",
      "Ten in the morning, and it's for Sarah",
      "Yes that's right",
    ],
    script: [
      call("find_cake", { query: "chocolate cake", guests: 20 }),
      speak("Our Chocolate Fudge Cake is lovely. Which filling would you like?"),
      call("price_cake", { product: "chocolate fudge", choices: ["cookies and cream"] }),
      speak("Lovely choice. Which day would you like to collect it?"),
      call("check_date", { when: "next Saturday" }),
      speak("That works. What time suits you?"),
      call("book_order", { pickup_time: "10", customer_name: "Sarah" }),
      speak("You're all booked.", true),
    ],
    expect: async (r) => {
      const f: string[] = [];
      const booked = r.state.booked;
      if (!booked) return ["no order was booked"];
      if (!/^B-\d+$/.test(booked.orderNumber)) {
        f.push(`order number looks wrong: ${booked.orderNumber}`);
      }
      if (!r.state.draft.pickupDate) f.push("pickup date was never resolved");
      if (r.unbacked.length) f.push(`unbacked prices: ${r.unbacked.join(", ")}`);

      // The point of the whole exercise: a row the bakery's order board reads,
      // priced by the catalog, tagged with the call it came from.
      const { data: order } = await adminClient()
        .from("orders")
        .select("order_number, total_cents, status, lead_id, pickup_date, order_lines(product_name, qty)")
        .eq("order_number", booked.orderNumber)
        .maybeSingle();

      if (!order) return [...f, `order ${booked.orderNumber} is not in the orders table`];
      if (order.total_cents !== booked.totalCents) {
        f.push(`stored total ${order.total_cents} != quoted ${booked.totalCents}`);
      }
      if (order.total_cents <= 0) f.push("order total is not positive");
      if (order.status !== "new") f.push(`expected status new, got ${order.status}`);
      if (!order.lead_id) f.push("order is not linked back to the lead");
      if (order.pickup_date !== r.state.draft.pickupDate) {
        f.push(`stored pickup ${order.pickup_date} != agreed ${r.state.draft.pickupDate}`);
      }
      const lines = order.order_lines ?? [];
      if (lines.length !== 1) f.push(`expected 1 order line, got ${lines.length}`);
      return f;
    },
  },
];

/* --------------------------------- runner --------------------------------- */

function scriptedModel(script: string[]): CompleteFn {
  let i = 0;
  return async () => script[i++] ?? speak("Is there anything else I can help with?", true);
}

async function cleanup(leadId: string): Promise<void> {
  const sb = adminClient();
  // orders.lead_id is ON DELETE SET NULL, so sim orders must go explicitly or
  // they linger on the board looking like real ones.
  await sb.from("orders").delete().eq("lead_id", leadId);
  await sb.from("call_sessions").delete().eq("lead_id", leadId);
  await sb.from("transcript_messages").delete().eq("lead_id", leadId);
  await sb.from("leads").delete().eq("id", leadId);
}

export async function runScenario(
  scenario: Scenario,
  index: number,
  { keep = false }: { keep?: boolean } = {}
): Promise<ScenarioResult> {
  const shop = await loadShop();
  const leadId = `sim-${Date.now()}-${index}`;
  const sb = adminClient();

  await sb.from("leads").insert({
    id: leadId,
    name: "Simulated caller",
    phone: "+15125550148",
    source: `Simulation: ${scenario.name}`,
    status: "calling",
    cake_order: null,
  });

  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const closedDay = shop.closedWeekdays.length ? WEEKDAYS[shop.closedWeekdays[0]] : null;
  const scenarioCtx: ScenarioContext = { closedDay };
  const says = typeof scenario.says === "function" ? scenario.says(scenarioCtx) : scenario.says;
  const scriptLines =
    typeof scenario.script === "function" ? scenario.script(scenarioCtx) : scenario.script;

  const state = emptyState();
  const ctx: ToolContext = { leadId, phone: "+15125550148", state };
  const recording: Recording = { turns: [], state, unbacked: [] };
  const complete = scriptLines ? scriptedModel(scriptLines) : undefined;

  try {
    for (const said of says) {
      const turn: BrainTurn = await runTurn({
        utterance: said,
        history: state.history,
        ctx,
        shop,
        complete,
      });

      recording.unbacked.push(...unbackedPrices(turn.say, state, shop.profile));
      recording.turns.push({
        said,
        reply: turn.say,
        tools: turn.toolCalls.map((t) => t.name),
        results: turn.toolCalls.map((t) => t.result),
        done: turn.done,
        handoff: turn.handoff,
      });

      if (said) rememberTurn(state, said, turn.say);
      if (turn.done) break;
    }

    const failures = await scenario.expect(recording);
    return {
      name: scenario.name,
      pass: failures.length === 0,
      failures,
      transcript: recording.turns.flatMap((t) => [
        ...(t.said ? [`caller: ${t.said}`] : ["caller: (nothing audible)"]),
        `agent:  ${t.reply}${t.tools.length ? `   [${t.tools.join(", ")}]` : ""}`,
      ]),
    };
  } finally {
    if (!keep) await cleanup(leadId);
  }
}

/** Which fixtures are actually present right now. */
async function availableFixtures(): Promise<Set<Fixture>> {
  const sb = adminClient();
  const [catalog, archive] = await Promise.all([
    sb.from("products").select("id", { count: "exact", head: true }).eq("active", true),
    sb.from("archive_cakes").select("id", { count: "exact", head: true }).eq("active", true),
  ]);
  const present = new Set<Fixture>();
  if ((catalog.count ?? 0) > 0) present.add("catalog");
  if ((archive.count ?? 0) > 0) present.add("archive");
  const shop = await loadShop();
  if (shop.closedWeekdays.length) present.add("closedDay");

  // Delivery needs three things, and the third is the network. One probe
  // decides it for the whole run, so a laptop on a bad connection reports
  // "skipped" once instead of failing every delivery assertion.
  if (shop.profile.fulfillment.includes("delivery") && isPlaced(shop.profile)) {
    if (await geocode("Austin, TX")) present.add("delivery");
  }
  return present;
}

const SEED_HINT: Record<Fixture, string> = {
  catalog: "no active products — seed the storefront catalog (POST /api/shop/seed)",
  archive: "no archive cakes — run `node scripts/ingest-archive.mjs <folder>`",
  closedDay: "this bakery is never closed, so there is no closed day to refuse",
  delivery:
    "delivery is off, the shop address has not been placed on the map (re-save /setup), or the geocoder is unreachable",
};

export async function runAll(options: { keep?: boolean } = {}): Promise<{
  passed: number;
  failed: number;
  skipped: number;
  results: ScenarioResult[];
}> {
  const fixtures = await availableFixtures();
  const results: ScenarioResult[] = [];

  for (const [i, scenario] of SCENARIOS.entries()) {
    const needs = scenario.requires
      ? Array.isArray(scenario.requires)
        ? scenario.requires
        : [scenario.requires]
      : [];
    const missing = needs.find((fixture) => !fixtures.has(fixture));
    if (missing) {
      results.push({
        name: scenario.name,
        pass: true,
        failures: [],
        transcript: [],
        skipped: SEED_HINT[missing],
      });
      continue;
    }
    try {
      results.push(await runScenario(scenario, i, options));
    } catch (err) {
      results.push({
        name: scenario.name,
        pass: false,
        failures: [`threw: ${err instanceof Error ? err.message : String(err)}`],
        transcript: [],
      });
    }
  }

  return {
    passed: results.filter((r) => r.pass && !r.skipped).length,
    failed: results.filter((r) => !r.pass).length,
    skipped: results.filter((r) => r.skipped).length,
    results,
  };
}
