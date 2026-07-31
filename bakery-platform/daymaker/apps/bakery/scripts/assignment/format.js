// Extracted from bakery-assignment.js — format cluster.
// All sibling imports share one ?v= pin; bump them in lockstep
// (they must resolve to the same module instances).


// ─── Formatters ─────────────────────────────────────────────

// Every date on this page is English-only (the app is English everywhere), so
// pin the formatter to en-US instead of the viewer's locale - otherwise a
// Norwegian browser renders weekdays/months in Norwegian ("mandag 22. juni").
//
// ONE date format for the whole page: "Thursday, July 30". It used to mix a
// long weekday with a short month and an always-on year ("Thursday, Jul 30,
// 2026"), which read like three formats spliced together and buried the part
// a baker actually plans around - the weekday. The year only earns its place
// when the date is not in the current year.
function fmtScheduledDate(ymd) {
  if (!ymd) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd));
  if (!m) return String(ymd);
  const dt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(dt.getTime())) return String(ymd);
  const thisYear = dt.getFullYear() === new Date().getFullYear();
  return dt.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(thisYear ? {} : { year: "numeric" }),
  });
}

// Diary timestamps, English-only (pinned to en-US, same reason as
// fmtScheduledDate). Local copy of the shared fmtDateTime, which follows the
// viewer's locale and so would render Norwegian on a Norwegian browser.
function fmtEventTime(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  // hour: "numeric", not "2-digit" - en-US doesn't zero-pad a 12-hour clock,
  // so "06:55 AM" was a format nobody writes.
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Strip a phone number down to a dialable tel: href (digits + leading +).
function telHref(phone) {
  return String(phone || "").replace(/[^\d+]/g, "");
}

// "You invoice us" is a number the bakery copies onto an invoice, so it
// keeps its cents when it has any, and en-US keeps the currency explicit
// ("CA$72" reads as Canadian dollars; a locale-formatted "$72" does not).
function fmtMoney(cents, currency) {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
      // Both bounds move together, or £157.50 renders as "£157.5" - an
      // invoice line missing a digit.
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency || "USD"} ${amount.toFixed(2)}`;
  }
}
export {
  fmtEventTime,
  fmtMoney,
  fmtScheduledDate,
  telHref,
};
