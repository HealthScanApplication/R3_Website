# R³ Hardware product page + preorder — design

**Date:** 2026-10-31
**Branch:** `claude/kickstarter-preorder-ring-81a286`
**Status:** approved design, pre-implementation

## 1. Goal

Turn the current no-payment homepage waitlist
([`HardwarePreorder.tsx`](../../../src/components/HardwarePreorder.tsx)) into a real,
Kickstarter-style preorder: a dedicated product page with its own hero, an
interactive 3D ring, the product story, and a **full-prepay, all-or-nothing
batch-goal** preorder flow backed by Stripe (test mode first).

### Product model (locked)

- **R³ Ring** — a smart ring worn on the finger. A **touch + slide** surface. It is
  the *controller / remote*: tap or slide to fire the clip's camera, start a voice
  note, trigger an AI request, dismiss a reminder, or tick a routine step.
- **R³ Clip** — the camera pod (the device the existing "ROUTINE³ Pod Plan" spec
  sheet calls *R³ Click*). Worn as a **necklace, watch, or clip**. Holds the camera
  and mic; captures food, activity, and voice.
- **AI assistant** — the software layer the two devices feed: manages the user's
  **routine, calendar, and email**.

### Pricing (locked)

| Product | Early-backer | Reg. |
|---|---|---|
| R³ Ring | **$179** | $199 |
| R³ Ring + Clip bundle | **$299** | $349 |

**Model:** full prepayment at checkout. All-or-nothing **batch goal = 250 backers**.
If the goal is not reached by the deadline, every backer is refunded in full; if it
is, manufacturing proceeds and units ship in the stated window. Deposit model was
considered and dropped.

## 2. Scope

### In scope (this build)

1. Dedicated **`/ring` page** wired into the app's page routing.
2. Homepage section reworked into a **teaser hero** that links to `/ring`.
3. **Interactive 3D ring** viewer (STL → optimized `.glb` + `@google/model-viewer`).
4. **Preorder flow**: pricing, full-prepay checkout (Stripe Elements), live backer bar.
5. **Minimal backend**: `hardware_preorders` table, `hardware_batches` row, a
   `hardware-preorders` edge function (`intent` / `confirm` / webhook / public
   `count`), **test mode only**.
6. Tests (TDD) for the function and the preorder form; a Stripe test-card run on Staging.

### Out of scope (follow-ups, tracked separately)

- Updating the "ROUTINE³ Pod Plan" spec-sheet artifact for the ring + AI model.
- Automated mass-refund when a batch fails (v1: operator-run from admin / Stripe).
- **Production go-live**: deploying the function to prod, setting live Stripe keys,
  flipping `ALLOW_LIVE_PAYMENTS=true`, and confirming refund/ship terms. This is a
  manual operator step the owner performs; this build never flips it.

## 3. Architecture

### 3.1 Routing & entry

- Add `'hardware'` to `PageType` and the navigation surface in
  [`useNavigation.tsx`](../../../src/hooks/useNavigation.tsx).
- Map the path `/ring` (and the `?page=hardware` fallback the other pages use) to that
  page in [`useUrlParameterHandling.tsx`](../../../src/hooks/useUrlParameterHandling.tsx).
- Render `<HardwarePage/>` from [`App.tsx`](../../../src/App.tsx) when
  `currentPage === 'hardware'` (the same conditional pattern used for `guides`).
- Add a header nav link to the page.
- The current homepage `HardwarePreorder` section stays, restyled as a **teaser**:
  same editorial look, headline + 3D/art, but the CTA calls
  `navigateToPage('hardware')` instead of posting the inline email form. The email
  waitlist capture moves onto the dedicated page as a secondary "notify me" option.

### 3.2 Page component structure

New directory `src/components/hardware/`:

