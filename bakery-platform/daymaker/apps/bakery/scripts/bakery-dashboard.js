import { authedFetch, escape } from "/scripts/api.js";
import {
  chip,
  money,
  sourceChip,
  statusChip,
} from "/apps/bakery/scripts/bakery-ui.js?v=20260727payoutcur";
// Cocola-only VC queue. Loaded eagerly because the module's side-effects
// are lazy — startVcQueue() is only called when bakery.is_vc_bakery=true.
import { startVcQueue, stopVcQueue } from "/apps/bakery/scripts/bakery-vc-queue.js?v=20260729unified2";
// Persistent customer-messages button. On the queue it lists every order
// with an unanswered question; the chat itself lives on the order page.
import {
  mountChatDock,
  setChatDockThreads,
} from "/apps/bakery/scripts/bakery-chat-dock.js?v=20260729unified2";

// When admin uses ?as=<bakery_id>, every API call this dashboard makes is
// rewritten to forward that query string so the backend scopes responses to
// the impersonated bakery instead of the admin's own linked one.
const adminAsId = new URLSearchParams(window.location.search).get("as") || null;
function withAs(url) {
  if (!adminAsId) return url;
  const u = new URL(url, window.location.origin);
  if (!u.searchParams.has("as")) u.searchParams.set("as", adminAsId);
  return u.pathname + u.search;
}

/** Statuses that still represent work the bakery hasn't finished. */
const OPEN_STATUSES = ["pending", "accepted", "in_production", "ready", "in_transit"];

