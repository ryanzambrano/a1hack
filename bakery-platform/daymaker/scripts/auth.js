// Clerk CDN bridge → window.bakeryPlatformAuth
// Mirrors coldcaked's auth.js pattern.

(() => {
  // Analytics: load the PostHog bootstrap once per page. site-chrome.js,
  // scripts/auth.js and the VC auth bridge all attempt this; first wins.
  if (!window.__dmPosthogInjected) {
    window.__dmPosthogInjected = true;
    const ph = document.createElement("script");
    ph.src = "/scripts/posthog.js";
    ph.defer = true;
    document.head.appendChild(ph);
  }

  // Hoisted state-flags. These MUST sit before the immediate
  // wireClickHandlers() call further down — declaring them with `let`
  // closer to wireClickHandlers's body would leave them in the TDZ at
  // call time and throw a ReferenceError, killing the whole IIFE and
  // taking window.bakeryPlatformAuth + the click handlers with it.
  let clickHandlersWired = false;

  /**
   * Shared appearance config passed to every Clerk component (modals
   * AND UserButton) so the rendered UI looks identical across the
   * landing, the VC surfaces, and any future page wiring auth.
   *
   * Why fontSize: Clerk v5 mounts in a DOM portal, not a shadow root,
   * so it inherits the host page's `body { font-size }` and any global
   * resets. /vc deliberately runs 17px body; landing runs 16px;
   * other surfaces vary. Pinning the Clerk base size keeps the modal
   * pixel-identical regardless of which page launched it. Mirrors the
   * VC_CLERK_APPEARANCE block in apps/vc/scripts/auth.js.
   */
  const CLERK_APPEARANCE = {
    variables: {
      fontSize: "16px",
    },
  };

  function setBodyState(state) {
    document.body.dataset.clerk = state; // "signed-in" | "signed-out" | "loading"
    document.body.classList.toggle("clerk-signed-in", state === "signed-in");
    document.body.classList.toggle("clerk-signed-out", state === "signed-out");
  }

  setBodyState("loading");

  let readyResolve;
  const readyPromise = new Promise((r) => {
    readyResolve = r;
  });

  const api = {
    ready: readyPromise,
    async getToken() {
      const c = window.Clerk;
      if (!c || !c.session) return null;
      try {
        return await c.session.getToken();
      } catch {
        return null;
      }
    },
    isSignedIn() {
      return !!(window.Clerk && window.Clerk.user);
    },
    getEmail() {
      const u = window.Clerk && window.Clerk.user;
      if (!u) return null;
      const primary = u.emailAddresses.find(
        (e) => e.id === u.primaryEmailAddressId,
      );
      return primary ? primary.emailAddress : u.emailAddresses[0]?.emailAddress ?? null;
    },
    getFullName() {
      const u = window.Clerk && window.Clerk.user;
      if (!u) return null;
      return (
        [u.firstName, u.lastName].filter(Boolean).join(" ") ||
        api.getEmail() ||
        null
      );
    },
    async signOut() {
      if (window.Clerk) await window.Clerk.signOut();
      window.location.href = "/";
    },
    async openSignIn(redirectUrl) {
      // If the user clicks "Sign in" before Clerk's CDN script finishes
      // loading we used to no-op silently — the click handler ran but
      // window.Clerk wasn't there yet. Now we await the same readyPromise
      // wireClickHandlers waits on, so a too-early click just opens the
      // modal as soon as Clerk is up.
      if (!window.Clerk) {
        try { await readyPromise; } catch { /* ignore */ }
      }
      if (!window.Clerk || typeof window.Clerk.openSignIn !== "function") return;
      const base = { appearance: CLERK_APPEARANCE };
      const opts = redirectUrl
        ? Object.assign({}, base, { redirectUrl, afterSignInUrl: redirectUrl })
        : base;
      try {
        window.Clerk.openSignIn(opts);
      } catch (err) {
        console.warn("[auth] openSignIn threw, retrying with no opts", err);
        try { window.Clerk.openSignIn(base); } catch { /* swallow */ }
      }
    },
    async openSignUp(redirectUrl) {
      if (!window.Clerk) {
        try { await readyPromise; } catch { /* ignore */ }
      }
      if (!window.Clerk || typeof window.Clerk.openSignUp !== "function") return;
      const base = { appearance: CLERK_APPEARANCE };
      const opts = redirectUrl
        ? Object.assign({}, base, { redirectUrl, afterSignUpUrl: redirectUrl })
        : base;
      try {
        window.Clerk.openSignUp(opts);
      } catch (err) {
        console.warn("[auth] openSignUp threw, retrying with no opts", err);
        try { window.Clerk.openSignUp(base); } catch { /* swallow */ }
      }
    },
  };

  window.bakeryPlatformAuth = api;

  // Wire the [data-clerk="..."] click handlers IMMEDIATELY, before Clerk
  // even starts loading. Two reasons:
  //   1. If Clerk's CDN is slow / blocked / fails, the click handlers
  //      were previously never attached (they used to live inside
  //      onReady()). The Sign-in button became a dead pixel with no
  //      feedback. Now the click at least registers and api.openSignIn
  //      awaits the ready promise.
  //   2. With type="module" script loading, the IIFE runs after DOMContent
  //      so attaching on document is safe; we don't need to wait for body.
  wireClickHandlers();

  // Fetch public config (clerk pk + mapbox token) then load Clerk.
  let CONFIG_PROMISE = null;
  function loadConfig() {
    if (!CONFIG_PROMISE) {
      CONFIG_PROMISE = fetch("/api/v1/config", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);
    }
    return CONFIG_PROMISE;
  }
  window.bakeryPlatformConfig = loadConfig;

  loadConfig().then((cfg) => {
    // Dev auto-auth: skip Clerk entirely and pretend the user is signed in.
    if (cfg && cfg.dev_auto_auth) {
      api.isSignedIn = () => true;
      api.getEmail = () => "dev@daymaker.local";
      api.getFullName = () => "Dev User (auto-auth)";
      api.getToken = async () => "dev-bypass";
      api.openSignIn = () => alert("Dev mode is on - sign-in is bypassed.");
      api.openSignUp = api.openSignIn;
      api.signOut = async () => {
        alert("Dev mode is on - set DEV_AUTO_AUTH=0 in .env to enable real sign-out.");
      };
      setBodyState("signed-in");
      document.body.classList.add("clerk-loaded");
      mountDevUserBadge();
      readyResolve(api);
      document.dispatchEvent(new CustomEvent("clerk:loaded"));
      document.dispatchEvent(new CustomEvent("clerk:signed-in"));
      return;
    }
    // Resolution order for the publishable key:
    //   1. /api/v1/config (preferred — operator can flip the env without
    //      a static-asset deploy)
    //   2. <meta name="clerk-publishable-key" content="…">  (same shape
    //      VC pages use; fallback when the config API is down or
    //      misconfigured, e.g. a freshly-created Vercel team that hasn't
    //      copied CLERK_PUBLISHABLE_KEY across yet)
    let PK = cfg && cfg.clerk_publishable_key;
    if (!PK) {
      const meta = document.querySelector('meta[name="clerk-publishable-key"]');
      const fromMeta = meta && meta.getAttribute("content");
      if (fromMeta && fromMeta.trim().length > 0 && !fromMeta.startsWith("{{")) {
        PK = fromMeta.trim();
        console.warn("[auth] using clerk-publishable-key from <meta> (config API unavailable)");
      }
    }
    if (!PK) {
      console.error("No clerk_publishable_key (config API failed AND no <meta name=clerk-publishable-key>)");
      setBodyState("signed-out");
      document.body.classList.add("clerk-loaded");
      readyResolve(api);
      document.dispatchEvent(new CustomEvent("clerk:loaded"));
      return;
    }
    const script = document.createElement("script");
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.clerkPublishableKey = PK;
    script.src = `https://${getFrontendApi(PK)}/npm/@clerk/clerk-js@5/dist/clerk.browser.js`;
    script.onload = boot;
    script.onerror = () => {
      console.error("Failed to load Clerk JS");
      setBodyState("signed-out");
      document.body.classList.add("clerk-loaded");
      readyResolve(api);
      document.dispatchEvent(new CustomEvent("clerk:loaded"));
    };
    document.head.appendChild(script);
  });

  function getFrontendApi(pk) {
    // Decode the publishable key to extract the frontend API host.
    // Format: pk_live_<base64(host$)> or pk_test_<base64(host$)>
    try {
      const parts = pk.split("_");
      const b64 = parts[parts.length - 1];
      const decoded = atob(b64);
      return decoded.replace(/\$$/, "");
    } catch {
      return "clerk.accounts.dev";
    }
  }

  async function boot() {
    if (!window.Clerk) {
      console.error("Clerk JS loaded but window.Clerk missing");
      return;
    }
    try {
      await window.Clerk.load();
      onReady();
    } catch (err) {
      console.error("Clerk load failed", err);
      setBodyState("signed-out");
      document.body.classList.add("clerk-loaded");
      readyResolve(api);
      document.dispatchEvent(new CustomEvent("clerk:loaded"));
    }
  }

  function onReady() {
    document.body.classList.add("clerk-loaded");
    const signedIn = api.isSignedIn();
    setBodyState(signedIn ? "signed-in" : "signed-out");
    readyResolve(api);
    document.dispatchEvent(new CustomEvent("clerk:loaded"));
    if (signedIn) {
      document.dispatchEvent(new CustomEvent("clerk:signed-in"));
    } else {
      document.dispatchEvent(new CustomEvent("clerk:signed-out"));
    }

    // Listen to user changes
    window.Clerk.addListener((p) => {
      const nowSignedIn = !!p.user;
      const wasSignedIn = document.body.dataset.clerk === "signed-in";
      setBodyState(nowSignedIn ? "signed-in" : "signed-out");
      if (nowSignedIn && !wasSignedIn) {
        document.dispatchEvent(new CustomEvent("clerk:signed-in"));
      }
      if (!nowSignedIn && wasSignedIn) {
        document.dispatchEvent(new CustomEvent("clerk:signed-out"));
      }
    });

    wireClickHandlers();
    mountUserButton();
  }

  // clickHandlersWired is hoisted at the top of this IIFE — see comment there.
  function wireClickHandlers() {
    if (clickHandlersWired) return;
    clickHandlersWired = true;
    document.addEventListener("click", (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target) return;

      const signIn = target.closest('[data-clerk="sign-in"]');
      if (signIn) {
        e.preventDefault();
        const redirect = signIn.getAttribute("data-redirect") || undefined;
        api.openSignIn(redirect);
        return;
      }
      const signUp = target.closest('[data-clerk="sign-up"]');
      if (signUp) {
        e.preventDefault();
        const redirect = signUp.getAttribute("data-redirect") || undefined;
        api.openSignUp(redirect);
        return;
      }
      const signOut = target.closest('[data-clerk="sign-out"]');
      if (signOut) {
        e.preventDefault();
        api.signOut();
        return;
      }
      const gate = target.closest("[data-clerk-gate]");
      if (gate) {
        e.preventDefault();
        const dest = gate.getAttribute("data-clerk-gate") || "/";
        if (api.isSignedIn()) {
          window.location.href = dest;
        } else {
          api.openSignIn(dest);
        }
      }
    });
  }

  const BAKERY_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l1-5h16l1 5"/><path d="M3 9a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0"/><path d="M5 9v10h14V9"/></svg>';
  const CAMPAIGN_ICON =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l18-5v12L3 13v-2z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>';

  function withIcon(item, svg) {
    return Object.assign({}, item, {
      mountIcon(el) {
        el.innerHTML = svg;
      },
      unmountIcon(el) {
        el.innerHTML = "";
      },
    });
  }

  // A signed-in Clerk user is either a bakery owner/staff member (bakery_id
  // on their app_users row) or, separately, the email that created one or
  // more customer campaigns (customers.contact_email, unauthenticated at
  // creation time). The two aren't mutually exclusive at the DB level, but
  // for the profile menu we only ever show one destination: "My Bakery"
  // wins when the user actually runs a bakery, otherwise "My Campaigns" if
  // they have any. Neither call requires a body — both key off the Clerk
  // session cookie via credentials: "include", same as site-nav.js.
  async function resolveProfileMenuItems() {
    const [bakeryData, customerData] = await Promise.all([
      fetch("/api/v1/bakery/me", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch("/api/v1/customer/me", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);

    const role = bakeryData && bakeryData.user && bakeryData.user.role;
    const runsBakery =
      (role === "bakery_owner" || role === "bakery_staff") &&
      !!(bakeryData && bakeryData.bakery);
    if (runsBakery) {
      return [withIcon({ label: "My Bakery", href: "/bakery" }, BAKERY_ICON)];
    }

    const accessToken =
      customerData && customerData.customer && customerData.customer.access_token;
    if (accessToken) {
      return [
        withIcon(
          { label: "My Campaigns", href: `/customer/${accessToken}` },
          CAMPAIGN_ICON,
        ),
      ];
    }

    return [];
  }

  async function mountUserButton() {
    const mount = document.getElementById("user-button-mount");
    if (!mount || !window.Clerk) return;
    const customMenuItems = await resolveProfileMenuItems();
    try {
      window.Clerk.mountUserButton(mount, {
        afterSignOutUrl: "/",
        appearance: CLERK_APPEARANCE,
        customMenuItems,
      });
    } catch (err) {
      console.warn("mountUserButton failed", err);
    }
  }

  function mountDevUserBadge() {
    // In dev mode there's no Clerk UserButton; show a clear "DEV" pill instead.
    const mount = document.getElementById("user-button-mount");
    if (mount) {
      mount.innerHTML =
        '<span class="pill pill--pink" title="Dev auto-auth is on. Set DEV_AUTO_AUTH=0 in .env to use real Clerk.">DEV</span>';
    }
    wireClickHandlers();
  }
})();
