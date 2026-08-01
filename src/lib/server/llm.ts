/**
 * Transport to the A1 LLM gateway.
 *
 * Nothing about the bakery lives here. The phone agent's reasoning is in
 * `src/lib/agent/brain.ts`; this file only knows how to turn messages into
 * text, plus a few one-shot JSON helpers for work that happens off the call.
 */

import type { Bakery } from "../types";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompleteOptions {
  /**
   * Kept deliberately small. This runs between a caller finishing a sentence
   * and hearing a reply, and a long budget on a reasoning model is dead air.
   */
  maxTokens?: number;
  signal?: AbortSignal;
}

/** luna and sol went down on 31 July; terra is the one that stayed up. */
const DEFAULT_MODEL = "openai.gpt-5.6-terra";

/**
 * The gateway sometimes hangs indefinitely rather than erroring. A caller
 * hearing twelve seconds of silence is bad; hearing sixty is a lost customer
 * and a burnt function timeout.
 */
const LIVE_CALL_TIMEOUT_MS = 12_000;
const BACKGROUND_TIMEOUT_MS = 20_000;

export function gatewayConfigured(): boolean {
  return Boolean(process.env.A1_GATEWAY_BASE && process.env.A1_GATEWAY_KEY);
}

function extractText(data: unknown): string {
  const output = (
    data as {
      output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }>;
    }
  ).output;
  if (!Array.isArray(output)) return "";
  return output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");
}

/* ------------------------------ live calls -------------------------------- */

export async function complete(
  messages: ChatMessage[],
  { maxTokens = 300, signal }: CompleteOptions = {}
): Promise<string> {
  const base = process.env.A1_GATEWAY_BASE;
  const key = process.env.A1_GATEWAY_KEY;
  // `||` not `??`: an unset key in .env.local arrives as "", not undefined,
  // and "" would otherwise be joined into a URL that cannot be parsed.
  if (!base || !key) {
    throw new Error("A1_GATEWAY_BASE and A1_GATEWAY_KEY must be set in .env.local");
  }

  const res = await fetch(`${base.replace(/\/$/, "")}/responses`, {
    method: "POST",
    signal: signal ?? AbortSignal.timeout(LIVE_CALL_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.A1_MODEL || DEFAULT_MODEL,
      input: messages,
      max_output_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    throw new Error(`gateway ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return extractText(await res.json());
}

/* ---------------------------- off-call helpers ---------------------------- */

/** One-shot JSON completion against the gateway. Returns null on any failure. */
async function gatewayJson<T>(system: string, user: string): Promise<T | null> {
  try {
    const res = await fetch(`${process.env.A1_GATEWAY_BASE}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.A1_GATEWAY_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.A1_MODEL || DEFAULT_MODEL,
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_output_tokens: 4000,
      }),
      signal: AbortSignal.timeout(BACKGROUND_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("gateway error", res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const raw = extractText(await res.json());
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch (err) {
    console.error("gatewayJson failed", err);
    return null;
  }
}

export interface CampaignCopy {
  headline: string;
  body: string;
  cta: string;
  audience: string;
}

/** Writes real ad copy for the bakery's lead campaign. */
export async function generateCampaignCopy(
  bakery: Bakery
): Promise<CampaignCopy | null> {
  return gatewayJson<CampaignCopy>(
    `You write high-converting Meta lead-ad copy for local businesses. Respond ONLY with strict JSON: {"headline": "...", "body": "...", "cta": "...", "audience": "..."}. headline: under 60 chars, may include one emoji. body: 2 sentences, mention concrete offerings and starting price, end with a reason to submit the lead form now. cta: 2-4 words. audience: one line of targeting (radius around the city, age range, 4-6 interests).`,
    `Bakery: ${bakery.name} in ${bakery.location}. Cakes: ${bakery.cakeTypes.join(", ")}. Prices $${bakery.priceMin}–$${bakery.priceMax}. Fulfillment: ${bakery.fulfillment.join(", ")}. Hours: ${bakery.hours}.`
  );
}

/** Invents a plausible lead persona for the simulate button. */
export async function generateLeadPersona(): Promise<{ name: string } | null> {
  return gatewayJson<{ name: string }>(
    `Respond ONLY with strict JSON: {"name": "<a realistic, culturally diverse full name — vary it each time>"}.`,
    `Invent one plausible customer name for a bakery lead. Seed: ${Math.random().toString(36).slice(2)}`
  );
}

/**
 * The loose shape the extraction prompt returns.
 *
 * This is deliberately not the agent's own order model. A transcript from a
 * call the agent did not run — a Retell call, say — has to be mapped into
 * `CallState` before it is stored, so the dashboard shows one shape no matter
 * which transport took the call. See `stateFromExtractedOrder`.
 */
export interface ExtractedCake {
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
}

export interface ExtractedOrder {
  customerName: string | null;
  order: ExtractedCake | null;
  outcome: string;
  nextAction: string | null;
  qualified: boolean;
}

/** Structures a finished call transcript into a cake order + outcome. */
export async function extractOrderFromTranscript(
  bakery: Bakery | null,
  transcript: string
): Promise<ExtractedOrder | null> {
  return gatewayJson<ExtractedOrder>(
    `You analyze finished phone-call transcripts for ${bakery?.name ?? "a bakery"}'s cake-order line. Respond ONLY with strict JSON: {"customerName": <string or null>, "qualified": <true if the caller gave enough detail to quote>, "order": <null, or {"eventType","eventDate","guests","size","flavor","design","dietary","fulfillment","budget","callbackTime"} — use "Not specified" for gaps, guests is a number>, "outcome": "<one sentence: what happened on the call>", "nextAction": <string or null: the single best follow-up for the bakery>}`,
    `Transcript:\n${transcript.slice(0, 12_000)}`
  );
}
