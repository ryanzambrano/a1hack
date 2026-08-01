// Shapes for the storefront half of the app, ported from bakery-platform.
// These are the objects the API returns, so they stay camelCase while the
// Postgres rows underneath stay snake_case (mapping lives in catalog.ts).
//
// All money is integer USD cents.
//
// This module is deliberately types-only, with no runtime exports. That lets
// every importer pull it in with `import type`, which Node's TypeScript
// stripping erases outright — so the domain modules run under `node --test`
// without a loader or a build step. ORDER_STATUSES lives in pricing.ts.

export type OrderStatus =
  | "new"
  | "confirmed"
  | "ready"
  | "picked_up"
  | "cancelled";

/** The bakery as the storefront sees it: identity plus fulfillment rules. */
export interface ShopBakery {
  id: string;
  slug: string;
  name: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  currency: string;
  /** Order after this local hour and the lead time starts counting tomorrow. */
  orderCutoffHour: number;
  openHour: number;
  closeHour: number;
  /** JS getDay(): 0 = Sunday. */
  closedWeekdays: number[];
}

export interface ProductOption {
  id: number;
  value: string;
  priceDeltaCents: number;
  isDefault: boolean;
}

/** A single-select group: exactly one value per group ends up on the line. */
export interface OptionGroup {
  name: string;
  options: ProductOption[];
}

export interface Product {
  id: number;
  bakeryId: string;
  name: string;
  description: string;
  category: string;
  imageUrl: string;
  basePriceCents: number;
  /** Minimum days of notice; 0 means same day. */
  leadTimeDays: number;
  canHaveCakeText: boolean;
  cakeTextPriceCents: number;
  active: boolean;
  sortOrder: number;
  optionGroups: OptionGroup[];
}

/** An option frozen onto an order line at order time. */
export interface ChosenOption {
  id: number;
  group: string;
  value: string;
  priceDeltaCents: number;
}

export interface Customer {
  name: string;
  phone: string;
  email: string;
}

export interface OrderLine {
  id: number;
  productId: number;
  productName: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
  options: ChosenOption[];
  cakeText: string;
}

export interface Order {
  id: number;
  orderNumber: string;
  status: OrderStatus;
  customer: Customer;
  pickupDate: string;
  pickupSlot: string;
  note: string;
  totalCents: number;
  paymentProvider: string;
  paymentStatus: string;
  paymentReference: string;
  createdAt: string;
  /** Set when the order came from a qualified phone lead rather than the cart. */
  leadId: string | null;
  lines: OrderLine[];
}

/* ------------------------------ cart payload ------------------------------ */

/** One cart line: references only, never prices. The server recomputes those. */
export interface CartLineInput {
  productId: number;
  qty: number;
  optionIds?: number[];
  cakeText?: string;
}

export interface OrderInput {
  customer: Partial<Customer>;
  pickupDate: string;
  pickupSlot: string;
  note?: string;
  lines: CartLineInput[];
  leadId?: string | null;
}

/** A validated, fully priced order ready to be written. */
export interface OrderDraft {
  customer: Customer;
  pickupDate: string;
  pickupSlot: string;
  note: string;
  totalCents: number;
  lines: Omit<OrderLine, "id">[];
}

/* -------------------------------- payments -------------------------------- */

export interface ChargeResult {
  ok: boolean;
  reference: string;
  status: string;
}

export interface PaymentProvider {
  name: string;
  charge(input: { totalCents: number; orderDraft: OrderDraft }): Promise<ChargeResult>;
}
