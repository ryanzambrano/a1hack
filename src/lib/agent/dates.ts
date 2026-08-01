/**
 * Calendar arithmetic for the phone agent.
 *
 * The LLM never does date math. It extracts the caller's words ("next
 * Saturday", "the 15th") and this module turns them into a real ISO date,
 * which is then checked against the bakery's lead time and closed days. A
 * model that guesses "August 15th is a Saturday" will eventually be wrong on
 * a live call; `weekdayOf` never is.
 *
 * Dates are civil dates (no time, no zone) held as "YYYY-MM-DD". Arithmetic
 * anchors on UTC so a daylight-saving boundary can never shift a day.
 */

/** The bakery's wall clock. The server's own clock is usually UTC. */
export const BAKERY_TZ = "America/Chicago";

const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
];

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/* ------------------------------ civil dates ------------------------------ */

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function toUtc(iso: string): number {
  const [y, m, d] = parts(iso);
  return Date.UTC(y, m - 1, d);
}

export function addDays(iso: string, days: number): string {
  return fromUtc(toUtc(iso) + days * 86_400_000);
}

/** JS convention: 0 = Sunday. */
export function weekdayOf(iso: string): number {
  return new Date(toUtc(iso)).getUTCDay();
}

export function isValidIso(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = parts(iso);
  // Rejects 2026-02-30, which Date would silently roll into March.
  return m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

/* ------------------------------ zoned "now" ------------------------------ */

function zoned(now: Date, tz: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, ...options }).format(now);
}

/** Today's civil date at the bakery, regardless of where the server runs. */
export function todayInZone(tz = BAKERY_TZ, now = new Date()): string {
  return zoned(now, tz, { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** Hour of the bakery's wall clock, 0-23 — the order cutoff compares to this. */
export function hourInZone(tz = BAKERY_TZ, now = new Date()): number {
  return Number(zoned(now, tz, { hour: "2-digit", hour12: false }));
}

/* --------------------------- phrase resolution --------------------------- */

function nextWeekday(today: string, target: number, atLeastNextWeek: boolean): string {
  const delta = (target - weekdayOf(today) + 7) % 7;
  // 0 would mean "today"; callers naming a weekday always mean a future one.
  const ahead = delta === 0 ? 7 : delta;
  return addDays(today, atLeastNextWeek && ahead < 7 ? ahead + 7 : ahead);
}

function onOrAfter(today: string, month: number, day: number): string | null {
  const [thisYear] = parts(today);
  for (const year of [thisYear, thisYear + 1]) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (isValidIso(iso) && iso >= today) return iso;
  }
  return null;
}

/**
 * Turn what the caller said into a real date, or null if it cannot be pinned
 * down — in which case the agent must ask again rather than guess.
 */
export function resolveDatePhrase(phrase: string, today: string): string | null {
  const raw = (phrase ?? "").trim().toLowerCase();
  if (!raw) return null;

  // The model sometimes already resolves it; trust only a well-formed date.
  const isoMatch = /\b(\d{4}-\d{2}-\d{2})\b/.exec(raw);
  if (isoMatch) return isValidIso(isoMatch[1]) ? isoMatch[1] : null;

  const text = raw.replace(/[.,!?]/g, " ").replace(/\s+/g, " ").trim();

  if (/\btoday\b|\bthis afternoon\b|\btonight\b/.test(text)) return today;
  if (/\btomorrow\b/.test(text)) return addDays(today, /\bday after\b/.test(text) ? 2 : 1);

  const inDays = /\bin (\d+) days?\b/.exec(text);
  if (inDays) return addDays(today, Number(inDays[1]));

  const inWeeks = /\bin (\d+) weeks?\b|\b(a|one) week from\b/.exec(text);
  if (inWeeks) return addDays(today, 7 * Number(inWeeks[1] ?? 1));

  // "August 15th" / "15th of August" / "aug 15"
  const monthIndex = MONTHS.findIndex((m) =>
    new RegExp(`\\b${m.slice(0, 3)}[a-z]*\\b`).test(text)
  );
  if (monthIndex >= 0) {
    const day = /\b(\d{1,2})(?:st|nd|rd|th)?\b/.exec(text);
    if (day) return onOrAfter(today, monthIndex + 1, Number(day[1]));
  }

  // "next Saturday" reads as the Saturday of the following week; a bare
  // "Saturday" is the upcoming one.
  const weekday = WEEKDAYS.findIndex((d) => new RegExp(`\\b${d}\\b`).test(text));
  if (weekday >= 0) return nextWeekday(today, weekday, /\bnext\b/.test(text));

  // A bare ordinal: "the 15th" — this month if it is still ahead, else next.
  const bare = /\bthe (\d{1,2})(?:st|nd|rd|th)\b|\b(\d{1,2})(?:st|nd|rd|th)\b/.exec(text);
  if (bare) {
    const day = Number(bare[1] ?? bare[2]);
    const [y, m] = parts(today);
    const thisMonth = `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (isValidIso(thisMonth) && thisMonth >= today) return thisMonth;
    return onOrAfter(addDays(`${y}-${String(m).padStart(2, "0")}-01`, 32), m === 12 ? 1 : m + 1, day);
  }

  return null;
}

/* -------------------------------- speaking ------------------------------- */

function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

/** "Saturday, August 15th" — how a person would say it out loud. */
export function speakDate(iso: string): string {
  const [, m, d] = parts(iso);
  const weekday = WEEKDAYS[weekdayOf(iso)];
  const month = MONTHS[m - 1];
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  return `${cap(weekday)}, ${cap(month)} ${ordinal(d)}`;
}

/** "10 to 11 in the morning" reads better aloud than "10:00-11:00". */
export function speakSlot(slot: string): string {
  const m = /^(\d{2}):00-(\d{2}):00$/.exec(slot);
  if (!m) return slot;
  const from = Number(m[1]);
  const to = Number(m[2]);
  const hour12 = (h: number) => (h % 12 === 0 ? 12 : h % 12);
  const period = from < 12 ? "in the morning" : from < 17 ? "in the afternoon" : "in the evening";
  return `${hour12(from)} to ${hour12(to)} ${period}`;
}
