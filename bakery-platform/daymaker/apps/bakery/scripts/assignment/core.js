// Extracted from bakery-assignment.js — core cluster.
// All sibling imports share one ?v= pin; bump them in lockstep
// (they must resolve to the same module instances).

const POLL_MS = 20_000;

const STATUS_LABEL = {
  pending: "Pending",
  accepted: "Accepted",
  in_production: "In production",
  ready: "Ready",
  in_transit: "In transit",
  // "Complete", not "Delivered": an order whose cakes were all marked
  // unsuccessful still gets closed out here.
  delivered: "Complete",
  failed: "Failed",
  cancelled: "Cancelled",
};

// Per-status hero sub-copy, used only when there is no delivery date to show
// in its place. The lowercase Caveat-era voice ("you're on. upload both photos
// when the cake's out the door.") outlived the handwritten treatment it was
// written for, and on an ASAP order it told the bakery to upload photos while
// the page had uploads locked behind a delivery date. Sentence case, and true
// of the state it labels.
const SUB_FOR_STATUS = {
  pending: "Waiting on a delivery date",
  accepted: "Ready to bake",
  in_production: "In the oven",
  ready: "Boxed and ready to go out",
  in_transit: "Out for delivery",
  delivered: "All wrapped up. Nice work.",
  failed: "Delivery hit a snag - talk to admin.",
  cancelled: "Cancelled. Nothing more to do.",
};

const state = {
  id: null,
  me: null,
  assignment: null,
  pollTimer: null,
  busy: false,
  // The order kind this page is rendering: assignmentSource or vcSource from
  // source.js. Set by the entry script before boot. Everything that differs
  // between /bakery/assignments/:id and /bakery/vc-orders/:id lives on it.
  source: null,
};

const $ = (id) => document.getElementById(id);
const els = {};

function cacheEls() {
  els.gate = $("auth-gate");
  els.shell = $("order-shell");
  els.num = $("order-num");
  els.title = $("order-title");
  els.sub = $("order-sub");
  els.statusPill = $("status-pill");
  els.cakeCountChip = $("cake-count-chip");
  els.cakeSectionCount = $("cake-section-count");
  els.cakesTable = $("cakes-table");
  els.printTicketBtn = $("print-ticket-btn");
  els.ticketPrintHost = $("ticket-print-host");
  // The "Next step" card is gone; only its result line survives, as a slim
  // flash strip under the header.
  els.actionResult = $("action-result");
  els.detailDl = $("detail-dl");
  els.recipientsCard = $("recipients-card");
  els.recipientsTable = $("recipients-table");
  els.recipientsCount = $("recipients-count");
  els.uploadCard = $("upload-card");
  els.uploadProgress = $("upload-progress");
  els.uploadProgressLabel = $("upload-progress-label");
  els.perCakeUploads = $("per-cake-uploads");
  els.doneBtn = $("done-btn");
  els.doneHint = $("done-hint");
  els.photosCard = $("photos-card");
  els.photoGrid = $("photo-grid");
  els.eventsList = $("events-list");
  els.errorCard = $("error-card");
  els.errorMessage = $("error-message");
  els.errorHint = $("error-hint");
  els.errorRetry = $("error-retry-btn");
  els.footId = $("orders-foot-id");
  els.chip = $("bakery-nav-chip");
  // Decline modal removed — bakeries can no longer refuse a paid order.
  // Per-cake "Mark unsuccessful" modal lives here instead.
  els.muModal = $("mu-modal");
  els.muRecipient = $("mu-recipient");
  els.muReason = $("mu-reason");
  els.muCancel = $("mu-cancel");
  els.muConfirm = $("mu-confirm");
  // Delivery-date card. One box, two states: settled (the date + "Change")
  // and editor (the picker).
  els.ddCard = $("delivery-date-card");
  els.ddH = $("dd-h");
  els.ddHint = $("dd-hint");
  els.ddInput = $("dd-input");
  els.ddConfirm = $("dd-confirm");
  els.ddResult = $("dd-result");
  els.ddSettled = $("dd-settled");
  els.ddCurrent = $("dd-current");
  els.ddChange = $("dd-change");
  els.ddEditor = $("dd-editor");
  els.ddEcho = $("dd-echo");
  // Insert card - the printable QR card that ships in the box. VC only; these
  // are simply absent on the assignment page.
  els.insertCardWrap = $("insert-card-wrap");
  els.insertCardQr = $("insert-card-qr");
  els.insertPrintBtn = $("insert-print-btn");
  els.insertDownloadBtn = $("insert-download-btn");
}
export {
  POLL_MS,
  STATUS_LABEL,
  SUB_FOR_STATUS,
  cacheEls,
  els,
  state,
};
