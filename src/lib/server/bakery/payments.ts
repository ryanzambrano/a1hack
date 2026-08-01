// Payment provider abstraction, ported from bakery-platform/lib/payments.js.
// Only the mock provider ships; a real one (Stripe, Vipps) plugs in by
// implementing the same shape and being returned from getPaymentProvider().
//
// Contract:
//   provider.name                              -> stored on the order row
//   provider.charge({ totalCents, orderDraft }) -> { ok, reference, status }
//
// A real provider would typically return a redirect URL and confirm
// asynchronously via webhook; that fits behind charge() plus a future
// confirm(), without moving the call site in catalog.ts.

import type { PaymentProvider } from "./types";

const MockPaymentProvider: PaymentProvider = {
  name: "mock",
  async charge({ totalCents }) {
    // The original numbered references from a module-level counter. Route
    // Handlers do not share process state reliably, so the reference is made
    // unique from the clock and a random suffix instead.
    const serial = `${Date.now().toString(36)}${Math.floor(Math.random() * 1296)
      .toString(36)
      .padStart(2, "0")}`.toUpperCase();
    return { ok: true, reference: `DEMO-${serial}-${totalCents}`, status: "demo_paid" };
  },
};

export function getPaymentProvider(): PaymentProvider {
  // Future: switch on process.env.PAYMENT_PROVIDER ("stripe" | "vipps").
  return MockPaymentProvider;
}
