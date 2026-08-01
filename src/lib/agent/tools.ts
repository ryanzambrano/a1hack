/**
 * The agent's grounded tools.
 *
 * THE INVARIANT: every price, date and availability claim the agent makes on
 * a call originates here, computed from the catalog in Postgres. The model
 * chooses *which* tool to call and how to phrase the answer; it never does
 * arithmetic and never invents a value. A wrong price quoted on a recorded
 * call is a real liability for a small bakery, so this is enforced by
 * construction rather than by asking the prompt nicely.
 *
 * Options are addressed by what the caller SAID ("the 24 serving one",
 * "chocolate"), not by numeric id. Matching happens here against real rows,
 * so an id can never be hallucinated and an unmatched phrase comes back with
 * the real alternatives for the agent to offer.
 */

import {
  type ShopProduct,
  checkPickupDate,
  createPhoneOrder,
  loadShop,
  pickupSlots,
  resolveSelection,
  suggestSizeForGuests,
  unitPriceCents,
} from "@/lib/server/catalog";
import { checkFeasible } from "@/lib/archive/comps";
import { estimatePrice } from "@/lib/archive/estimator";
import { createProposal, getProposal, recordChoice } from "@/lib/archive/proposals";
import {
  type ArchiveCake,
  briefFromText,
  describeDesign,
  invalidateArchive,
  loadArchive,
  scaledPriceCents,
  selectOptions,
  vocabularyOf,
} from "@/lib/archive/retrieval";
import { sendSms } from "@/lib/server/a1";
import { BAKERY_TZ, resolveDatePhrase, speakDate, speakSlot, todayInZone } from "./dates";
import type { CallState } from "./ontology";
import { speakList, speakMoney, speakOrderNumber } from "./speech";

export interface ToolContext {
  leadId: string;
  phone: string;
  state: CallState;
  now?: Date;
}

export type ToolName =
  | "find_cake"
  | "price_cake"
  | "check_date"
  | "book_order"
  | "find_designs"
  | "pick_design"
  | "escalate";

export interface ToolResult {
  ok: boolean;
  /** Fed back to the model as the tool's observation. */
  [key: string]: unknown;
}

/* -------------------------------- matching -------------------------------- */

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function score(target: string, query: string): number {
  const t = normalize(target);
  const q = normalize(query);
  if (!q || !t) return 0;
  if (t === q) return 100;
  if (t.includes(q)) return 80;
  if (q.includes(t)) return 70;
  const queryWords = q.split(" ");
  const targetWords = new Set(t.split(" "));
  const hits = queryWords.filter((w) => w.length > 2 && targetWords.has(w)).length;
  return hits ? (hits / queryWords.length) * 60 : 0;
}

function matchProduct(products: ShopProduct[], query: string): ShopProduct | null {
  let best: { p: ShopProduct; s: number } | null = null;
  for (const p of products) {
    const s = Math.max(
      score(p.name, query),
      score(p.category, query) * 0.6,
      score(p.description, query) * 0.4
    );
    if (s > 0 && (!best || s > best.s)) best = { p, s };
  }
  return best && best.s >= 20 ? best.p : null;
}

type AnyOption = ShopProduct["optionGroups"][number]["options"][number];

function matchOption(product: ShopProduct, phrase: string): AnyOption | null {
  let best: { o: AnyOption; s: number } | null = null;
  for (const g of product.optionGroups) {
    for (const o of g.options) {
      const s = score(o.value, phrase);
      if (s > 0 && (!best || s > best.s)) best = { o, s };
    }
  }
  return best && best.s >= 40 ? best.o : null;
}

function matchSlot(slots: string[], phrase: string): string | null {
  const q = normalize(phrase);
  if (!q) return null;
  // "10", "10am", "10 to 11" all name the opening hour of a window.
  const hour = /(\d{1,2})/.exec(q);
  if (hour) {
    let h = Number(hour[1]);
    if (/\bpm\b|afternoon|evening/.test(q) && h < 12) h += 12;
    const found = slots.find((s) => Number(s.slice(0, 2)) === h);
    if (found) return found;
  }
  if (/morning/.test(q)) return slots.find((s) => Number(s.slice(0, 2)) < 12) ?? null;
  if (/afternoon|evening/.test(q)) return slots.find((s) => Number(s.slice(0, 2)) >= 12) ?? null;
  return null;
}

