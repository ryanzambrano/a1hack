/**
 * Turning values into words. Everything the agent says passes through here,
 * because a phone call has no screen: "$140.00" and "10:00-11:00" are fine to
 * look at and wrong to hear.
 */

/** "$140" / "$52.50" — read aloud correctly by every TTS voice we use. */
export function speakMoney(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/** "a, b and c" — no Oxford comma, which TTS reads as an extra pause. */
export function speakList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * An order number has to survive being said once and written down. "B-1042"
 * becomes "B, 1 0 4 2" so digits land separately instead of as "one thousand
 * and forty-two".
 */
export function speakOrderNumber(orderNumber: string): string {
  const [prefix, digits] = orderNumber.split("-");
  if (!digits) return orderNumber;
  return `${prefix}, ${digits.split("").join(" ")}`;
}

const EMOJI =
  /[\u{1F300}-\u{1FAFF}\u{1F000}-\u{1F2FF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}]/gu;

/**
 * Last line of defence before audio. The model is told not to emit markdown
 * or emoji; when it does anyway, the caller must not hear "star star".
 */
export function sanitizeForSpeech(text: string): string {
  return text
    .replace(EMOJI, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[*_`#>|]/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
