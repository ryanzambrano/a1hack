// Extracted from bakery-assignment.js — chat cluster.
// All sibling imports share one ?v= pin; bump them in lockstep
// (they must resolve to the same module instances).
import { mountChatPanel } from "/scripts/chat-panel.js?v=20260726a";
import { authedFetch } from "/scripts/api.js";
import { uploadViaSign } from "/scripts/blob-upload.js?v=20260726a";
import { state } from "./core.js?v=20260729unified2";
import {
  mountChatDockThread,
  setChatDockUnread,
} from "/apps/bakery/scripts/bakery-chat-dock.js?v=20260729unified2";

let chatMounted = false;

// Mount the customer chat once, for campaign assignments only (VC / manual
// orders have no customer on the other end). The shared panel self-polls and
// marks inbound messages read while it's on screen.
//
// The panel is mounted into #chat-mount and then ADOPTED by the floating
// dock, which moves that element into its drawer. Mounting a second panel
// for the dock would double the poller and the read receipts, so the dock
// takes the live one instead. The in-page card keeps a button that opens the
// drawer, so the conversation is reachable from both places.
function maybeMountChat(a) {
  if (chatMounted) return;
  if (!a || a.source !== "campaign") return;
  const card = document.getElementById("chat-card");
  const mount = document.getElementById("chat-mount");
  if (!card || !mount) return;
  card.hidden = false;
  chatMounted = true;
  const base = `/api/v1/bakery/assignments/${encodeURIComponent(state.id)}/messages`;
  mountChatPanel({
    container: mount,
    selfRole: "bakery",
    fetchMessages: () => authedFetch(base),
    sendMessage: (text, attachmentUrl) =>
      authedFetch(base, {
        method: "POST",
        body: JSON.stringify({
          body: text,
          attachment_url: attachmentUrl || undefined,
        }),
      }),
    markRead: () => authedFetch(`${base}/read`, { method: "POST" }),
    uploadPhoto: async (file) => {
      await window.bakeryPlatformAuth.ready;
      return uploadViaSign({
        file,
        kind: "chat-photo",
        scopeId: state.id,
        getToken: () => window.bakeryPlatformAuth.getToken(),
      });
    },
    // Two places show the count: the card heading and the floating button.
    onUnreadChange: (n) => {
      const badge = document.getElementById("chat-unread");
      if (badge) {
        badge.textContent = String(n);
        badge.hidden = !(n > 0);
      }
      setChatDockUnread(n);
    },
  });

  // Hand the live panel to the dock and turn the card into its doorway.
  const who = a.customer_name || a.recipient_name || a.campaign_name || "the customer";
  mountChatDockThread({
    hostEl: mount,
    title: `Message ${who}`,
    initialUnread: typeof a.unread_count === "number" ? a.unread_count : 0,
    // This card is a doorway, so the panel belongs in the drawer from the
    // start - never a second composer sitting above the button that opens
    // the real one.
    adoptNow: true,
  });
  renderCardDoorway(card, who);
}

/**
 * With the conversation living in the drawer, the aside card is a labelled
 * way in — which also means the order page still advertises that messaging
 * exists. One door, one conversation: the card must never grow a second
 * composer beside the button that opens the real one.
 */
function renderCardDoorway(card, who) {
  const hint = card.querySelector(".orders-card__hint");
  if (hint) hint.textContent = `Ask ${who} anything about this order. We email them as soon as you send.`;
  if (card.querySelector("#chat-card-open")) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "chat-card-open";
  btn.className = "bk-btn bk-btn--secondary chat-card__open";
  btn.textContent = "Open messages";
  btn.addEventListener("click", () => {
    document.getElementById("chat-dock-fab")?.click();
  });
  card.appendChild(btn);
}

export { maybeMountChat };