/**
 * Whether the caller actually picked something from a group, as opposed to
 * `resolveSelection` having filled in its default. `selections` holds the
 * resolved view for reading the order back, so it cannot answer this —
 * `optionIds` only ever holds real choices.
 */
function hasExplicitChoice(
  product: ShopProduct,
  optionIds: number[],
  groupPattern: RegExp
): boolean {
  const group = product.optionGroups.find((g) => groupPattern.test(g.name));
  return Boolean(group?.options.some((o) => optionIds.includes(o.id)));
}

/** Replace one group's choice, so "actually make it chocolate" swaps cleanly. */
function applyChoice(state: CallState, product: ShopProduct, option: AnyOption): void {
  const group = product.optionGroups.find((g) => g.options.some((o) => o.id === option.id));
  if (!group) return;
  const siblingIds = new Set(group.options.map((o) => o.id));
  state.draft.optionIds = state.draft.optionIds.filter((id) => !siblingIds.has(id));
  state.draft.optionIds.push(option.id);
  state.draft.selections[group.name] = option.value;
}

/* --------------------------------- tools ---------------------------------- */

async function findCake(args: { query?: string; guests?: number }, ctx: ToolContext): Promise<ToolResult> {
  const shop = await loadShop();
  const guests = Number.isFinite(args.guests) ? Number(args.guests) : null;
  if (guests) ctx.state.draft.guests = guests;

  const match = args.query ? matchProduct(shop.products, args.query) : null;
  let candidates = match ? [match] : shop.products;

  // With a guest count, rank by how well the item serves a party of that
  // size: something that feeds them all, then something sized but too small,
  // and only then items with no size at all — nobody feeds thirty people
  // croissants because croissants happen to be cheapest.
  if (!match && guests) {
    const rank = (p: ShopProduct) => {
      const fit = suggestSizeForGuests(p, guests);
      if (!fit) return 2;
      return fit.sufficient ? 0 : 1;
    };
    candidates = [...candidates].sort(
      (a, b) => rank(a) - rank(b) || a.basePriceCents - b.basePriceCents
    );
  }

  return {
    ok: true,
    products: candidates.slice(0, match ? 1 : 4).map((p) => {
      const suggested = guests ? suggestSizeForGuests(p, guests) : null;
      const chosen = suggested
        ? resolveSelection(p, [suggested.option.id])
        : resolveSelection(p, []);
      const price = chosen.ok ? unitPriceCents(p, chosen.chosen) : p.basePriceCents;
      return {
        product: p.name,
        description: p.description,
        leadTimeDays: p.leadTimeDays,
        canHaveCakeText: p.canHaveCakeText,
        priceFrom: speakMoney(p.basePriceCents),
        ...(suggested
          ? {
              suggestedSize: suggested.option.value,
              feeds: suggested.servings,
              enoughForGuests: suggested.sufficient,
              priceAtSuggestedSize: speakMoney(price),
            }
          : {}),
        choices: Object.fromEntries(
          p.optionGroups.map((g) => [g.name, g.options.map((o) => o.value)])
        ),
      };
    }),
    ...(guests ? { guests } : {}),
    ...(match ? {} : { note: "No single match — offer these and ask which they want." }),
  };
}

