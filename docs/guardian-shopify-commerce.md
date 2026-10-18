# Guardians selling their own products: Shopify commerce options

*Research as of 2026-10-17. Proposal only: nothing here has been built, and no Stripe or live keys were touched. Figures marked **(unverified)** came from secondary sources, or from pages that served non-US pricing. Confirm them before committing.*

## The ask

Guardians want to list **their own products** (most already have a Shopify store) and sell them through ROUTINE³. ROUTINE³ takes a commission. Mobile users should be able to buy Protocols and products in **one tap**.

Today ROUTINE³ sells Guardian *offers* (digital) with Stripe Checkout on its own account (`src/utils/guardianStripe*`, with staging and live keys kept separate). Kits ("Shop the Kit") live in `protocol_kits` / `protocol_kit_items`. The mobile app already ships RevenueCat (`react-native-purchases` in `AI-Health-Scan_Mobile/package.json`).

## Recommendation in one paragraph

**Let the Guardian's own Shopify checkout sell the physical products.** ROUTINE³ shows them inside Protocols and the app, and takes its commission as **Shopify App Pricing usage charges**, which Shopify bills on the Guardian's own invoice. The vehicle is a public Shopify **sales-channel app**. Before that app exists, start with plain **cart-permalink links** plus a commission agreement. **Don't** charge customers on ROUTINE³'s Stripe account and then write the orders into Shopify as "paid": Shopify's app rules forbid bypassing its checkout. **Protocols** are digital, so in the app they must use **IAP** through the existing RevenueCat setup. On the US storefront the app may also link out to the existing Stripe web checkout, where Apple's commission is currently 0%. That 0% is under legal challenge.

---

## 1. Shopify routes

| Option | What it enables | How ROUTINE³ earns | Merchant of record | Fees | Effort | Key risks |
|---|---|---|---|---|---|---|
| **A. Public Shopify app (catalog sync)** | OAuth install on many Guardians' stores. Imports products and inventory and keeps them current via webhooks | Nothing by itself | n/a | $19 one-time Partner fee. 0% Shopify share on the first $1M of app revenue, then 15% | M | App review. Order and customer data needs protected-data approval |
| **B. Sales-channel app + cart permalinks / Checkout Kit** ★ | Guardian products inside Protocols and the app. Checkout runs on the Guardian's Shopify and the order lands in their admin, attributed to the channel | **Usage charges** (commission on sales) through App Pricing, billed by Shopify | **Guardian** | Shopify's revenue share on ROUTINE³'s app revenue. The Guardian pays their own gateway fees | M–L | Shopify expects "several hundred" merchants in year 1. One checkout per Guardian. Checkout Kit is not yet GA |
| **C. Affiliate / Shopify Collabs** | Tracked links and discount codes | Affiliate commission | Guardian | Collabs: 2.9% fee on payouts. Affiliate apps: about $0–$249+/mo plus 1–3% **(unverified)** | S | Each Guardian installs and pays for an app. Collabs is US/UK/CA only. Attribution leaks |
| **D. Shopify Collective (ROUTINE³ as retailer)** | ROUTINE³ runs its own Shopify store that resells Guardians' products as "supplier" items | Retail minus wholesale margin (typically 20–50%) | ROUTINE³ | Free | S–M | Supplier and retailer must share country and currency. Supported countries not verified for the EU |
| **E. Stripe Connect + push "paid" orders into Shopify** | One ROUTINE³ cart across Guardians and one-tap Apple Pay | `application_fee_amount` | Platform (destination charge) or Guardian (direct charge / `on_behalf_of`) | Card fees plus Connect fees **(unverified US)** | L | **Breaks Shopify App Store requirement 1.1.2.** ROUTINE³ carries refunds and chargebacks for goods it never handles |

★ = recommended end state.

### A. Custom vs public app

