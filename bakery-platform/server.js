// bakery-platform server: one shared API + static hosting for the five
// front-end variants and the comparison hub. Start with `npm run dev`.
import express from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openDb } from "./lib/db.js";
import { createApi } from "./lib/api.js";
import { createDaymakerApi } from "./lib/daymaker-adapter.js";

const here = dirname(fileURLToPath(import.meta.url));
const app = express();
const db = openDb(process.env.DB_PATH);

// The vendored Daymaker bakery dashboard (bakery-platform/daymaker/**) is the
// platform's order system. It runs UNMODIFIED, so it expects its assets at
// their original absolute paths and its API under /api/v1/bakery. The adapter
// router is mounted BEFORE createApi so /api/v1/* is served here and every
// other /api/* falls through to the platform API.
app.use("/api", createDaymakerApi(db));
app.use("/api", createApi(db));

const dm = join(here, "daymaker");
app.use("/scripts", express.static(join(dm, "scripts")));
app.use("/styles", express.static(join(dm, "styles")));
app.use("/apps", express.static(join(dm, "apps")));
app.use("/brand", express.static(join(dm, "brand")));
app.use("/assets", express.static(join(dm, "assets")));
// The queue is the order system; order rows link to /bakery/assignments/:id,
// so serve the detail page there. Both are plain static HTML.
app.get(["/app/bakery", "/bakery"], (req, res) =>
  res.sendFile(join(dm, "apps", "bakery", "bakery.html"))
);
app.get(["/bakery/assignments/:id", "/bakery-assignment"], (req, res) =>
  res.sendFile(join(dm, "apps", "bakery", "bakery-assignment.html"))
);

app.use("/img", express.static(join(here, "public", "img")));
app.use("/shots", express.static(join(here, "docs", "shots")));
for (const v of ["a", "b", "c", "d", "e"]) {
  app.use(`/variant-${v}`, express.static(join(here, `variant-${v}`)));
}
app.use("/app", express.static(join(here, "app")));
app.get("/", (req, res) => res.sendFile(join(here, "public", "index.html")));

const port = Number(process.env.PORT || 4600);
app.listen(port, () => {
  console.log(`bakery-platform running at http://localhost:${port}`);
  console.log(`Variants: /variant-a ... /variant-e  |  API: /api/products`);
});