async function priceCake(
  args: { product?: string; choices?: string[]; cake_text?: string; qty?: number },
  ctx: ToolContext
): Promise<ToolResult> {
  const shop = await loadShop();
  const draft = ctx.state.draft;

  const product = args.product
    ? matchProduct(shop.products, args.product)
    : shop.products.find((p) => p.id === draft.productId) ?? null;
  if (!product) {
    return {
      ok: false,
      reason: "No such item on the menu.",
      available: shop.products.map((p) => p.name),
    };
  }

  if (product.id !== draft.productId) {
    draft.productId = product.id;
    draft.productName = product.name;
    draft.optionIds = [];
    draft.selections = {};
  }

  const unmatched: string[] = [];
  for (const phrase of args.choices ?? []) {
    const option = matchOption(product, phrase);
    if (option) applyChoice(ctx.state, product, option);
    else unmatched.push(phrase);
  }

  // A guest count still decides the size if the caller never named one. This
  // tests the ids rather than `selections`, so a size that was merely
  // defaulted earlier still gets upgraded when the party size comes up.
  if (draft.guests && !hasExplicitChoice(product, draft.optionIds, /size|serves/i)) {
    const suggested = suggestSizeForGuests(product, draft.guests);
    if (suggested) applyChoice(ctx.state, product, suggested.option);
  }

  if (args.cake_text !== undefined) {
    if (args.cake_text && !product.canHaveCakeText) {
      return { ok: false, reason: `We cannot put writing on the ${product.name}.` };
    }
    draft.cakeText = String(args.cake_text).slice(0, 60);
  }
  if (Number.isFinite(args.qty) && Number(args.qty) > 0) draft.qty = Math.floor(Number(args.qty));

  const selection = resolveSelection(product, draft.optionIds);
  if (!selection.ok) return { ok: false, reason: selection.reason };

  const unit = unitPriceCents(product, selection.chosen, draft.cakeText);
  const total = unit * draft.qty;
  ctx.state.quotedCents = total;
  for (const c of selection.chosen) draft.selections[c.group] = c.value;

  return {
    ok: true,
    product: product.name,
    chosen: selection.chosen.map((c) => `${c.group}: ${c.value}`),
    ...(draft.cakeText ? { cakeText: draft.cakeText } : {}),
    qty: draft.qty,
    leadTimeDays: product.leadTimeDays,
    // The agent says this string verbatim; it is the only price it may state.
    price: speakMoney(total),
    summary: `${draft.qty > 1 ? `${draft.qty} ` : ""}${speakList(
      selection.chosen.filter((c) => !/size/i.test(c.group)).map((c) => c.value.toLowerCase())
    )} ${product.name}`,
    ...(unmatched.length
      ? {
          unmatched,
          note: "These were not on the menu — do not offer them; offer the real choices instead.",
          available: Object.fromEntries(
            product.optionGroups.map((g) => [g.name, g.options.map((o) => o.value)])
          ),
        }
      : {}),
  };
}

async function checkDate(args: { when?: string; product?: string }, ctx: ToolContext): Promise<ToolResult> {
  const shop = await loadShop();
  const now = ctx.now ?? new Date();
  const today = todayInZone(BAKERY_TZ, now);

  const product = args.product
    ? matchProduct(shop.products, args.product)
    : shop.products.find((p) => p.id === ctx.state.draft.productId) ?? null;
  const leadTime = product?.leadTimeDays ?? 1;

  const date = resolveDatePhrase(args.when ?? "", today);
  if (!date) {
    return {
      ok: false,
      reason: "Could not pin that down to a date — ask them to say the day again.",
      today: speakDate(today),
    };
  }

  const check = checkPickupDate(shop, leadTime, date, now);
  if (!check.ok) {
    return {
      ok: false,
      requested: speakDate(date),
      reason: check.reason,
      earliest: check.earliest,
      earliestSpoken: speakDate(check.earliest),
      note: "Say why it does not work, then offer the earliest date.",
    };
  }

  ctx.state.draft.pickupDate = date;
  return {
    ok: true,
    date,
    dateSpoken: speakDate(date),
    slots: check.slots,
    slotsSpoken: check.slots.map(speakSlot),
  };
}

async function bookOrder(
  args: { pickup_time?: string; customer_name?: string; note?: string },
  ctx: ToolContext
): Promise<ToolResult> {
  const shop = await loadShop();
  const draft = ctx.state.draft;

  if (args.customer_name) draft.customerName = String(args.customer_name).slice(0, 80);
  if (args.note) draft.notes = String(args.note).slice(0, 500);

  if (!draft.productId) return { ok: false, reason: "No cake chosen yet." };
  if (!draft.pickupDate) return { ok: false, reason: "No pickup date confirmed yet — call check_date." };

  const slots = pickupSlots(shop);
  const slot = args.pickup_time ? matchSlot(slots, args.pickup_time) : draft.pickupSlot;
  if (!slot) {
    return {
      ok: false,
      reason: "Need a pickup time.",
      slots,
      slotsSpoken: slots.map(speakSlot),
    };
  }
  draft.pickupSlot = slot;

  const result = await createPhoneOrder(
    {
      customerName: draft.customerName ?? "Phone customer",
      customerPhone: ctx.phone,
      pickupDate: draft.pickupDate,
      pickupSlot: slot,
      note: draft.notes,
      leadId: ctx.leadId,
      lines: [
        {
          productId: draft.productId,
          qty: draft.qty,
          optionIds: draft.optionIds,
          cakeText: draft.cakeText,
        },
      ],
    },
    ctx.now ?? new Date()
  );

  if (!result.ok) return { ok: false, reason: result.reason };

  ctx.state.booked = {
    orderNumber: result.order.orderNumber,
    totalCents: result.order.totalCents,
    pickupDate: result.order.pickupDate,
    pickupSlot: result.order.pickupSlot,
  };

  return {
    ok: true,
    orderNumber: result.order.orderNumber,
    orderNumberSpoken: speakOrderNumber(result.order.orderNumber),
    total: speakMoney(result.order.totalCents),
    pickupSpoken: `${speakDate(result.order.pickupDate)}, ${speakSlot(result.order.pickupSlot)}`,
    note: "Order is placed. Read back the order number, then close warmly.",
  };
}

