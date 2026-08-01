# Custom cakes, over the phone

A build plan for the bakery voice agent, written against two customer calls:
**Even Dough** (12 staff, one full-time person on email and phone) and **Sweet
Lady Jane** (400 custom cakes a week, $300–$1,000+ each, a dedicated custom-cake
person).

---

## 1. What the calls actually told us

Both bakeries, at wildly different scale, described the same bottleneck — and it
is not order-taking.

| Signal | Even Dough | Sweet Lady Jane |
|---|---|---|
| Who absorbs the pain | One office manager, 9–5, "just answering emails and phone calls" | A dedicated custom-cake person |
| Intake form exists | Yes, iterated many times, plus a gallery | Yes, a custom cake form |
| Still takes | **7–12 emails** to reach a quote | 2–3 emails, then a call |
| When a past cake photo is attached | **"two emails, three emails and you're done"** | — |
| The real blocker | "people don't even know what they want even when they submit their form" | "a lot of people like to talk to a person because they don't know what they want" |
| Asset sitting unused | **~2,000 photos** of past cakes in folders | Inspiration photos arrive from customers |
| Pricing method | — | Standard base by size/tier **+ chef hours + accessories** |
| Pricing objection | — | "the actual judgment call of how much something will cost in terms of hours and money, that's where they fail" |
| Split today | — | ~70% quoted by the person, 30% confirmed by the kitchen |
| Response-time gap | — | "we won't be able to answer before 24 hours" |

**Neither asked for more leads.** Sweet Lady Jane: leads are "more of a CRM
solution", and reputation drives most of theirs. Even Dough is drowning in
inbound. Lead generation is solving a problem neither raised.

**The reframe:** the bottleneck is converging on a design and a price, not
capturing an order. Even Dough handed us the metric to beat without being
asked — a real past cake in the conversation collapses the thread by ~4×.

---

## 2. The design decision: photos, on a phone call

The validated unlock is showing past work. You cannot show a photo down a phone
line — but the caller is holding the screen you need.

> The agent retrieves matching past cakes mid-conversation, **texts a numbered
> link while still talking**, and asks "which number is closest?" The caller
> answers out loud. No callback, no app, no waiting.

This is why phone beats email for the same job. Even Dough's 7–12 emails and
Sweet Lady Jane's 24-hour gap both collapse into one call, because the slow part
was never typing — it was the round trips.

Three consequences designed in from the start:

1. **Every option carries a spoken description.** A caller who is driving cannot
   open the link, and the call still has to work.
2. **Options are numbered, never described by name.** "Number three" survives bad
   phone audio; "the pastel one with the gold leaf" does not.
3. **Designs are described at the size being discussed**, not the size they were
   originally made at. Saying "serves about 12" next to a price computed for 30
   is the kind of contradiction a caller catches instantly.

---

## 3. Two lanes

| | **Standard lane** | **Custom lane** |
|---|---|---|
| Trigger | Caller names a menu item | Caller describes a look, an occasion, or is unsure |
| Tools | `find_cake` → `price_cake` → `check_date` → `book_order` | `find_designs` → `pick_design` → `check_date` |
| Price | Exact, from the catalog | **Band**, from comparable past cakes |
| Ends in | A booked order on the bakery's board | A priced proposal routed for one-click human approval |
| Why | Menu items have one right price | Sweet Lady Jane: "there's no substituting for a personal connection… when it's a special event, they want to feel special" |

**Custom cakes are never auto-booked.** The agent's job is to deliver a complete,
priced, photo-referenced brief in minutes instead of days. A person still sends
the quote. That is deliberate positioning: *the agent is the fast lane, not the
person.*

---

## 4. Pricing: comps, not judgment

Sweet Lady Jane's objection is correct — a model cannot look at an inspiration
photo and reason out "that's six chef-hours". So the agent never tries.

It retrieves the closest cakes the bakery has **actually made** and reads off
what those took, the way an appraiser prices a house. Their custom-cake person
already does this implicitly.