- `HardwarePage.tsx` — page shell (reuses `Header` / `Footer`), composes the sections.
- `HardwareHero.tsx` — hero: eyebrow, headline (*"Track your routine without lifting a
  finger."*), subcopy, primary/secondary CTAs, live `BackerBar`, and `RingViewer`.
- `HowItWorks.tsx` — 3 steps: touch/slide ring → fires clip → AI updates routine/calendar/email.
- `DevicePair.tsx` — Ring (controller) and Clip (camera pod: necklace/watch/clip),
  reusing the existing `NoteRingArt` / `HeartCameraArt` style SVGs.
- `SpecSheet.tsx` — ring specs + clip specs (sourced from the pod plan).
- `AiAssistant.tsx` — routine / calendar / email.
- `PreorderBlock.tsx` — pricing, full-prepay checkout, batch-goal explanation, FAQ.
- `RingViewer.tsx` — the 3D viewer (see 3.3).
- `BackerBar.tsx` — live "X of 250 backers" progress, fed by the `count` endpoint.

All styling uses **inline styles via the editorial theme**
([`config/editorialTheme`](../../../src/config/editorialTheme)), matching the current
section — no new Tailwind utility classes (prebuilt CSS / no JIT: new classes render
transparent).

### 3.3 Interactive 3D ring

- **Asset pipeline:** convert `Meshy_AI_smart_ring_refined_20261031_generate.stl`
  (15 MB) → decimated, Draco-compressed `.glb`, target ~1–2 MB, saved to
  `public/models/r3-ring.glb`. Conversion via Blender headless (run behind
  `~/Developer/.machine-pressure.sh` gate). Also export a poster still
  (`public/models/r3-ring-poster.webp`).
- **Viewer:** add `@google/model-viewer` (self-contained web component), lazy-loaded
  so it never blocks first paint. Config: `camera-controls`, gentle `auto-rotate`,
  `poster`, `reveal="interaction"`, honors `prefers-reduced-motion`.
- **Fallback:** if WebGL is unavailable, show the poster image (and the existing SVG
  ring art as the ultimate fallback).

### 3.4 Data model (Supabase)

`hardware_batches`

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| name | text | e.g. "First run" |
| goal_backers | int | 250 |
| deadline | timestamptz | campaign end |
| status | text | `open` / `funded` / `failed` |
| created_at | timestamptz | |

`hardware_preorders`

| column | type | notes |
|---|---|---|
| id | uuid pk | |
| batch_id | uuid fk → hardware_batches | |
| product | text | `ring` / `bundle` |
| email | text | lowercased |
| name | text | nullable |
| amount_cents | int | from server config, never the browser |
| currency | text | |
| stripe_customer_id | text | |
| stripe_payment_intent_id | text | unique |
| status | text | `pending` / `paid` / `refunded` / `failed` |
| created_at / paid_at / refunded_at | timestamptz | |

- **RLS:** no public read/write of rows. Writes happen only inside the edge function
  (service role). The public backer count is served by the function's `count` action,
  not by a table read.
- **Grants:** explicitly grant `service_role` on both tables (new staging tables grant
  `service_role` nothing by default — Edge Functions fail silently otherwise).
- Prices live server-side (a small map in the function, or a `hardware_products`
  config row); the browser sends only the product key.

### 3.5 Edge function `supabase/functions/hardware-preorders/index.ts`

Mirrors [`guardian-payments`](../../../supabase/functions/guardian-payments/index.ts):

- Same Stripe client + the **`ALLOW_LIVE_PAYMENTS` guard** (live keys rejected unless
  explicitly enabled) → Staging can never take real money by accident.
- `action: "intent"` — validate email, resolve product price **server-side**, create
  (or reuse) a Stripe customer, create a full-amount `PaymentIntent`, insert a
  `pending` `hardware_preorders` row, return `client_secret` + amount.
- `action: "confirm"` — retrieve the PaymentIntent, reconcile status, mark the row
  `paid` (conditional write, idempotent — same pattern as `markFromIntent`).
- **Stripe webhook** (`stripe-signature`) — `payment_intent.succeeded` /
  `payment_failed` keep rows in sync; reconcile against the live intent (events can
  arrive out of order).
- `action: "count"` — **public, no PII**: returns `{ paid, goal, deadline, status }`
  for the batch, for the `BackerBar`. Counts `status = 'paid'` rows.

### 3.6 Frontend checkout

- Reuse the Guardian Stripe Elements / client-secret pattern
  ([`guardianCheckoutSession.ts`](../../../src/utils/guardianCheckoutSession.ts),
  `guardianStripe.ts`) — a `hardware` equivalent for session recovery and return-URL
  handling. Never store card data or client secrets beyond the session.
- On confirmed payment: show success, re-fetch `count`, animate the bar.

## 4. Error handling

- Payment: surface Stripe decline / network errors inline in the form; `pending` rows
  are reconciled by webhook + `confirm`, so an interrupted return still resolves.
- `count` failure: the bar degrades to a static "Reserve yours" state rather than
  blocking the page.
- 3D viewer failure (no WebGL / asset 404): poster image, then SVG fallback.
- Live-key-on-wrong-env: function returns 503 (`ALLOW_LIVE_PAYMENTS` guard).

## 5. Testing (TDD)

- **Server** (mirror [`guardianPaymentServer.test`](../../../src/utils/__tests__/guardianPaymentServer.test.ts)):
  `intent` creates intent + pending row and uses the server price (ignores a browser
  price); `confirm` marks paid idempotently; webhook reconciles; `count` returns
  paid/goal and never leaks PII; live-payment guard returns 503.
- **Component:** `PreorderBlock` / `BackerBar` states — idle, product switch, loading,
  success (bar increments), error.
- **Manual on Staging:** Stripe test card → confirm row `paid`, bar increments; verify
  the `ALLOW_LIVE_PAYMENTS` guard blocks a live key.

## 6. Open items for the owner

- Confirm final device **names** (Ring/Clip vs the live site's Note/Heart).
- Confirm the campaign **deadline** date for the batch.
- Confirm **ship window** copy and refund terms (worth a counsel check before go-live).