/* ------------------------- the custom-cake lane --------------------------- */

/** A past cake's own sale price, scaled to the size asked for, as a band. */
function bandFor(cake: ArchiveCake, servings: number | null): [number, number] {
  const mid = scaledPriceCents(cake, servings) ?? 0;
  return [Math.round((mid * 0.9) / 500) * 500, Math.round((mid * 1.12) / 500) * 500];
}

/**
 * Write the proposal, retrying once against a freshly loaded archive.
 *
 * The archive is cached for a minute. If it is re-imported during that
 * window the cached rows point at ids that no longer exist, and writing the
 * options fails on the foreign key — which the caller would hear as a flat
 * "that lookup failed". A live call should recover from that by itself, so a
 * write failure drops the cache and picks the options again.
 */
async function buildProposal(
  bakeryId: string,
  ctx: ToolContext,
  brief: ReturnType<typeof briefFromText>,
  options: ReturnType<typeof selectOptions>["options"],
  guests: number | null,
  budgetCents: number | null
) {
  const toInput = (designs: typeof options) =>
    designs.map((design) => {
      const [low, high] = bandFor(design.cake, guests ?? design.cake.servings);
      return {
        design,
        priceLowCents: low,
        priceHighCents: high,
        // Judged on the band actually shown, not the design's original sale
        // price — otherwise an option can be flagged "above budget" while
        // displaying a price below it.
        aboveBudget: Boolean(budgetCents && (low + high) / 2 > budgetCents * 1.15),
      };
    });

  try {
    return await createProposal({
      bakeryId,
      leadId: ctx.leadId || null,
      brief,
      options: toInput(options),
    });
  } catch (err) {
    console.warn("proposal write failed, retrying with a fresh archive", err);
    invalidateArchive();
    const fresh = await loadArchive(bakeryId);
    const reselected = selectOptions(fresh, brief, 4).options;
    if (!reselected.length) throw err;
    return createProposal({
      bakeryId,
      leadId: ctx.leadId || null,
      brief,
      options: toInput(reselected),
    });
  }
}

/**
 * Retrieve past cakes matching what the caller is describing, text them a
 * numbered link, and hand the agent short descriptions it can read aloud.
 *
 * This is the custom-cake lane. A caller who says "something with rainbows"
 * is not ordering a catalogue item — they are, in Sweet Lady Jane's words,
 * someone who does not know what they want and gets "guided towards an
 * answer" by a person. Showing four things the bakery has actually made is
 * that guidance, delivered in seconds instead of a day.
 */
