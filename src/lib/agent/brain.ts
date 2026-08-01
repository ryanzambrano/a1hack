/**
 * One turn of a phone call.
 *
 * The brain decides what to say; it never decides what is true. Prices,
 * dates and availability arrive from `tools.ts`, the safety rules run in
 * `policy.ts` before the model is consulted, and everything the model
 * produces is sanitised before it reaches a speaker.
 *
 * The model call is injectable so the golden-scenario harness can drive whole
 * conversations deterministically, without a gateway key and without paying
 * for tokens.
 */

import type { Shop } from "@/lib/server/catalog";
import { type ChatMessage, complete } from "@/lib/server/llm";
import { BAKERY_TZ, speakDate, todayInZone } from "./dates";
import { MAX_MISSES, guard, mandatoryEscalation, unbackedPrices } from "./policy";
import { sanitizeForSpeech, speakMoney } from "./speech";
import { type ToolContext, type ToolName, type ToolResult, isToolName, runTool } from "./tools";

export type CompleteFn = (messages: ChatMessage[]) => Promise<string>;

export interface BrainInput {
  /** What the caller just said. Empty means speech did not come through. */
  utterance: string;
  /** Real spoken lines only — tool chatter is never persisted. */
  history: ChatMessage[];
  ctx: ToolContext;
  shop: Shop;
  complete?: CompleteFn;
  now?: Date;
}

export interface TurnLog {
  name: ToolName;
  args: Record<string, unknown>;
  result: ToolResult;
}

export interface BrainTurn {
  say: string;
  done: boolean;
  handoff: boolean;
  toolCalls: TurnLog[];
}

/** Two rounds is enough to look something up and answer; more is dead air. */
const MAX_TOOL_ROUNDS = 2;

const FALLBACK_SAY = "Sorry, could you say that again?";

/* -------------------------------- prompting ------------------------------- */

function knownSoFar(ctx: ToolContext): string {
  const d = ctx.state.draft;
  const lines: string[] = [];
  if (d.customerName) lines.push(`Caller's name: ${d.customerName}`);
  if (d.occasion) lines.push(`Occasion: ${d.occasion}`);
  if (d.guests) lines.push(`Guests: ${d.guests}`);
  if (d.productName) {
    const options = Object.entries(d.selections)
      .map(([g, v]) => `${g}: ${v}`)
      .join(", ");
    lines.push(`Cake: ${d.productName}${options ? ` (${options})` : ""}`);
  }
  if (d.qty > 1) lines.push(`Quantity: ${d.qty}`);
  if (d.cakeText) lines.push(`Writing on the cake: "${d.cakeText}"`);
  if (d.pickupDate) lines.push(`Pickup day: ${speakDate(d.pickupDate)}`);
  if (d.pickupSlot) lines.push(`Pickup window: ${d.pickupSlot}`);
  if (ctx.state.quotedCents !== null) {
    lines.push(`Price quoted by a tool: ${speakMoney(ctx.state.quotedCents)}`);
  }
  if (ctx.state.proposalCode) {
    lines.push("Design photos have been texted to them, numbered.");
  }
  if (ctx.state.chosenDesign) {
    const d = ctx.state.chosenDesign;
    lines.push(
      d.needsKitchenReview
        ? `Chose design ${d.position} (${d.title}) — price NOT known, the baker must confirm it`
        : `Chose design ${d.position} (${d.title}), ${speakMoney(d.lowCents)} to ${speakMoney(d.highCents)}`
    );
  }
  if (ctx.state.booked) lines.push(`ALREADY BOOKED: ${ctx.state.booked.orderNumber}`);
  return lines.length ? lines.join("\n") : "Nothing yet.";
}

function systemPrompt(shop: Shop, ctx: ToolContext, now: Date): string {
  const today = todayInZone(BAKERY_TZ, now);
  return `You are the phone agent for ${shop.name}, a bakery at ${shop.address}. You answer the order line and take cake orders from start to finish.

Today is ${speakDate(today)}. Opening hours: ${shop.hours}.

HOW YOU SPEAK
You are on a live phone call and your words are read aloud by a synthetic voice.
- One or two short sentences, then stop. Ask exactly ONE question at a time.
- Never use emoji, markdown, asterisks, bullet points or numbered lists.
- Sound like a friendly person at a bakery counter, not a form.
- Never re-ask something you already know. What you know is listed below.
- Speech-to-text garbles names and numbers, so prefer closed questions
  ("Chocolate or vanilla?") over open ones where you reasonably can.

TWO KINDS OF CALL, AND THEY GO DIFFERENTLY
Menu orders — they name something the bakery sells. Use find_cake,
price_cake, check_date, then book_order, and finish it on the call.

Custom cakes — they describe a look, a theme or an occasion, or they simply
are not sure what they want. Reach for find_designs EARLY. It texts them
photos of cakes this bakery has really made, numbered, while you are still
talking, then you ask which number is closest. Four real cakes settles a
conversation that twenty questions will not. Then pick_design prices it from
similar past work.

Custom cakes are NOT booked on the call. You agree the design, the price
range and the day, and tell them the bakery will send the final quote.

WHAT YOU MAY STATE AS FACT
Prices, dates, availability and the menu come ONLY from tool results.
- Quote the exact price string a tool returned. Never add up, estimate,
  round or discount anything yourself.
- For a custom cake, give the RANGE pick_design returned and say the final
  figure depends on the details. If it says priceKnown is false, give no
  price at all — say the head baker will confirm it and carry on.
- Never say a day works until check_date has returned ok for that day.
- If a choice is not in a tool result, it is not on the menu. Offer what is.
- If you do not know something, look it up or ask. Never guess.

WRITING ON THE CAKE
If they want a message piped on the cake, read the spelling back to them
before booking. Wrong writing means a wasted cake and a lost customer.

HOW A CALL USUALLY GOES
Find out what they are celebrating and roughly how many people, help them
pick a cake and its options, agree a pickup day and time window, read the
whole order back with the price, get a clear yes, then book it and read the
order number back.

WHAT YOU ALREADY KNOW
${knownSoFar(ctx)}

HOW YOU REPLY
Reply with exactly ONE JSON object and nothing else. No prose, no code fence.
To speak:                 {"say": "your words", "done": false}
To speak and end a call:  {"say": "your words", "done": true}
To use tools first:       {"tools": [{"name": "check_date", "args": {"when": "next Saturday"}}]}
You may request several tools at once. Results come back as messages
beginning with [tool result]; those are system observations, never the
caller. After results arrive, reply again with your spoken line.
Set done true only after an order is booked and read back, or when there is
genuinely nothing left to do.`;
}