```
"Closest to 6 past cakes (unicorn, buttercream), scaled to 24 servings.
 They sold for $135–$180 and took 3.5–5 hours. Confidence: high."
```

The honest part is the confidence score, driven by how many comparables exist,
how similar they are, and how much they disagree:

- **high / medium** → the agent gives the range on the call
- **low** → the agent gives **no price at all**, says the head baker will
  confirm, and takes the rest of the details

That reproduces the 70/30 split Sweet Lady Jane already runs. We are not asking
them to change their process — we are automating the split they have.

**Budget laddering.** When the caller gives a budget, one option is deliberately
above it, labelled as such. This is the fix for "$200 for a four-tier fondant
cake" — the caller calibrates against real work before a person spends an hour
on them, and an undecided caller discovers what they actually want. Frame this
internally and externally as *showing what each budget buys*. Do not name a
feature after margin, and do not repeat Sweet Lady Jane's off-record comments
about maximising price.

---

## 5. What is already built and verified

Working against the live Supabase project today:

- **Schema** — `archive_cakes`, `proposals`, `proposal_options`
  (`supabase/migrations/20260731230000_*`)
- **Archive seed** — 140 designs with correlated price and labour history
  (`scripts/seed-archive.mjs`), so comps have real signal
- **Retrieval** — `src/lib/archive/retrieval.ts`: attribute-first matching over a
  vocabulary read out of the archive itself, diversity dedupe, budget ladder
- **Comps pricing** — `src/lib/archive/comps.ts`: k-nearest priced cakes, size
  scaling, weighted percentile band, confidence, plus feasibility rules
  ("you can't put fondant on buttercream")
- **Phone tools** — `find_designs` and `pick_design` in `src/lib/agent/tools.ts`,
  wired into the same grounding invariant as everything else
- **Proposal page** — `/p/[code]`, numbered mobile gallery
- **14 golden scenarios** passing, including the custom lane

Two design defects found and fixed during the build:

- "Reset demo" **deleted the entire cake archive** via a cascade from
  `bakeries`. An imported photo library is not demo state. Migration
  `20260731234500` decouples it; verified 140 → 140 across a reset.
- A stale archive cache pointed at re-imported ids and failed the write, which
  a caller would have heard as a flat error. `find_designs` now drops the cache
  and reselects once.

**Still placeholder:** designs render as flat SVG illustrations and are labelled
"sample design". Generating photorealistic images of cakes the bakery never made
would be a lie told in their name.

---

## 6. Importing a real archive

The single highest-value next step, and the longest lead time.

**Step 1 — Collect.** Even Dough's ~2,000 photos from folders; Sweet Lady Jane
from their order system. Perceptual-hash dedupe first; bakeries photograph the
same cake from four angles.

**Step 2 — Caption.** Vision model per photo → strict JSON: `themes`, `colors`,
`techniques` (one coating + decorations), `tiers`, estimated `servings`,
`occasion`, complexity 1–5, plus a one-sentence spoken description. Write to
`archive_cakes` with `source='archive'`.

**Step 3 — Calibrate.** The folders we are being given have **no price and no
size**, and vision cannot recover either — a two-tier cake serves twenty or
forty depending on how it is cut, and nothing in a photograph says what it sold
for. So the importer leaves `price_cents`, `servings` and `labor_hours` null,
and a small hand-priced subset supplies them:

```bash
node scripts/calibration.mjs export --count 30   # a CSV of the most informative 30
# bakery fills in PRICE_USD, SERVINGS, HOURS
node scripts/calibration.mjs import calibration.csv
```

Which thirty matters more than how many. Random sampling over-picks the
everyday sponge and misses the sculpted and four-tier work whose premiums the
model most needs. `selectCalibrationSet` starts from the most typical cake and
repeatedly adds whichever is least like everything chosen so far.