async function findDesigns(
  args: { description?: string; occasion?: string; guests?: number; budget?: number },
  ctx: ToolContext
): Promise<ToolResult> {
  const shop = await loadShop();
  const archive = await loadArchive(shop.id);
  if (!archive.length) {
    return { ok: false, reason: "The design archive is empty — nothing to show yet." };
  }

  const guests = Number.isFinite(args.guests) ? Number(args.guests) : ctx.state.draft.guests;
  // Callers say "two hundred dollars", not 20000.
  const budgetCents = Number.isFinite(args.budget) ? Math.round(Number(args.budget) * 100) : null;
  if (guests) ctx.state.draft.guests = guests;
  if (args.occasion) ctx.state.draft.occasion = String(args.occasion).slice(0, 60);

  const brief = briefFromText(args.description ?? "", archive, {
    occasion: args.occasion ?? ctx.state.draft.occasion ?? null,
    guests: guests ?? null,
    budgetCents,
  });

  const { options } = selectOptions(archive, brief, 4);
  if (!options.length) {
    return {
      ok: false,
      reason: "Nothing in the archive matches that.",
      note: "Ask what they had in mind, or offer a theme we do have.",
      themesWeHave: vocabularyOf(archive).themes.slice(0, 12),
    };
  }

  const proposal = await buildProposal(shop.id, ctx, brief, options, guests, budgetCents);
  ctx.state.proposalCode = proposal.code;
  ctx.state.offeredCents = proposal.options.flatMap((o) => [o.priceLowCents, o.priceHighCents]);

  // Sent while the caller is still on the line — the point is that they look
  // at it during the conversation, not after it.
  const sent = await sendSms(
    ctx.phone,
    `${shop.name}: ${proposal.options.length} cakes we've made that match what you described — ${proposal.url}`
  );

  return {
    ok: true,
    textedTo: sent ? ctx.phone : null,
    smsDelivered: sent,
    link: proposal.url,
    options: proposal.options.map((o) => ({
      number: o.position,
      description: describeDesign(o.cake, guests ?? o.cake.servings),
      priceRange: `${speakMoney(o.priceLowCents)} to ${speakMoney(o.priceHighCents)}`,
      ...(o.aboveBudget ? { note: "above the budget they mentioned" } : {}),
    })),
    note:
      (sent
        ? "Photos have been texted to them. "
        : "The text could not be delivered, so describe the options aloud instead. ") +
      "Options are numbered — ask which number is closest. Describe one or two out loud rather than listing all of them.",
  };
}

/**
 * The caller picked a number. Price it properly from comparable past cakes.
 */
async function pickDesign(
  args: { number?: number; changes?: string; guests?: number },
  ctx: ToolContext
): Promise<ToolResult> {
  const code = ctx.state.proposalCode;
  if (!code) return { ok: false, reason: "No designs have been sent yet — call find_designs first." };

  const proposal = await getProposal(code);
  const position = Number(args.number);
  const option = proposal?.options.find((o) => o.position === position);
  if (!option) {
    return {
      ok: false,
      reason: `There is no option ${args.number}.`,
      available: proposal?.options.map((o) => o.position) ?? [],
    };
  }

  const shop = await loadShop();
  const archive = await loadArchive(shop.id);
  const guests = Number.isFinite(args.guests) ? Number(args.guests) : ctx.state.draft.guests;

  const feasible = checkFeasible(option.techniques);
  if (!feasible.ok) {
    return { ok: false, reason: feasible.reason, note: "Explain why and offer an alternative." };
  }

  const estimate = await estimatePrice(
    {
      themes: option.themes,
      colors: option.colors,
      techniques: option.techniques,
      occasion: ctx.state.draft.occasion ?? null,
      servings: guests ?? option.servings,
      tiers: option.tiers,
    },
    archive
  );

  ctx.state.chosenDesign = {
    position,
    title: option.title,
    archiveCakeId: 0,
    lowCents: estimate.lowCents,
    highCents: estimate.highCents,
    confidence: estimate.confidence,
    needsKitchenReview: estimate.needsKitchenReview,
  };
  ctx.state.offeredCents = [
    ...(ctx.state.offeredCents ?? []),
    estimate.lowCents,
    estimate.highCents,
  ];
  if (args.changes) {
    ctx.state.draft.notes = `${ctx.state.draft.notes} ${args.changes}`.trim().slice(0, 500);
  }
  ctx.state.draft.productName = option.title;

  await recordChoice(code, position, estimate);

  if (estimate.needsKitchenReview) {
    return {
      ok: true,
      chosen: option.title,
      priceKnown: false,
      note:
        "Do NOT give a price for this one. Nothing close enough has been made before, so say the head baker will confirm the price, and take the rest of the details.",
      rationale: estimate.rationale,
    };
  }

  return {
    ok: true,
    chosen: option.title,
    priceKnown: true,
    // The only price the agent may state for this design.
    priceRange: `${speakMoney(estimate.lowCents)} to ${speakMoney(estimate.highCents)}`,
    confidence: estimate.confidence,
    basedOn:
      estimate.method === "comps"
        ? `${estimate.comparables.length} similar cakes made before`
        : "this bakery's own pricing pattern",
    rationale: estimate.rationale,
    note: "Give the range, not a single figure, and say it depends on final details.",
  };
}

