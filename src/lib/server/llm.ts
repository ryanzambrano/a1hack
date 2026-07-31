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

export async function agentTurn(
  bakery: Bakery | null,
  messages: ChatMessage[]
): Promise<AgentTurn> {
  const res = await fetch(`${process.env.A1_GATEWAY_BASE}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.A1_GATEWAY_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.A1_MODEL || "openai.gpt-5.6-luna",
      input: [
        { role: "system", content: systemPrompt(bakery) },
        ...messages,
      ],
      max_output_tokens: 4000,
    }),
  });

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