(() => {
  const state = {
    me: null,
    assignments: [],
    // Opens on "Assignments" rather than "All": the reason to open this page
    // is the work still on your plate, not the archive of delivered cakes.
    filter: "open",
    query: "",
    pollTimer: null,
    pollMs: 20000,
    lastSyncAt: null,
    /** Payouts, newest first with the open period first. Drives the money KPI. */
    payouts: [],
    payoutSettings: null,
    /** Cocola's open VC orders, kept current by the VC queue's own poll. */
    vcPending: 0,
  };

  document.addEventListener("clerk:loaded", init);
  // Belt-and-suspenders: if the clerk-loaded event already fired before
  // this module's listener got registered (a module ordering race we
  // tripped during development), kick init directly.
  if (document.body.classList.contains("clerk-loaded")) {
    queueMicrotask(() => init());
  }

  async function init() {
    if (!window.bakeryPlatformAuth.isSignedIn()) {
      document.getElementById("auth-gate").hidden = false;
      return;
    }
    document.getElementById("auth-gate").hidden = true;

    if (adminAsId) {
      const banner = document.getElementById("admin-shadow-banner");
      if (banner) banner.hidden = false;
    }

    await loadAndRender();

    wireFilters();
    wireSearch();
    wireRetry();
    wireProfileNudgeDismiss();
    mountChatDock({ asId: adminAsId });
    setChatDockThreads(state.assignments);
    document.addEventListener("visibilitychange", onVisibility);
    schedulePoll();
  }

  async function loadAndRender() {
    hideError();
    try {
      const me = await authedFetch(withAs("/api/v1/bakery/me"));
      state.me = me;

      // Platform admins (@daymaker.com etc.) have no own-bakery binding —
      // they shadow into a bakery via ?as=. If they land on /bakery
      // without ?as=, send them to the admin bakeries list.
      if (!me.bakery && me.user?.role === "platform_admin") {
        // ...but an admin who DID name a bakery gets told why it didn't
        // open. Redirecting them lands back on the list they clicked from,
        // which is indistinguishable from the button doing nothing.
        if (adminAsId) {
          showError(
            "Couldn't open that bakery. It may have been removed, or the link is out of date.",
          );
          return;
        }
        window.location.replace("/admin-bakeries");
        return;
      }

      if (!me.bakery) {
        renderNoAccess({
          title: "Apply to become a bakery",
          body: "Your account is signed in but isn't linked to a bakery yet.",
          email: me.user.email,
          showApply: true,
        });
        return;
      }

      if (me.bakery.onboarding_step !== "done") {
        const map = {
          signup: "/onboarding",
          profile: "/onboarding-profile",
          zones: "/onboarding-zones",
        };
        // Preserve the admin-shadow ?as= so the onboarding wizard
        // continues editing the right bakery.
        const dest = map[me.bakery.onboarding_step] || "/onboarding";
        window.location.replace(adminAsId ? `${dest}?as=${encodeURIComponent(adminAsId)}` : dest);
        return;
      }

      if (me.bakery.status === "pending_review") {
        renderNoAccess({
          title: "We're reviewing your application",
          body: "Your bakery is in review. We'll email you the moment you're approved.",
          email: me.user.email,
          showApply: false,
        });
        return;
      }

      // Blocked and rejected lose the dashboard. Paused does NOT — a paused
      // bakery keeps everything it can see here, it just stops being routed
      // new orders, and any work already in the queue still has to be baked.
      if (me.bakery.status === "blocked" || me.bakery.status === "rejected") {
        renderNoAccess({
          title: "Account inactive",
          body: "Your bakery isn't currently active on Daymaker. Reach out to support if you think this is wrong.",
          email: me.user.email,
          showApply: false,
        });
        return;
      }

      const data = await authedFetch(withAs("/api/v1/bakery/assignments"));
      state.assignments = data.assignments;
      state.lastSyncAt = new Date();

      // Money is a separate read because it is a separate record now — the
      // dashboard no longer derives what it's owed by summing rows on screen.
      // A failure here must not blank the queue: the queue is the job, the
      // KPI is the paycheck, and a bakery can work without the second.
      try {
        const pay = await authedFetch(withAs("/api/v1/bakery/payouts"));
        state.payouts = pay.payouts || [];
        state.payoutSettings = pay.settings || null;
      } catch (err) {
        console.warn("payouts_load_failed", err);
      }

      renderIdentity(me);
      renderProfileNudge(me.bakery);
      renderStats(state.assignments);
      renderList();
      renderSync();

      document.getElementById("bakery-hero").hidden = false;
      document.getElementById("bakery-stats").hidden = false;
      document.getElementById("bakery-queue").hidden = false;
      // Always shown. This is standing practical info, not a nudge, so it
      // has no dismissed state to read back.
      document.getElementById("flavor-note").hidden = false;
      const pausedNote = document.getElementById("paused-note");
      if (pausedNote) pausedNote.hidden = me.bakery.status !== "paused";
      document.getElementById("no-access-card").hidden = true;

      // Cocola-only side branch.
      // The badge reflects the same number as the "Needs you" KPI. It
      // used to carry `pending_count` (all open work), so the corner said
      // "4" while the KPI beside it said "1".
      if (me.bakery.is_vc_bakery) {
        // The VC queue owns its own poll, so it reports its pending count up
        // to us instead of us fetching it once here. Fetching it once was the
        // bug: this function runs on load only, while schedulePoll() below
        // re-renders the badge every 20-60s from assignments alone, so the VC
        // half silently vanished from the corner shortly after page load.
        startVcQueue({
          bakery: me.bakery,
          asId: adminAsId,
          onPendingCount: (n) => {
            state.vcPending = n;
            updateNavBadge();
          },
        });
      } else {
        state.vcPending = 0;
        stopVcQueue();
      }
      updateNavBadge();
    } catch (err) {
      showError(err.message || "Could not load.");
      stopPoll();
    }
  }

  function renderNoAccess({ title, body, email, showApply }) {
    document.getElementById("bakery-hero").hidden = true;
    const nudge = document.getElementById("profile-nudge");
    if (nudge) nudge.hidden = true;
    document.getElementById("bakery-stats").hidden = true;
    document.getElementById("bakery-queue").hidden = true;
    document.getElementById("flavor-note").hidden = true;
    const paused = document.getElementById("paused-note");
    if (paused) paused.hidden = true;
    document.getElementById("no-access-title").textContent = title;
    document.getElementById("no-access-body").textContent = body;
    document.getElementById("no-access-email").textContent = email || "";
    document.getElementById("no-access-apply").hidden = !showApply;
    document.getElementById("no-access-card").hidden = false;
  }

  /**
   * The bakery's name and live state live in the top bar, where they stay
   * put on every page. The old hero spent four lines and ~180px of vertical
   * space on the same information plus a decorative line that claimed the
   * page was still loading.
   */
  function renderIdentity(me) {
    const b = me.bakery;
    document.getElementById("top-bakery-name").textContent = b.name;

    const statusWrap = document.getElementById("top-status");
    const live = b.status === "active";
    document.getElementById("top-status-text").textContent = live ? "Live" : "Paused";
    statusWrap.className = `chip chip--${live ? "good" : "neutral"}`;
    statusWrap.title = live
      ? "Accepting assignments"
      : "Paused - no new orders are being routed to you";
    statusWrap.hidden = false;

    const facts = [];
    if (b.city) facts.push(b.city);
    const days = formatOpenDays(b.open_days);
    if (days) facts.push(`bakes ${days}`);
    if (b.max_daily_deliveries) facts.push(`up to ${b.max_daily_deliveries} cakes a day`);
    document.getElementById("hero-meta").textContent = facts.join(" · ");

    if (adminAsId) {
      const link = document.getElementById("settings-link");
      if (link) link.href = `/bakery-settings?as=${encodeURIComponent(adminAsId)}`;
    }
    wirePayoutLinks();
  }

  // Profile-completion nudge. Counts the optional brand fields that make a
  // bakery's customer-facing profile feel real and surfaces a pressure-free
  // prompt. Dismissed state is per-bakery in localStorage. The admin-shadow
  // (?as=) view never shows it — it's the owner's call, not the admin's.
  const PROFILE_CHECKS = [
    { key: "logo_url", label: "Add a logo" },
    { key: "description", label: "Write a short description" },
    { key: "phone", label: "Add a phone number" },
  ];

  function profileNudgeDismissKey(bakeryId) {
    return `dm_profile_nudge_dismissed_${bakeryId}`;
  }

  function renderProfileNudge(bakery) {
    const el = document.getElementById("profile-nudge");
    if (!el || !bakery) return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(profileNudgeDismissKey(bakery.id)) === "1";
    } catch {
      /* private mode / storage disabled — just show it */
    }
    if (adminAsId || dismissed) {
      el.hidden = true;
      return;
    }

    const missing = PROFILE_CHECKS.filter((c) => {
      const v = bakery[c.key];
      return v == null || String(v).trim() === "";
    });
    if (missing.length === 0) {
      el.hidden = true;
      return;
    }

    // Say what's left in words. The old version rendered a percentage in
    // red Fraunces plus a progress bar, so a bakery with nothing filled in
    // saw a big red "0%" and an empty box.
    document.getElementById("profile-nudge-sub").textContent =
      missing.length === PROFILE_CHECKS.length
        ? "A logo, a description and a phone number make your profile look real to customers."
        : `${missing.length} thing${missing.length === 1 ? "" : "s"} left.`;
    document.getElementById("profile-nudge-items").innerHTML = missing
      .map(
        (c) =>
          `<a class="profile-nudge__chip" href="/bakery-settings">${escape(c.label)}</a>`,
      )
      .join("");
    el.hidden = false;
  }

  function wireProfileNudgeDismiss() {
    const btn = document.getElementById("profile-nudge-dismiss");
    if (!btn) return;
    btn.addEventListener("click", () => {
      document.getElementById("profile-nudge").hidden = true;
      const id = state.me?.bakery?.id;
      if (id) {
        try {
          localStorage.setItem(profileNudgeDismissKey(id), "1");
        } catch {
          /* ignore */
        }
      }
    });
  }

  function formatOpenDays(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return "";
    const order = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
    const labels = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
    const set = new Set(arr.map((d) => String(d).toLowerCase()));
    const on = order.filter((d) => set.has(d));
    if (on.length === 0) return "";
    // Collapse a contiguous run into a range: "Mon–Sat" beats
    // "Mon/Tue/Wed/Thu/Fri/Sat".
    const firstIdx = order.indexOf(on[0]);
    const contiguous = on.every((d, i) => order.indexOf(d) === firstIdx + i);
    if (contiguous && on.length > 2) return `${labels[on[0]]}–${labels[on[on.length - 1]]}`;
    return on.map((d) => labels[d]).join("/");
  }

  /**
   * Point the header button and the payout KPI at the payouts list, carrying
   * the admin-shadow ?as= through so an impersonating admin stays in the same
   * bakery.
   */
  function wirePayoutLinks() {
    const href = withAs("/bakery/payouts");
    const btn = document.getElementById("payouts-btn");
    if (btn) {
      btn.setAttribute("href", href);
      btn.hidden = false;
    }
    const kpi = document.getElementById("kpi-payout");
    if (kpi) kpi.setAttribute("href", href);
  }

  /**
   * What this order pays, in the bakery's OWN currency.
   *
   * `payout_amount_cents` is USD — that is what the platform reconciles in,
   * and it is NOT the number to show a bakery who priced their cakes in CAD
   * or NOK. The API resolves the local amount + its currency onto every
   * assignment (frozen at materialization, converted on the fly for older
   * rows), so queue rows only ever read these two fields. (The statement
   * totals on /bakery/payouts stay USD — that is the settlement currency —
   * with the local figure rendered alongside from the frozen rate.)
   */
  function payoutOf(a) {
    const cents = a?.payout_local_cents;
    return {
      cents: typeof cents === "number" && Number.isFinite(cents) ? cents : null,
      currency: a?.payout_currency || state.me?.bakery?.currency || "USD",
    };
  }

  /* ─────────────────── urgency model ─────────────────── */

  function isOpen(a) {
    return OPEN_STATUSES.includes(a.status);
  }

  /**
   * "Needs you" is the set a bakery can actually act on right now: an ASAP
   * campaign order with no committed date, or an unanswered customer
   * message. Everything else is either scheduled or done.
   */
  function needsYou(a) {
    if (!isOpen(a)) return false;
    if (a.source === "campaign" && !a.scheduled_date) return true;
    if (typeof a.unread_count === "number" && a.unread_count > 0) return true;
    return false;
  }

  function countNeeds(list) {
    return list.filter(needsYou).length;
  }

  function todayIso() {
    return new Date().toISOString().slice(0, 10);
  }

  function renderStats(assignments) {
    const today = todayIso();
    const open = assignments.filter(isOpen).length;
    const bakingToday = assignments.filter(
      (a) => isOpen(a) && a.scheduled_date === today,
    ).length;

    document.getElementById("stat-open").textContent = String(open);
    // The day's load lives here now that "Baking today" is not its own box.
    document.getElementById("stat-open-sub").textContent =
      bakingToday === 0
        ? "nothing due today"
        : `${bakingToday} due today · deliver by 10:00`;

    renderPayoutKpi();

    // Keep the filter count honest: the chip counts the same set the KPI does.
    document.getElementById("seg-n-open").textContent = open > 0 ? String(open) : "";
  }

  // en-US, not the viewer's locale: the label sits beside the invoice total
  // on an English-only surface, and a Norwegian machine rendered it
  // "To invoice, juli".

  /**
   * The money KPI. Three things it can be saying, in priority order:
   *
   *   1. "A statement needs you" — something is waiting on their approval.
   *      This outranks everything: it is the only state where the bakery has
   *      to DO something to get paid, and it is the whole point of inverting
   *      the flow. Approval is one tap away, not one email away.
   *   2. "Paid, on its way" — the most recent thing we settled.
   *   3. "This period" — what is accumulating right now.
   *
   * Amounts are USD because payouts settle in USD; the bakery's own currency
   * appears on the statement itself, where there's room to show both.
   */
  function renderPayoutKpi() {
    const label = document.getElementById("stat-payout-label");
    const value = document.getElementById("stat-payout");
    const sub = document.getElementById("stat-payout-sub");
    const kpi = document.getElementById("kpi-payout");
    if (!label || !value || !sub) return;

    const list = state.payouts || [];
    const awaiting = list.find((p) => p.status === "pending_approval");
    const open = list.find((p) => p.status === "open");

    if (awaiting) {
      label.textContent = "Waiting on you";
      value.textContent = money(awaiting.amount_cents, "USD");
      sub.textContent = "approve to get paid";
      if (kpi) {
        kpi.setAttribute("href", withAs(`/bakery/payouts/${awaiting.id}`));
        kpi.classList.add("kpi--action");
      }
      return;
    }

    if (kpi) kpi.classList.remove("kpi--action");

    const settled = list.find((p) => p.status === "approved" || p.status === "paid");
    // Prefer showing an accruing period over a settled one only when there's
    // actually something in it — otherwise "This period: $0" reads as broken
    // on the Monday after a payout.
    if (open && open.amount_cents > 0) {
      label.textContent = "This period";
      value.textContent = money(open.amount_cents, "USD");
      sub.textContent = `through ${formatDay(open.period_end)}`;
      if (kpi) kpi.setAttribute("href", withAs(`/bakery/payouts/${open.id}`));
      return;
    }

    if (settled) {
      label.textContent = settled.status === "paid" ? "Last payment" : "Approved";
      value.textContent = money(settled.amount_cents, "USD");
      sub.textContent =
        settled.status === "paid" ? "sent to your account" : "we're sending it";
      if (kpi) kpi.setAttribute("href", withAs(`/bakery/payouts/${settled.id}`));
      return;
    }

    label.textContent = "This period";
    value.textContent = "—";
    sub.textContent = "nothing delivered yet";
  }

  /* ─────────────────── the queue ─────────────────── */

  function matchesFilter(a) {
    if (state.filter === "open") {
      if (!isOpen(a)) return false;
    } else if (state.filter === "delivered") {
      if (a.status !== "delivered") return false;
    } else if (state.filter !== "all" && a.status !== state.filter) {
      return false;
    }
    if (state.query) {
      const q = state.query.toLowerCase();
      const hay = [
        a.recipient_name,
        a.recipient_address,
        a.recipient_city,
        a.product_description,
        a.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  /**
   * Group into buckets a baker thinks in, in the order they matter: what's
   * blocked on me, what's going out today, then by delivery day, then
   * what's finished. The old list was flat and ordered by whatever the API
   * returned.
   */
  function bucket(list) {
    const today = todayIso();
    const groups = new Map();
    const push = (key, title, a) => {
      if (!groups.has(key)) groups.set(key, { title, items: [] });
      groups.get(key).items.push(a);
    };

    for (const a of list) {
      if (needsYou(a)) {
        push("0-needs", "Waiting on you", a);
      } else if (a.status === "delivered") {
        push("9-done", "Complete", a);
      } else if (a.scheduled_date === today) {
        push("1-today", `Today · ${formatDay(today)}`, a);
      } else if (a.scheduled_date) {
        push(`2-${a.scheduled_date}`, formatDay(a.scheduled_date), a);
      } else {
        push("8-unscheduled", "Not scheduled yet", a);
      }
    }
    return [...groups.entries()]
      .sort((x, y) => (x[0] < y[0] ? -1 : 1))
      .map(([, g]) => g);
  }

  function formatDay(iso) {
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  }

  function renderList() {
    const host = document.getElementById("order-list");
    const filtered = state.assignments.filter(matchesFilter);

    if (filtered.length === 0) {
      host.innerHTML = emptyState();
      return;
    }

    host.innerHTML = bucket(filtered)
      .map(
        (g) => `
        <div class="daybar">
          <span class="daybar__t">${escape(g.title)}</span>
          <span class="daybar__n">${g.items.length}</span>
          <span class="daybar__r"></span>
        </div>
        <div class="queue-list">${g.items.map(queueRow).join("")}</div>`,
      )
      .join("");
  }

  function emptyState() {
    // A paused bakery has an empty queue precisely BECAUSE it is paused, so
    // the standing "new orders land here automatically" line would read as a
    // contradiction of the notice at the top of the page.
    const incoming =
      state.me?.bakery?.status === "paused"
        ? "You are paused, so nothing new will arrive until Daymaker resumes you."
        : "New orders land here automatically, and we'll email you too.";
    const copy = {
      open: ["No open assignments", incoming],
      delivered: ["Nothing completed yet", "Orders move here once you close them out."],
      all: ["No orders yet", incoming],
    }[state.filter] || ["Nothing here", "Try another filter."];
    if (state.query) {
      return `<div class="queue-empty">
        <p class="queue-empty__t">No match for “${escape(state.query)}”</p>
        <p class="queue-empty__s">Search covers recipient, address and order reference.</p>
      </div>`;
    }
    return `<div class="queue-empty">
      <p class="queue-empty__t">${escape(copy[0])}</p>
      <p class="queue-empty__s">${escape(copy[1])}</p>
    </div>`;
  }

  function queueRow(a) {
    const needsDate = a.source === "campaign" && !a.scheduled_date;
    const unread = typeof a.unread_count === "number" && a.unread_count > 0;

    // Campaign-source assignments stuff "X · N cakes" into recipient_name
    // and "N cakes for \"X\"" into product_description — the same words
    // twice. They also stamp "N drops · {bakery}" as the address. Show the
    // headline once and let the product column carry the spec.
    const isCampaign = a.source === "campaign";
    const sub = isCampaign
      ? ""
      : escape([a.recipient_address, a.recipient_city].filter(Boolean).join(", "));
    const ref = `<span class="queue-row__ref">${escape(refOf(a))}</span>`;

    const when = needsDate
      ? "ASAP"
      : a.scheduled_date
        ? formatWhen(a)
        : "unscheduled";

    // At most two chips, and never a chip that repeats the column beside it.
    const tags = [];
    if (needsDate) tags.push(chip("Needs a date", "action"));
    if (unread) {
      tags.push(
        chip(`${a.unread_count} message${a.unread_count === 1 ? "" : "s"}`, "warn", {
          title: "Unanswered customer message",
        }),
      );
    }
    // "Accepted" carries no signal — every campaign assignment lands there.
    if (!needsDate && a.status !== "accepted") tags.push(statusChip(a.status));
    if (!isCampaign) tags.push(sourceChip(a.source));

    // A completed cake is already on a statement; before that it's what the
    // job is worth. Neither says "to invoice" any more — nobody invoices us.
    const amountLabel = a.status === "delivered" ? "earned" : "payout";
    const pay = payoutOf(a);
    const amount =
      pay.cents > 0
        ? `<span class="queue-row__amt">${escape(money(pay.cents, pay.currency))}</span>` +
          `<span class="queue-row__amt-l"> ${amountLabel}</span>`
        : "";

    return `
      <a class="queue-row${needsDate || unread ? " queue-row--needs" : ""}"
         href="/bakery/assignments/${escape(a.id)}">
        <span class="queue-row__who">
          <span class="queue-row__name">${escape(a.recipient_name)}</span>
          <span class="queue-row__sub">${sub ? sub + " · " : ""}${ref}</span>
        </span>
        <span class="queue-row__what">
          <span class="queue-row__what-l">${escape(describeProduct(a))}</span>
        </span>
        <span class="queue-row__tags">${tags.join("")}</span>
        <span class="queue-row__when"><span class="queue-row__when-v">${escape(when)}</span></span>
        <span class="queue-row__money">${amount}</span>
      </a>`;
  }

  /**
   * A short human reference. A bakery cannot read "#a1c8f0e2" down a phone
   * to anyone, but it does need something stable to quote, so keep the id
   * prefix and mark it as a reference rather than dressing it as a chip.
   */
  function refOf(a) {
    if (a.order_number) return a.order_number;
    return `#${String(a.id || "").slice(0, 8)}`;
  }

  function describeProduct(a) {
    if (a.product_description && a.source !== "campaign") return a.product_description;
    if (a.cake_count) return `${a.cake_count} cakes`;
    // Campaign rows repeat the headline in product_description; strip the
    // campaign name back out so the column adds information.
    const m = /^(\d+)\s+cakes?/i.exec(a.product_description || "");
    if (m) return `${m[1]} cakes`;
    return a.product_description || "";
  }

  function formatWhen(a) {
    const today = todayIso();
    if (a.status === "delivered") {
      return a.completed_at
        ? new Date(a.completed_at).toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "done";
    }
    if (a.scheduled_date === today) return "by 10:00";
    return formatDay(a.scheduled_date);
  }

  function renderSync() {
    const el = document.getElementById("queue-sync");
    if (!el || !state.lastSyncAt) return;
    el.textContent = `Updated ${state.lastSyncAt.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  }

  function setFilter(next) {
    state.filter = next;
    document.querySelectorAll("#filter-chips .seg").forEach((b) => {
      const on = b.dataset.filter === next;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    renderList();
  }

  function wireFilters() {
    document.getElementById("filter-chips").addEventListener("click", (e) => {
      const btn = e.target.closest(".seg");
      if (!btn) return;
      setFilter(btn.dataset.filter);
    });
  }

  function wireSearch() {
    const input = document.getElementById("search-input");
    input.addEventListener("input", () => {
      state.query = input.value.trim();
      renderList();
    });
  }

  function wireRetry() {
    document.getElementById("retry-btn")?.addEventListener("click", loadAndRender);
  }

  /**
   * Recompose the corner badge from BOTH sources every time either changes.
   * Takes no argument on purpose: callers that passed only their own half are
   * how the VC count went missing on the poll.
   */
  function updateNavBadge() {
    const b = document.getElementById("nav-pending-badge");
    if (!b) return;
    const n = countNeeds(state.assignments) + (state.vcPending || 0);
    if (n > 0) {
      b.textContent = String(n);
      b.title = `${n} order${n === 1 ? "" : "s"} waiting on you`;
      b.hidden = false;
    } else {
      b.hidden = true;
    }
  }

  function schedulePoll() {
    stopPoll();
    state.pollTimer = setTimeout(async () => {
      if (document.hidden) return schedulePoll();
      try {
        const data = await authedFetch(withAs("/api/v1/bakery/assignments"));
        const prevNeeds = countNeeds(state.assignments);
        state.assignments = data.assignments;
        state.lastSyncAt = new Date();
        // Keep the money KPI live too — a statement can close (and start
        // waiting on them) while the tab is open.
        try {
          const pay = await authedFetch(withAs("/api/v1/bakery/payouts"));
          state.payouts = pay.payouts || [];
          state.payoutSettings = pay.settings || null;
        } catch {
          /* keep the last known payouts rather than blanking the KPI */
        }
        renderStats(state.assignments);
        renderList();
        renderSync();
        setChatDockThreads(state.assignments);
        const newNeeds = countNeeds(state.assignments);
        updateNavBadge();
        // Back off if quiet.
        state.pollMs = newNeeds === prevNeeds ? 60000 : 20000;
      } catch (err) {
        console.warn("poll_failed", err);
        state.pollMs = 60000;
      }
      schedulePoll();
    }, state.pollMs);
  }

  function stopPoll() {
    if (state.pollTimer) {
      clearTimeout(state.pollTimer);
      state.pollTimer = null;
    }
  }

  function onVisibility() {
    if (document.hidden) {
      stopPoll();
    } else {
      state.pollMs = 20000;
      schedulePoll();
    }
  }

  function showError(msg) {
    document.getElementById("error-msg").textContent = msg;
    document.getElementById("error-card").hidden = false;
  }
  function hideError() {
    document.getElementById("error-card").hidden = true;
  }
})();