/* --------------------------------- parsing -------------------------------- */

interface ModelReply {
  say?: string;
  done?: boolean;
  tools?: Array<{ name?: string; args?: Record<string, unknown> }>;
}

function parseReply(raw: string): ModelReply | null {
  const text = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as ModelReply;
  } catch {
    return null;
  }
}

/**
 * When the model returns something unparseable, the caller must never hear
 * it. Raw model text is only safe to speak if it looks like a sentence
 * rather than a half-finished JSON object.
 */
function salvage(raw: string): string {
  const text = sanitizeForSpeech(raw);
  const looksStructural = /[{}[\]]|"\s*:/.test(text) || /^\s*(say|tools|done)\b/i.test(text);
  return !text || looksStructural ? FALLBACK_SAY : text;
}

/* ---------------------------------- turn ---------------------------------- */

/** The greeting. Fixed text, so the phone is answered with zero model latency. */
export function openingLine(shop: Shop): string {
  return `Thanks for calling ${shop.name}, this is the order line. What can I get baked for you?`;
}

export async function runTurn(input: BrainInput): Promise<BrainTurn> {
  const { ctx, shop } = input;
  const now = input.now ?? new Date();
  const say = input.complete ?? ((m: ChatMessage[]) => complete(m, { maxTokens: 300 }));
  const toolCalls: TurnLog[] = [];

  const finish = (text: string, done: boolean, handoff: boolean): BrainTurn => {
    ctx.state.turns += 1;
    return { say: sanitizeForSpeech(text), done, handoff, toolCalls };
  };

  // Nothing came through. Three of these in a row and a human takes over.
  if (!input.utterance.trim()) {
    ctx.state.misses += 1;
    const stop = guard(ctx.state, now.getTime());
    if (stop) {
      await runTool("escalate", { reason: "speech not coming through" }, ctx);
      return finish(stop.say, true, true);
    }
    const nudge =
      ctx.state.misses >= MAX_MISSES - 1
        ? "I still didn't catch that. Could you say it once more?"
        : "Sorry, I didn't catch that. Could you say that again?";
    return finish(nudge, false, false);
  }
  ctx.state.misses = 0;

  const stop = guard(ctx.state, now.getTime());
  if (stop) {
    await runTool("escalate", { reason: "call limit reached" }, ctx);
    return finish(stop.say, true, true);
  }

  // Safety rules are decided on the caller's own words, before the model is
  // involved at all, so no phrasing can talk the agent past them.
  const forced = mandatoryEscalation(input.utterance);
  if (forced) {
    const result = await runTool(
      "escalate",
      { reason: forced.reason, note: `Caller said: "${input.utterance.slice(0, 200)}"` },
      ctx
    );
    toolCalls.push({ name: "escalate", args: { reason: forced.reason }, result });
    return finish(forced.say, true, true);
  }

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(shop, ctx, now) },
    ...input.history,
    { role: "user", content: input.utterance },
  ];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    let raw: string;
    try {
      raw = await say(messages);
    } catch (err) {
      console.error("model call failed", err);
      return finish(
        "Sorry, I'm having trouble on my end. Could you say that once more?",
        false,
        false
      );
    }

    const reply = parseReply(raw);
    if (!reply) return finish(salvage(raw), false, false);

    const requested = (reply.tools ?? []).filter((t) => t.name && isToolName(t.name));
    const outOfRounds = round === MAX_TOOL_ROUNDS;

    if (requested.length && !outOfRounds) {
      messages.push({ role: "assistant", content: JSON.stringify(reply) });
      for (const call of requested) {
        const name = call.name as ToolName;
        const args = call.args ?? {};
        const result = await runTool(name, args, ctx);
        toolCalls.push({ name, args, result });
        messages.push({
          role: "user",
          content: `[tool result] ${name} -> ${JSON.stringify(result)}`,
        });
      }
      continue;
    }

    if (reply.say) {
      // The last line of defence on the invariant. This should never fire —
      // if it does, the prompt has drifted and we say nothing rather than
      // quote a number the bakery never agreed to.
      const invented = unbackedPrices(reply.say, ctx.state);
      if (invented.length) {
        console.error("price invariant violated", { say: reply.say, invented });
        return finish(
          "Let me just double-check that price for you. Can you confirm the size you wanted?",
          false,
          false
        );
      }
      return finish(reply.say, Boolean(reply.done), false);
    }

    if (outOfRounds) {
      messages.push({
        role: "user",
        content: "[tool result] no more tools available — reply now with your spoken line only.",
      });
    }
  }

  return finish(FALLBACK_SAY, false, false);
}