- **Custom distribution won't scale.** A custom-distribution app installs on one store (or one Plus organization), and you can't change the distribution method later. Selling to many Guardians needs **public distribution**, which means App Store review. Public distribution is also the only route to Shopify App Pricing / the Billing API. [Select a distribution method](https://shopify.dev/docs/apps/launch/distribution/select-distribution-method)
- **No more admin-built apps.** Since 2026-01-01, merchants can't create new legacy custom apps in their admin. [Shopify Help](https://help.shopify.com/en/manual/apps/managing-apps), [announcement](https://community.shopify.dev/t/starting-january-1-2026-you-will-not-be-able-to-create-new-legacy-custom-apps-this-will-not-impact-any-existing-apps/26798)
- **Scopes:**
  - `read_products`, `read_inventory`
  - `read_product_listings` and `read_publications` / `write_publications` for sales-channel feeds
  - `write_orders` covers only the last 60 days; `read_all_orders` needs approval
  - Order and customer fields are protected customer data and need Shopify's approval
  - [Access scopes](https://shopify.dev/docs/api/usage/access-scopes)
- **Keeping data current:**
  - Webhooks: `products/update`, `inventory_levels/update`, `orders/create`
  - Sales channels use Contextual Product Feeds (`productFullSync` plus feed webhooks) — [Sales channels](https://shopify.dev/docs/apps/build/sales-channels)
- **Fees:** $19 registration. Developers keep 100% of the first $1M lifetime app revenue (counted from 2025-01-01), then pay 15%. [Revenue share](https://shopify.dev/docs/apps/launch/distribution/revenue-share)

### B. Sales-channel app (recommended end state)

- **Eligibility:**
  - ROUTINE³ owns a destination outside the online store and sends customers on to a sale.
  - Shopify expects several hundred merchants in year one.
  - Every sales channel goes through review.
  - [Sales channels](https://shopify.dev/docs/apps/build/sales-channels)
- **How checkout works:** customers finish on the **Guardian's Shopify checkout**, through cart permalinks or the Storefront API. The Guardian is merchant of record, gets paid through their own gateway, handles fulfilment, and sees the order in their admin with channel attribution.
- **The lightest path:** an app that only uses cart permalinks needs no pre-approval and no PPA Addendum. It still has to pass the general app checklist (same page).
- **Commission:** a recurring subscription, or a commission on sales reported as **App Pricing usage events**. Shopify bills these on the Guardian's invoice, so ROUTINE³ never holds customer money (same page).
- **Why this model and not a "marketplace" app:** requirement 1.1.6 bars apps that turn stores into classifieds-style marketplaces, and points marketplace platforms to the sales-channel route. [App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)

### Storefront API and Checkout Kit in the mobile app

- **How it works:**
  - The Storefront API builds a cart and returns a `checkoutUrl`.
  - **Checkout Kit** shows the Shopify checkout natively in the app, including Apple Pay through Accelerated Checkouts, and reports completed, failed and cancelled checkouts back to the app.
  - SDKs exist for Swift, Android and React Native (`@shopify/checkout-kit-react-native`).
  - [Mobile storefronts](https://shopify.dev/docs/storefronts/mobile/about-mobile-storefronts), [Checkout Kit](https://shopify.dev/docs/agents/carts-and-checkout/checkout-kit)
- **Maturity caveat:** Checkout Kit replaces Checkout Sheet Kit and is documented as not yet GA. The older `@shopify/checkout-sheet-kit` is still documented. [RN docs](https://shopify.dev/docs/storefronts/mobile/checkout-kit/react-native)
- **Limit:** each Guardian is a separate store, so a cart can't mix two Guardians' products. A Protocol that combines products from several Guardians needs one checkout per Guardian.

### C. Affiliate apps and Shopify Collabs

- **Shopify Collabs:**
  - Free app. The merchant pays a 2.9% fee on commission payouts.
  - Payouts go through PayPal Hyperwallet twice a month, with a $25 minimum.
  - The open program is US, UK and Canadian creators only.
  - [Merchant payments](https://help.shopify.com/en/manual/promoting-marketing/collabs/merchants/payments), [creator payments](https://help.shopify.com/en/manual/promoting-marketing/collabs/creators/payments)
  - It's built for individual creators, which makes it a poor fit for an EU-first platform acting as one affiliate across many brands.
- **Third-party affiliate apps (UpPromote, Refersion, Social Snowball):** roughly $30–$250/mo plus 1–3% on referred sales **(unverified)**:
  - [UpPromote](https://www.capterra.co.uk/software/201885/shopify-affiliate-marketing)
  - [Refersion](https://www.referly.so/pricing/refersion-pricing)
  - [Social Snowball](https://ainfluencer.com/social-snowball/)
- **The structural problem:** with affiliate apps, each Guardian installs and pays for an app, and ROUTINE³ collects from every merchant separately. A sales channel centralises billing.

### D. Shopify Collective

- **How it works:** ROUTINE³ would run a Shopify store as the "retailer" and import Guardians' products as "suppliers". Orders route to the supplier, who is paid after shipping. ROUTINE³ keeps the retail-minus-wholesale margin.
- **Constraints:**
  - Free on all plans.
  - Both stores must be in the same country and currency.
  - Suppliers must be active on the Shop app.
  - [Shopify Collective](https://help.shopify.com/en/manual/online-sales-channels/shopify-collective)
- **Open question:** supported countries are not verified as current, and coverage may be US/CA only. That matters for the EU-first plan, so check before choosing this.

---

## 2. Stripe Connect alternative (ROUTINE³ charges, Guardian fulfils in Shopify)

The idea: import product data from Shopify, charge the customer on ROUTINE³'s Stripe with an application fee, then create the order in the Guardian's Shopify so fulfilment and inventory stay there.

| | Direct charge + `application_fee_amount` | Destination charge (± `on_behalf_of`) | Separate charges & transfers |
|---|---|---|---|
| Business of record / statement descriptor | Guardian | Platform, or the Guardian with `on_behalf_of` | Platform (unless `on_behalf_of`) |
| Refunds / chargebacks hit | Guardian's balance | **Platform** (recover by reversing the transfer) | Platform |
| Fits | SaaS-style | One seller per cart | Multi-seller carts; splitting to several parties (Guardian + partner) |

Source: [Connect charge types](https://docs.stripe.com/connect/charges). Stripe now steers new platforms away from direct charges on legacy Express/Custom accounts and towards v2 accounts.

**Why we shouldn't do this:**

- **It breaks Shopify's rules.** App Store requirement **1.1.2** bars apps that bypass Shopify checkout or payment processing, or that register such transactions through the API ([requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements)).
  - An app was rejected for creating orders and marking them paid outside checkout, and Shopify staff say custom apps are "not exempt" ([thread](https://community.shopify.dev/t/how-to-avoid-bypassing-shopify-checkout/15298)).
  - Orders "marked as paid" also skip Shopify's third-party-gateway transaction fee (2% / 1% / 0.6% / 0.2% by plan — [pricing](https://www.shopify.com/pricing)). That is exactly what reviewers look for.
- **ROUTINE³ would carry the seller's liabilities.** On destination charges ROUTINE³ is merchant of record. It would carry consumer-law obligations, returns and chargebacks for goods it never touches, plus marketplace tax exposure:
  - Stripe Tax costs 0.5% per transaction on no-code integrations ([pricing](https://stripe.com/tax/pricing)).
  - Marketplace-facilitator and EU deemed-supplier rules need an advisor ([Stripe Tax for Connect](https://docs.stripe.com/tax/connect)).
- **Connect fees** **(unverified US — the pages served PLN pricing):**
  - "Stripe handles pricing" mode adds no platform fees ([Connect pricing](https://stripe.com/connect/pricing)).
  - "You handle pricing" mode is reported at about $2 per monthly active account plus 0.25% + $0.25 per payout ([secondary](https://drop-desk.com/blog/guides/stripe-fees-for-marketplace-operators/)).

**Where Connect still fits:** the Guardian's *digital* offers sold on the web, which already run through ROUTINE³'s Stripe. Connect would let each Guardian be paid out automatically, with ROUTINE³'s cut taken as an application fee. That is a separate decision from Shopify products.

---

## 3. Mobile one-tap purchase: store rules

### Apple ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/))

- **Physical goods (3.1.3(e)):** must **not** use IAP. Apple Pay or card entry is correct, via Stripe's RN SDK (`PlatformPayButton`) or Shopify Checkout Kit's Apple Pay. [Stripe Apple Pay](https://docs.stripe.com/apple-pay?platform=react-native)
- **Digital content unlocked in the app (3.1.1):** must use IAP, and Protocols count as digital content.
  - The "reader app" exception (3.1.3(a)) covers magazines, news, books, audio, music and video, so it almost certainly doesn't cover Protocols.
  - Under 3.1.3(b) (multiplatform), content bought on the web can be used in the app **only if it is also offered as IAP**.
- **US storefront:** the guidelines now allow buttons and external links to web purchase with no entitlement. The court timeline:
  - 2025-04-30: the district court barred any commission on link-outs.
  - 2025-12-11: the 9th Circuit upheld the contempt finding but vacated the total ban, and sent the case back so the district court can set a "reasonable" fee ([opinion](https://law.justia.com/cases/federal/appellate-courts/ca9/25-2935/25-2935-2025-12-11.html), [Fenwick summary](https://www.fenwick.com/insights/publications/ninth-circuit-largely-upholds-ruling-in-epic-v-apple)).
  - 2026-06-30: the Supreme Court took the case (No. 25-1311), limited to the contempt question ([report](https://daringfireball.net/linked/2026/06/30/scotus-apple-epic)).
  - Status: the link-out commission is **reportedly still 0%** ([secondary](https://tiun.io/blog/ios-external-payments-us-cost-2026)). **Plan for a future non-zero fee.**
- **EU** (Attachment 14 terms from 2026-10-01) ([Apple EU](https://developer.apple.com/support/apps-in-the-eu/)):
  - In-app alternative payments: 20% (10% small business).
  - Link-outs: 15% (10% small business) on purchases within 7 days.
  - The small-business IAP rate is reported inconsistently **(unverified)**.
- **IAP commission:** 15% under the Small Business Program (under $1M proceeds); 30% standard. [Small Business Program](https://developer.apple.com/app-store/small-business-program/)

### Google Play ([Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738))

- **Which billing applies:** digital goods must use Play Billing; physical goods must **not**.
- **US external links:** allowed under the External Content Links program. Fees apply to purchases within 24h of a link tap (10%/20%), plus a per-install fee, with reporting from 2026-10-01 ([program](https://support.google.com/googleplay/android-developer/answer/16470497)). Enforcement is contested under the Epic injunction **(unverified)**.
- **Play Billing rates:** a June 2026 change reportedly set 10% on the first $1M, then 20% ([secondary](https://www.stash.gg/blog/googles-lower-fees-announcement-june-2026-whats-really-going-on-and-what-us-developers-should-do)) **(unverified — check Play Console)**.

### What this means for ROUTINE³

| Purchase | iOS | Android | Web |
|---|---|---|---|
| **Protocol (digital)** | IAP via RevenueCat. US: may add a "Buy on web" link to existing Stripe Checkout | Play Billing via RevenueCat. US: external link program | Existing Stripe Checkout |
| **Guardian product (physical)** | Shopify Checkout Kit (Guardian's checkout, Apple Pay) or a cart-permalink web view | Same | Cart permalink to the Guardian's checkout |

- **One entitlement record, three stores:** keep a single Supabase entitlement per Protocol. IAP (RevenueCat webhook) and web Stripe purchases both write to it, which is what makes web-bought Protocols usable in the app under 3.1.3(b).
- **"One tap" really means one tap per store:** a Protocol plus its kit is two purchases. The Protocol goes through IAP or the web; the kit goes through the Guardian's Shopify. Unifying them would require ROUTINE³ to become merchant of record for the products (Option E), which we are not recommending.

---

## 4. Commission sharing and reporting

- **Barbara O'Neill's share:** her terms are 30% of sign-ups for 6 months plus 15% on the branded line. Define both on **net receipts**: after Apple/Google commission, refunds and payment fees. Otherwise IAP sales can produce a negative margin.
- **Splitting a Stripe charge three ways:** one destination charge pays exactly one connected account. Splitting a sale between a Guardian and a partner needs separate charges & transfers, or a periodic transfer from ROUTINE³'s balance. [Connect charges](https://docs.stripe.com/connect/charges)
- **Shopify-side commission:** it arrives as Shopify app payouts, so partner shares on product sales come out of ROUTINE³'s app revenue.
- **EU DAC7:** platforms must report sellers' sales. Stripe offers platform tax reporting in preview ([docs](https://docs.stripe.com/connect/platform-tax-reporting)). If the sale closes on the Guardian's own Shopify checkout, ROUTINE³'s DAC7 position is unclear. **Advisor item.**

---

## 5. Phased plan

| Phase | Scope | Effort | Outcome |
|---|---|---|---|
| **0. Protocols in the app** | IAP for paid Protocols through the existing RevenueCat integration. US iOS "Buy on web" link to the existing Stripe Checkout. One Supabase entitlement table written by both. O'Neill's share defined on net receipts | S–M | Protocols purchasable everywhere, compliant on both stores |
| **1. Guardian products, manual** | Guardian pastes Shopify product links (or a store URL plus product handles) into a ROUTINE³ "My products" list. Products are shown on Protocols and in the app. Buy opens a **cart permalink** to the Guardian's checkout with a ROUTINE³ UTM tag and discount code. Commission is invoiced monthly from the Guardian's order export under a simple agreement | S | Live with the first Guardians in weeks. No Shopify app review. Validates demand |
| **2. Shopify sales-channel app** | Public app: OAuth, `read_products` / `read_inventory` / `read_product_listings`, product feeds and webhooks for automatic sync. Usage-charge commission through App Pricing. Checkout Kit in React Native for native one-tap checkout with Apple Pay | M–L | Automatic catalog and commission. The Guardian stays merchant of record, so there is no 1.1.2 conflict |
| **3. Optional: Connect for Guardian digital offers** | Move Guardian-owned digital offers to Stripe Connect so Guardians are paid out automatically and ROUTINE³ takes an application fee | M | Removes manual payouts for digital sales |

**Avoid:** Option E (ROUTINE³ charges, then registers "paid" orders in Shopify) unless Shopify Partner Support approves it in writing.

**Re-check quarterly:**
- The Epic v. Apple Supreme Court ruling and the remand fee.
- Google's US external-link fee enforcement.
- Apple's EU Attachment 14 rates.
- Stripe Connect and Tax US pricing.

## Proposed next step (for approval)

Approve **Phase 1** as a small build on the website and mobile app:

- A `guide_products` table: Guardian, Shopify store domain, product handle/variant, title, price, image and a commission % set by agreement.
- A "My products" section in the Guardian workspace.
- A "Shop" block on the Protocol page and in the app that opens the cart permalink.
- **In parallel, the business side:** draft a one-page commission agreement for Guardians and ask Shopify Partner Support two questions:
  1. Whether an unlisted/limited public app is available while we are below "several hundred" merchants.
  2. Whether Shopify Collective is available to EU stores.

Nothing in Phase 1 touches Stripe or payment keys.

## Phase 1 build status (2026-10-18)

Built on the website (branch `claude/cool-williams-2b3520`):

- **Database:** `supabase/migrations/20261018130000_guide_products.sql` adds `guide_products` and `guide_product_protocols`, with RLS:
  - Guardians manage their own products.
  - The public reads published products of approved Guardians.
  - Only admins and the service role set `commission_percent`.
  - **Not applied yet:** apply to staging first.
- **Workspace:** Offers → **My products**. Paste a Shopify product link and **Fetch from Shopify** fills name, variants, price, currency, image and description from the store's public `/products/<handle>.js` and `/meta.json`, which are CORS-open on standard Shopify stores. Headless stores need manual entry. Products can be attached to Protocols, given a discount code, and published.
- **Public site:** a **Shop** section on `/guardians/<slug>` (hidden when empty).
- **Links:** `src/utils/guideProducts.ts`:
  - With a variant: cart permalink `/cart/<variant>:1?discount=…&ref=routine3&attributes[routine3_guardian|protocol|medium]=…&utm_*`.
  - Without a variant: the product page, through `/discount/<code>?redirect=…` when there is a code.
- **Commission:** the rate is `coalesce(product.commission_percent, guide_profiles.commission_percent)` (default 15%). Invoicing is manual, from the Guardian's Shopify orders filtered by referral code `routine3` or the discount code.

Not built yet:

- **Mobile app:** the in-app Shop block, proposed as its own session in the mobile repo.
- **Click tracking:** there are no click-tracking or order-import tables; attribution relies on Shopify's own order data.
