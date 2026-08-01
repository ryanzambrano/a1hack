import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";

import { adminClient } from "@/lib/supabase/admin";
import { getPaymentProvider } from "@/lib/server/bakery/payments";

export const dynamic = "force-dynamic";

/**
 * The payment link the agent texts mid-call.
 *
 * Same audience as the proposal page: a bakery customer holding a phone, not a
 * user of this app. So it is one screen, no account, no card form — this is a
 * demo payment provider and the button simulates the charge that a real one
 * (Stripe, Vipps) would do behind the same call.
 *
 * SECURITY (same caveat as /api/orders/[id]): order numbers are sequential and
 * this page is unauthenticated, so a guessed number shows another customer's
 * name and total. A real deployment needs a token in the link. Flagged rather
 * than quietly "fixed", because the fix is a decision about how a customer
 * with no account proves who they are.
 */

interface OrderRow {
  id: number;
  order_number: string;
  customer_name: string;
  total_cents: number;
  delivery_fee_cents: number;
  fulfillment: string;
  delivery_address: string;
  pickup_date: string;
  pickup_slot: string;
  payment_status: string;
  bakeries: { name: string } | null;
}

async function loadOrder(code: string): Promise<OrderRow | null> {
  const { data } = await adminClient()
    .from("orders")
    .select(
      "id, order_number, customer_name, total_cents, delivery_fee_cents, fulfillment, delivery_address, pickup_date, pickup_slot, payment_status, bakeries(name)"
    )
    .eq("order_number", code.toUpperCase())
    .maybeSingle();
  return (data as OrderRow | null) ?? null;
}

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PAID = new Set(["demo_paid", "deposit_paid", "paid"]);

export default async function PayPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const order = await loadOrder(code);
  if (!order) notFound();

  const paid = PAID.has(order.payment_status);
  const delivering = order.fulfillment === "delivery";
  const cakeCents = order.total_cents - (order.delivery_fee_cents ?? 0);

  async function pay() {
    "use server";
    const fresh = await loadOrder(code);
    // Re-read rather than trusting the render: two taps on a slow phone
    // connection must not charge twice.
    if (!fresh || PAID.has(fresh.payment_status)) return;

    const charge = await getPaymentProvider().charge({
      totalCents: fresh.total_cents,
      orderDraft: {
        customer: { name: fresh.customer_name, phone: "", email: "" },
        pickupDate: fresh.pickup_date,
        pickupSlot: fresh.pickup_slot,
        note: "",
        totalCents: fresh.total_cents,
        lines: [],
      },
    });
    if (!charge.ok) return;

    await adminClient()
      .from("orders")
      .update({
        payment_provider: "link_demo",
        payment_status: charge.status,
        payment_reference: charge.reference,
      })
      .eq("id", fresh.id);

    revalidatePath(`/pay/${code}`);
  }

  return (
    <main className="mx-auto max-w-md px-4 py-10">
      <header className="text-center">
        <p className="text-sm font-medium text-rose-600">{order.bakeries?.name ?? "Your bakery"}</p>
        <h1 className="mt-1 text-2xl font-semibold text-stone-800">
          {paid ? "Payment received" : "Pay for your cake"}
        </h1>
        <p className="mt-1 font-mono text-sm text-stone-500">Order {order.order_number}</p>
      </header>

      <section className="mt-6 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <dl className="grid gap-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-stone-500">Cake</dt>
            <dd className="tabular-nums text-stone-800">{money(cakeCents)}</dd>
          </div>
          {delivering && (
            <div className="flex justify-between gap-4">
              <dt className="text-stone-500">Delivery</dt>
              <dd className="tabular-nums text-stone-800">{money(order.delivery_fee_cents)}</dd>
            </div>
          )}
          <div className="mt-1 flex justify-between gap-4 border-t border-stone-200 pt-3 text-base font-semibold">
            <dt className="text-stone-800">Total</dt>
            <dd className="tabular-nums text-stone-900">{money(order.total_cents)}</dd>
          </div>
        </dl>

        <p className="mt-4 border-t border-stone-200 pt-4 text-sm text-stone-500">
          {delivering
            ? `Delivering to ${order.delivery_address} on ${order.pickup_date}, ${order.pickup_slot}.`
            : `Ready to collect ${order.pickup_date}, ${order.pickup_slot}.`}
        </p>
      </section>

      {paid ? (
        <p className="mt-6 rounded-xl bg-green-50 px-4 py-3 text-center text-sm text-green-800">
          Paid in full. Nothing else to do — we&rsquo;ll see you on the day.
        </p>
      ) : (
        <form action={pay} className="mt-6">
          <button
            type="submit"
            className="w-full rounded-xl bg-rose-600 px-4 py-3.5 text-base font-semibold text-white transition-colors hover:bg-rose-700"
          >
            Pay {money(order.total_cents)}
          </button>
          <p className="mt-3 text-center text-xs text-stone-500">
            Demo payment — no card is collected and nothing is really charged.
          </p>
        </form>
      )}
    </main>
  );
}
