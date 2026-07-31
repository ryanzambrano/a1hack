// HTTP API. Thin express layer over lib/domain.js; all rules live there.
// Admin routes are unauthenticated in the MVP (see README before deploying).
import { Router, json } from "express";
import {
  DomainError,
  getBakery,
  listProducts,
  getProduct,
  createOrder,
  getOrder,
  listOrders,
  setOrderStatus,
  createProduct,
  updateProduct,
  earliestPickupDate,
  pickupSlots,
  ORDER_STATUSES,
} from "./domain.js";
import { getPaymentProvider } from "./payments.js";

export function createApi(db) {
  const api = Router();
  api.use(json({ limit: "200kb" }));

  const wrap = (fn) => async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof DomainError) {
        res.status(err.status).json({ error: err.message });
      } else {
        console.error(err);
        res.status(500).json({ error: "Noe gikk galt. Prøv igjen." });
      }
    }
  };

  /* ------------------------------ storefront ------------------------------ */

  api.get("/shop", wrap(async (req, res) => {
    const bakery = getBakery(db);
    res.json({ bakery, pickupSlots: pickupSlots(bakery) });
  }));

  api.get("/products", wrap(async (req, res) => {
    res.json({ products: listProducts(db) });
  }));

  api.get("/products/:id", wrap(async (req, res) => {
    const product = getProduct(db, Number(req.params.id));
    if (!product) throw new DomainError(404, "Produktet finnes ikke");
    res.json({ product });
  }));

  // Pickup constraints for a set of products (the cart): earliest date under
  // the strictest lead time, closed weekdays, and the slot list.
  api.get("/pickup-options", wrap(async (req, res) => {
    const bakery = getBakery(db);
    const idsParam = String(req.query.products || "").trim();
    const ids = idsParam ? idsParam.split(",").map(Number) : [];
    let maxLead = 0;
    for (const id of ids) {
      const p = getProduct(db, id);
      if (!p) throw new DomainError(400, "Ukjent produkt i kurven");
      maxLead = Math.max(maxLead, p.leadTimeDays);
    }
    res.json({
      earliestDate: earliestPickupDate(bakery, maxLead),
      maxLeadTimeDays: maxLead,
      closedWeekdays: bakery.closedWeekdays,
      slots: pickupSlots(bakery),
    });
  }));

  api.post("/orders", wrap(async (req, res) => {
    const order = await createOrder(db, req.body, getPaymentProvider());
    res.status(201).json({ order });
  }));

  api.get("/orders/:id", wrap(async (req, res) => {
    const order = getOrder(db, Number(req.params.id));
    if (!order) throw new DomainError(404, "Bestillingen finnes ikke");
    res.json({ order });
  }));

  /* -------------------------------- admin --------------------------------- */

  api.get("/admin/orders", wrap(async (req, res) => {
    const status = req.query.status ? String(req.query.status) : undefined;
    res.json({ orders: listOrders(db, { status }), statuses: ORDER_STATUSES });
  }));

  api.patch("/admin/orders/:id", wrap(async (req, res) => {
    const order = setOrderStatus(db, Number(req.params.id), String(req.body.status || ""));
    res.json({ order });
  }));

  api.get("/admin/products", wrap(async (req, res) => {
    res.json({ products: listProducts(db, { includeInactive: true }) });
  }));

  api.post("/admin/products", wrap(async (req, res) => {
    res.status(201).json({ product: createProduct(db, req.body) });
  }));

  api.patch("/admin/products/:id", wrap(async (req, res) => {
    res.json({ product: updateProduct(db, Number(req.params.id), req.body) });
  }));

  api.use((req, res) => res.status(404).json({ error: "Ukjent API-rute" }));
  return api;
}