**Step 4 — Fit and measure.** Thirty examples is too sparse for
nearest-neighbour lookup but ample for fitting a formula, because the formula's
shape is not in question — Sweet Lady Jane described it: size and tier base,
plus decorating hours, plus accessories. `costmodel.ts` fits those coefficients
on log-price, so premiums come out the way bakers talk about them ("fondant is
about 23% more").

**Step 5 — Review pass.** Bakery corrects tags on ~50 photos. Their corrections
tune the captioning prompt and measure tag accuracy before anything is customer
facing.

**Step 6 — Backtest before go-live.** `GET /api/archive/backtest` holds out each
priced cake, predicts it from the rest, and reports the error — plus a learning
curve answering "how many must we price?". This is what will convince Sweet Lady
Jane, who has already told us he expects AI to fail at costing. Ship the number,
not the claim.

On the seeded archive today:

| priced cakes | MAPE | within ±15% |
|---|---|---|
| 10 | 19.3% | 53% |
| 20 | 14.6% | 63% |
| **30** | **11.9%** | **71%** |
| 40 | 10.8% | 76% |
| 60 | 10.3% | 76% |

Thirty is the knee of the curve; past forty it barely moves. That is the ask.

**Caveat, and it is a real one:** the seeded archive was generated from a
multiplicative cost model, which is exactly the functional form the fitted
model assumes — so its current win over comparables (9.3% vs 16.4% MAPE) is
partly circular. Real pricing carries per-cake judgment a smooth formula will
not capture, and comparables may well win on a real archive. That is precisely
why the backtest exists and why the method is configurable
(`ARCHIVE_PRICING_POLICY`) rather than hardcoded. Re-run it on their data
before trusting either number.

---

## 7. Metrics that decide whether this works

| Metric | Baseline from the calls | Target |
|---|---|---|
| Time to first substantive response | 24 hours (SLJ) | < 60 seconds, on the call |
| Round trips to a quote | 7–12 emails (Even Dough) | ≤ 3 |
| Custom calls where a design is chosen on the call | 0 | > 50% |
| Quote coverage at medium+ confidence | ~70% human-quoted (SLJ) | ≥ 70% agent-quoted |
| Comps price error vs final invoice | — | within ±15% on backtest |
| Hallucinated prices | — | **zero**, enforced in code |
| Escalation precision (allergy, human, complaint, wedding) | — | 100% recall, deterministic |

---

## 8. What we deliberately do not automate

- **Allergy and ingredient safety.** Never answered, always escalated, decided
  on the caller's own words before the model is consulted.
- **Weddings and large catering.** Sweet Lady Jane quotes these with a person;
  the "Godzilla bridesmaids" need silk gloves, not a bot.
- **Complaints about existing orders.**
- **Final custom quotes.** The agent proposes; a human sends.
- **Anyone who asks for a person.** Immediate handoff, no persuasion.

---

## 9. Open questions for the follow-up calls

1. Are photos joined to price and chef-hours anywhere, or only in someone's head?
2. What share of inquiries arrive with an inspiration image?
3. How does the office manager's day split — new inquiries vs mid-thread vs logistics?
4. Even Dough: her West Coast competitor eliminated customization entirely. What
   would she give up if the tooling were good enough? That bounds how much
   ambiguity we must handle.
5. Who sends the final quote today, and what would have to be true to let a
   draft go untouched?
6. After-hours volume — that is free capacity the agent can take immediately,
   with no change to anyone's job.

---

## 10. Sequence

**Landed.** Schema, seeded archive, retrieval, comps, phone tools, proposal
page, scenarios.

**Next, in order:**

1. Real-archive ingestion for one bakery (Even Dough — she volunteered the
   photos and the use case).
2. Backtest the estimator on their history; publish the error number.
3. Live call with the gateway key in place, tuning how the agent narrates
   options aloud.
4. One-click approval surface for the human — proposal in, quote out.
5. Only then, the email lane. Same retrieval, same comps, drafts into the
   office manager's mailbox, learning from her edits.

The email lane is where Even Dough's full-time salary sits, and it reuses
everything here. It is second only because the hackathon runs on the phone.
