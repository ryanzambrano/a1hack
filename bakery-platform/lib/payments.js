// Payment provider abstraction. The MVP ships only the mock provider; a real
// provider (Vipps ePayment, Stripe) plugs in by implementing the same shape
// and being returned from getPaymentProvider() based on configuration.
//
// Contract:
//   provider.name                       -> string stored on the order row
//   provider.charge({ totalCents, orderDraft }) -> Promise<{ ok, reference, status }>
//     ok:        whether the charge succeeded
//     reference: provider's payment reference to store for reconciliation
//     status:    value for orders.payment_status ("demo_paid" for the mock)
//
// A real provider will typically return a redirect URL and confirm async via
// webhook; that lives behind charge() plus a future confirm() without moving
// the call site in lib/domain.js.

let counter = 0;

const MockPaymentProvider = {
  name: "mock",
  async charge({ totalCents }) {
    counter += 1;
    const reference = `DEMO-${String(100000 + counter)}-${totalCents}`;
    return { ok: true, reference, status: "demo_paid" };
  },
};

export function getPaymentProvider() {
  // Future: switch on process.env.PAYMENT_PROVIDER ("vipps" | "stripe").
  return MockPaymentProvider;
}
