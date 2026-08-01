/**
 * Vision captioning for archive imports.
 *
 * Same prompt and model as `scripts/ingest-archive.mjs`, so a cake imported
 * from the browser and one imported from the CLI get interchangeable captions
 * — the pricing comparables must not be able to tell which door a photo came
 * in through. The A1 gateway can't do this: it rejects image input (verified),
 * so captioning goes straight to the Anthropic API.
 */

import Anthropic from "@anthropic-ai/sdk";

export function captionConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const SCHEMA_INSTRUCTION = `You are cataloguing a bakery's photographs of cakes they have made, so the bakery can find past work by description and quote similar cakes.

Reply with ONE JSON object and nothing else:
{
  "title": "short human label, e.g. 'Minnie Mouse sheet cake, pastel buttercream'",
  "spoken_description": "one sentence, written to be READ ALOUD on a phone call, describing the look. No measurements, no price.",
  "themes": ["lowercase nouns for what it depicts: minnie mouse, unicorn, dinosaur, football, rainbow, floral, number, ..."],
  "colors": ["lowercase colour words clearly visible on the cake"],
  "coating": "fondant | buttercream | whipped cream",
  "decorations": ["piping, drip, sculpted, hand-painted, fresh flowers, gold leaf, edible print, character topper"],
  "shape": "round | rectangular | sheet | novelty",
  "tiers": <integer, stacked tiers; a flat sheet cake is 1>,
  "occasion": ["birthday, christening, communion, graduation, baby shower, wedding"],
  "has_name_text": <true if a person's name or a message is written on the cake>,
  "complexity": <1-5, how much skilled decorating time this took>
}

Rules:
- Describe only what is visible. Never invent a flavour: you cannot see the inside.
- Do NOT estimate price or servings. Those are recorded separately by the bakery.
- Exactly one coating. Smooth matte covering is usually fondant; piped swirls and rosettes are buttercream.
- Empty array is fine when nothing applies.`;

export interface CakeCaption {
  title?: unknown;
  spoken_description?: unknown;
  themes?: unknown;
  colors?: unknown;
  coating?: unknown;
  decorations?: unknown;
  shape?: unknown;
  tiers?: unknown;
  occasion?: unknown;
  has_name_text?: unknown;
}

let client: Anthropic | null = null;

export async function captionCake(jpegBase64: string): Promise<CakeCaption> {
  client ??= new Anthropic();
  const response = await client.messages.create(
    {
      model: process.env.VISION_MODEL || "claude-sonnet-5",
      max_tokens: 700,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/jpeg",
                data: jpegBase64,
              },
            },
            { type: "text", text: SCHEMA_INSTRUCTION },
          ],
        },
      ],
    },
    { timeout: 90_000 }
  );

  if (response.stop_reason === "refusal") {
    throw new Error("vision model declined to caption this image");
  }
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("vision returned no JSON");
  return JSON.parse(text.slice(start, end + 1)) as CakeCaption;
}