async function escalate(args: { reason?: string; note?: string }, ctx: ToolContext): Promise<ToolResult> {
  ctx.state.escalation = {
    reason: String(args.reason ?? "unspecified").slice(0, 120),
    note: String(args.note ?? "").slice(0, 500),
  };
  return {
    ok: true,
    note: "Flagged for a human. Tell them someone from the bakery will call back, and do not attempt to answer the question yourself.",
  };
}

/* ------------------------------- dispatch --------------------------------- */

const HANDLERS = {
  find_cake: findCake,
  price_cake: priceCake,
  check_date: checkDate,
  book_order: bookOrder,
  find_designs: findDesigns,
  pick_design: pickDesign,
  escalate,
} as const;

export function isToolName(name: string): name is ToolName {
  return name in HANDLERS;
}

export async function runTool(
  name: ToolName,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolResult> {
  try {
    return await HANDLERS[name](args as never, ctx);
  } catch (err) {
    console.error(`tool ${name} failed`, err);
    return { ok: false, reason: "That lookup failed on our end." };
  }
}

/** Function-calling definitions — shared by our own brain and by Retell. */
export const TOOL_SCHEMAS = [
  {
    name: "find_cake",
    description:
      "Look up what the bakery sells. Call this before describing or recommending anything. Pass the guest count when known and it returns the right size and its exact price.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "What the caller asked for, in their words." },
        guests: { type: "number", description: "Number of people to feed, if mentioned." },
      },
    },
  },
  {
    name: "price_cake",
    description:
      "Price the cake being discussed. THE ONLY SOURCE OF PRICES — never state a price that did not come from this call. Choices are the caller's words, e.g. ['chocolate', '24 servings'].",
    parameters: {
      type: "object",
      properties: {
        product: { type: "string", description: "Which item; omit to keep the current one." },
        choices: {
          type: "array",
          items: { type: "string" },
          description: "Flavour, size, filling, design or topping as the caller said them.",
        },
        cake_text: { type: "string", description: "Message to pipe on the cake." },
        qty: { type: "number" },
      },
    },
  },
  {
    name: "check_date",
    description:
      "Check whether a pickup day works, given lead time and closing days. THE ONLY SOURCE OF DATES — never claim a day is available without calling this. Pass the caller's words, e.g. 'next Saturday'.",
    parameters: {
      type: "object",
      properties: {
        when: { type: "string", description: "The day as the caller said it." },
        product: { type: "string", description: "Item, if different from the current one." },
      },
      required: ["when"],
    },
  },
  {
    name: "book_order",
    description:
      "Place the order. Only after the caller has confirmed a read-back of the cake, the price, and the pickup day and time.",
    parameters: {
      type: "object",
      properties: {
        pickup_time: { type: "string", description: "Pickup window the caller picked." },
        customer_name: { type: "string" },
        note: { type: "string", description: "Anything the baker needs to know." },
      },
    },
  },
  {
    name: "find_designs",
    description:
      "For CUSTOM cakes, when the caller describes a look, a theme or an occasion rather than naming a menu item — and especially when they are not sure what they want. Retrieves cakes the bakery has actually made, texts the caller a numbered link to the photos, and returns short descriptions to read aloud. Use this early; it is far faster than asking twenty questions.",
    parameters: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "What they described, in their words — theme, colours, style.",
        },
        occasion: { type: "string", description: "birthday, wedding, christening, and so on." },
        guests: { type: "number", description: "How many people it needs to feed." },
        budget: { type: "number", description: "Budget in whole dollars, if they gave one." },
      },
    },
  },
  {
    name: "pick_design",
    description:
      "The caller chose one of the numbered designs. Prices it from comparable past cakes. If it comes back priceKnown false, do not quote a price — say the head baker will confirm it.",
    parameters: {
      type: "object",
      properties: {
        number: { type: "number", description: "The option number they said." },
        changes: { type: "string", description: "Any tweak they asked for, e.g. 'in pastels'." },
        guests: { type: "number" },
      },
      required: ["number"],
    },
  },
  {
    name: "escalate",
    description:
      "Hand off to a human and stop trying to solve it. Required for: allergy or ingredient-safety questions, weddings and large catering, complaints about an existing order, or any request for a person.",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string" },
        note: { type: "string", description: "What the human needs to know." },
      },
      required: ["reason"],
    },
  },
] as const;
