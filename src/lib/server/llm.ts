import type { Bakery, CakeOrder } from "../types";
import type { ChatMessage } from "./db";

export interface AgentTurn {
  say: string;
  done: boolean;
  customerName?: string;
  order?: CakeOrder;
}

function systemPrompt(bakery: Bakery | null): string {
  const name = bakery?.name ?? "the bakery";
  const cakes = bakery?.cakeTypes.join(", ") ?? "custom cakes";
  const price = bakery ? `$${bakery.priceMin}–$${bakery.priceMax}` : "varies";
  const fulfillment = bakery?.fulfillment.join(" and ") ?? "pickup and delivery";
  return `You are a warm, efficient AI phone agent for ${name}, answering their cake-request line. The caller responded to a Meta ad about custom cakes. You are on a live phone call — speech-to-text may garble words, so keep every reply SHORT (one or two sentences), conversational, and ask exactly ONE question at a time. Never use emojis, markdown, or lists: your words are spoken aloud.

Bakery facts you may share: cake types: ${cakes}. Typical price range: ${price}. Fulfillment options: ${fulfillment}.

Collect, in a natural order:
1. Caller's first name
2. Event type (birthday, wedding, etc.)
3. Event date
4. Number of guests
5. Cake size (suggest one from the guest count if they are unsure)
6. Flavor
7. Design or theme
8. Dietary requirements
9. Pickup or delivery
10. Budget range
11. Preferred callback time for the bakery to follow up with a quote

When everything is collected, read back a one-sentence summary, ask if it is correct. Once the caller confirms, thank them, say ${name} will call back at the agreed time, and end.

Respond ONLY with strict JSON, no code fences:
{"say": "<what to speak next>", "done": false}
When the caller has CONFIRMED the summary, respond with:
{"say": "<closing words>", "done": true, "customerName": "<name>", "order": {"eventType": "...", "eventDate": "...", "guests": <number>, "size": "...", "flavor": "...", "design": "...", "dietary": "...", "fulfillment": "Pickup or Delivery", "budget": "...", "callbackTime": "..."}}
Use "Not specified" for anything the caller declined to give.`;
}

function extractText(data: unknown): string {
  const output = (data as { output?: Array<{ type: string; content?: Array<{ type: string; text?: string }> }> }).output;
  if (!Array.isArray(output)) return "";
  return output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((c) => c.type === "output_text")
    .map((c) => c.text ?? "")
    .join("");
}

function parseTurn(raw: string): AgentTurn {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as AgentTurn;
    if (typeof parsed.say === "string") {
      return { ...parsed, done: Boolean(parsed.done) };
    }
  } catch {
    /* fall through to speaking the raw text */
  }
  return { say: cleaned || "Sorry, could you say that again?", done: false };
}

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
        model: process.env.A1_MODEL || "openai.gpt-5.6-terra",
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_output_tokens: 4000,
      }),
      signal: AbortSignal.timeout(20_000),
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

export interface ExtractedOrder {
  customerName: string | null;
  order: CakeOrder | null;
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

export async function agentTurn(
  bakery: Bakery | null,
  messages: ChatMessage[]
): Promise<AgentTurn> {
  let res: Response;
  try {
    res = await fetch(`${process.env.A1_GATEWAY_BASE}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.A1_GATEWAY_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.A1_MODEL || "openai.gpt-5.6-terra",
        input: [
          { role: "system", content: systemPrompt(bakery) },
          ...messages,
        ],
        max_output_tokens: 4000,
      }),
      // The gateway sometimes hangs indefinitely (luna/sol outage July 31) —
      // a caller hearing 12s of silence is better than a 60s function timeout.
      signal: AbortSignal.timeout(12_000),
    });
  } catch (err) {
    console.error("gateway unreachable", err);
    return {
      say: "Sorry, I'm having trouble hearing you — could you say that once more?",
      done: false,
    };
  }

  if (!res.ok) {
    const body = await res.text();
    console.error("gateway error", res.status, body.slice(0, 500));
    return {
      say: "I'm having a little trouble on my end. Could you repeat that?",
      done: false,
    };
  }

  return parseTurn(extractText(await res.json()));
}
