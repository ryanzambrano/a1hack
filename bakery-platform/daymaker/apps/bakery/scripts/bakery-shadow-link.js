// If the dashboard is being viewed via ?as=<bakery_id> (admin shadow),
// thread the same query through to /bakery-settings so the settings form
// patches the right bakery instead of the admin's own (which might be null
// and would trip the "no bakery linked" no-access card).
// Extracted from an inline <script> so the page can ship under a strict CSP.
(function () {
  var qs = new URLSearchParams(window.location.search);
  var as = qs.get("as");
  if (!as) return;
  var link = document.getElementById("edit-bakery-link");
  if (link) link.href = "/bakery-settings?as=" + encodeURIComponent(as);
})();
