# Routine share links: a Guardian's routine opens in the R³ app

Status 2026-10-20: website and staging-database half built in this PR. **Nothing is applied to any database yet.** The migration
waits for John's approval (staging first; production is the mobile app's project and is a separate approval).

## What the visitor gets

1. A Guardian (or any routine owner) presses **Share routine link** on a routine, or on an offer that delivers one. The database
   mints a 128-bit token for that routine. The Guardian gets `https://routine3.com/routine/<token>`, a copy button and a QR.
2. The Content builder can point a post's QR and link at it (**QR and link go to: Routine in the app**).
3. With R³ installed, iOS opens the link in the app (the association file claims `/routine/*`). The app redeems the token and
   offers a copy of the routine, although the routine is not public.
4. Without the app, `routine3.com/routine/<token>` shows the routine's name, a **Get R³ on the App Store** button and an
   **open in R³** button (`healthscan://routine/<token>`).

The routine stays unlisted. The token is the permission (John, 2026-10-03). The routine's id never appears in a link.

The link is also **affiliate-trackable**: the Guardian is credited when someone opens it, installs R³ and adds the routine
(see Attribution below). Credit comes from the token itself; nothing in the URL is needed for it.

## What is in this PR

| Piece | Where |
|---|---|
| Migration (staging first) | `supabase/migrations/20261020153000_routine_share_links.sql` |
| Dry run with role tests, rolled back | `scripts/routine-share-links-dryrun.sh` (builds the SQL), `.head.sql`, `.tests.sql` |
| Link builder + RPC wrappers | `src/utils/routineShare.ts` |
| Share panel (copy, QR, stop sharing) | `src/components/guides/RoutineShareLink.tsx`, mounted in the open-protocol editor |
| Offer → routine link + share panel | `src/components/guides/OfferRoutineLink.tsx`, under each card in Offers → Created offers |
| Content builder choice, `qrLink` | `ContentBuilder.tsx`, `ContentStudio.tsx` (`qrLink`), `VideoStudio.tsx` (`pageUrl`) |
| Landing page | `public/routine/index.html` |
| Routing, headers, CSP | `netlify.toml`, guarded by `scripts/check-routes.mjs` (runs in `prebuild`) |
| Universal link claim | `public/.well-known/apple-app-site-association` (`/routine/*`) |
| Tests | `src/utils/__tests__/routineShare.test.ts`, `routineLanding.test.ts`, `routineAasa.test.ts`, `routineShareUi.test.tsx` |

## Database contract (for the mobile app)

`protocol_share_links` has row-level security on, **no policy, and no privilege for `anon` or `authenticated`**. This project's
default privileges would otherwise grant them full DML on a new table, so the migration revokes it explicitly; it also grants
`service_role` explicitly (it gets nothing by default). Everything goes through `SECURITY DEFINER` functions
(`search_path = public, pg_temp`), each with its `EXECUTE` grant spelled out.

| Function | Who | Returns |
|---|---|---|
| `create_routine_share_link(p_protocol_id uuid)` | `authenticated`, owner of the routine only | the 32-hex token; reuses the live one |
| `get_routine_share_link(p_protocol_id uuid)` | owner only | the live token or `null`; never creates |
| `revoke_routine_share_link(p_protocol_id uuid)` | owner only | `true` if a live link was switched off |
| `routine_share_preview(p_token text)` | `anon`, `authenticated`, `service_role` | `{name, description, creator}` or `null` (never an error) |
| `redeem_routine_share(p_token text)` | `authenticated` | `{protocol, items}` (below), or raises `P0002` |

Errors: `28000` not signed in; `P0002` "routine not found" (same message for "no such routine" and "not yours") and "share link not found"
(same message for unknown, malformed and revoked); `42501` when a role may not call the function at all.

`redeem_routine_share` returns a snapshot:

```
{ "protocol": { id, name, description, type, image_url, source_attribution, creator, category, tags, total_days,
                frequency, frequency_days, start_time, phases, nutrition_cycle_days, fitness_cycle_days, is_owner },
  "items": [ <every protocol_items row of the routine, minus created_by, profile_id, activity_session_id> ] }
```

Items are ordered `week_number, day_number, scheduled_time, sort_order, id` and keep `id`, `protocol_id` and
`parent_protocol_item_id`, which a clone must remap. Tokens are matched case-insensitively (a QR may be upper-cased).

### Where this differs from the mobile draft (`20261005100000_routine_share_links.sql`)

- The draft let the owner `INSERT` rows directly (`FOR ALL`, `WITH CHECK created_by = auth.uid()`), so a signed-in user could mint a
  token for a routine they do not own and then read it. Here nobody inserts directly; `create_routine_share_link` checks ownership.
- One live link per routine (partial unique index). Revoking is a timestamp; the next create mints a new token.
- `anon` gets a preview for the landing page. The draft had no anonymous path.
- The result has `is_owner` instead of `owner_id`, so a scanner never receives the sharer's user id.
- The draft's `gen_random_bytes` is called as `extensions.gen_random_bytes` (pgcrypto lives in the `extensions` schema here).

**The mobile draft must not be applied as it stands.** Replace it with this migration (same table name, so two definitions would clash).

### Offer ↔ routine

`guide_offers` had no link to a routine (onboarding creates a routine named like the offer and records nothing). This PR adds
`guide_offer_routines (offer_id, guide_id, protocol_id)` with owner-only RLS, rather than a column on `guide_offers`: published
offers are publicly readable, so a column there would publish the routine's id. The Offers screen suggests a routine whose name
equals the offer's title.

## Attribution: crediting the Guardian

**The key is the token.** `token → protocol_share_links → catalog_protocols.user_id` is the Guardian (the routine's owner). The
link may also carry where an open came from:

```
https://routine3.com/routine/<token>?utm_source=guardian-<slug>&utm_medium=link|post|qr|…&utm_campaign=<optional>&utm_content=<optional>
```

| Where | utm_medium | What it carries |
|---|---|---|
| Share panel, "Link" and Copy | `link` | `utm_source=guardian-<slug>`, optional campaign (a field in the panel) |
| Content builder captions and posts | `post` | `utm_source=guardian-<slug>` |
| QR (panel and Content builder) | `qr` | the campaign only. The source is left out to keep the code coarse; the database fills in `guardian-<slug>` from the token |

Values are lower-cased, `a-z 0-9 . _ ~ -`, 1 to 64 characters (`utmValue` builds, `utmStrict` reads, the database checks the same rule);
anything else is dropped, and a value with an `@` is dropped whole, so an email address can never end up in a link. **No personal data
goes into any URL.**

**Hand-off to the app.** The landing page records the open, then builds the "I have R³" link from what the database returns:

```
healthscan://routine/<token>?ref=<Guardian referral code>&click=<id of the recorded open>&utm_source=…&utm_medium=…&utm_campaign=…
```

`ref` is the Guardian's existing `referral_codes` code (`create_routine_share_link` creates or reuses it via `ensure_referral_code`).
It comes from the server's answer, never from the address bar.

**Recording an open: `record_routine_share_click(p_token, p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content)`**
(anon, authenticated, service_role). Returns `{ ref, click_id, counted }`, or `null` (and writes nothing) for an unknown, malformed or
revoked token. One `affiliate_clicks` row: `provider 'guardian'`, `product_id` = the routine's id (the column is required),
`destination_url` = the template `https://routine3.com/routine/<token>` (never the token), the utm values, **IP truncated to /24
(/48 for IPv6)**, user agent (200 chars) and country from the CDN header. The raw IP is never stored. Limits: 3 counted opens per link
per 10 minutes per IP, 300 per link per hour; past a limit the open is not counted but the visitor still gets `ref`, so the hand-off
never depends on counting. The per-IP counter keeps only a salted SHA-256 hash, with a salt generated in the database that rotates daily
and is readable by nobody (a salt in this repository would be public). The owner opening their own link is not counted.

**Recording an add: `record_routine_share_add(p_token, p_cloned_protocol_id, p_click_id, p_utm_source, p_utm_medium, p_utm_campaign)`**
(authenticated). The app calls it after the clone is saved; `p_cloned_protocol_id` must be the caller's own routine. Returns
`{ added, referral_credited, click_id }` or `{ added: false, reason: 'own_routine' | 'already_added' }`.

- **Once per user per routine** (`routine_share_adds`). Not `referrals`: `referrals.referred_id` is unique per user, so a user already
  referred by someone could never appear there.
- **The click** is the one in `p_click_id` if it is this routine's and still open, else this routine's most recent open one from the last 14
  days; it is marked `converted`. The exact click is only known when the app passes the `click` id from the hand-off. After install the user
  usually re-opens the original link, which carries no click id, so the fallback is what normally applies. The add itself is always exact.
- **The credit.** If the account is under 14 days old and has no referrer yet: the same `referrals` row `record_referral_signup` writes
  (`status 'completed'`, `reward_amount` from the active `referral_settings`, currently 10 credit). An older account, or one that already has
  a referrer, is still counted as an add but earns no referral; the first referrer keeps the credit.

**What the Guardian sees: `routine_share_stats(p_protocol_id)`** (owner only): `opens`, `opens_7d`, `last_open_at`, `adds`, `adds_7d`,
`credited`, and opens and adds by medium. Counts, never people. Shown under the link in the share panel. **Opens are indicative**
(landing-page opens, plus app opens if the app calls the click function; a rate limit or a script moves them); **adds are exact.**

All three new tables (`routine_share_adds`, `routine_share_daily_salt`, `routine_share_rate`) are locked like `protocol_share_links`, and
`affiliate_clicks` was already service-role only, so no client can read opens, adds or salts; only these functions touch them.

## QR size

`https://routine3.com/routine/<token>?utm_medium=qr` is 75 characters: version 6 on error correction Q, but **version 8 on H**, where the
R³ mark cannot be drawn (it needs a version below 7). `qrPlan` in `ContentStudio.tsx` therefore draws the large mark as the medium mark
on Q for such links; the small and medium marks are unchanged. Guardian page links are unaffected.

## Decisions to confirm

1. **Paid offers keep the Guardian page as the post link.** The routine link hands the routine to anyone who scans it, which would
   skip the checkout. The Content builder disables "Routine in the app" for a paid offer; the offer's own share panel still works
   and warns. Free offers and a routine shared as itself may use it.
2. **The QR encodes the lower-case `https://routine3.com/routine/<token>`**, not the upper-case `/G/` form used for Guardian pages.
   A universal-link path match is case-sensitive, so upper-casing would need `"caseSensitive": false` in the association file, which
   cannot be tested without a device. Cost: version 5 or 6 instead of 4 or 5, and the R³ mark still fits (below version 7).
3. **Preview returns name, description and creator; the page shows the name only.**
4. **Two functions instead of one:** `routine_share_preview` (anonymous, minimal) and `redeem_routine_share` (signed in, full),
   so the grants say what each is for.
5. **A Guardian is credited like a referrer.** The add writes the same row and the same reward (`referral_settings`, currently 10 credit,
   `completed`) as `record_referral_signup`. If a Guardian add should earn a different rate, say so; it is one line in
   `record_routine_share_add`.
6. **14 days.** Only an account under 14 days old can be credited, so an existing user cannot be retroactively "referred" by whatever
   Guardian link they happen to add. The existing `record_referral_signup` has no such limit. Veto = remove the check.
7. **Opens are indicative, adds are exact** (see above). The credit is based on the add.

## Apply (after approval)

```
scripts/routine-share-links-dryrun.sh /path/to/dryrun.sql   # staging dry run; ends in RAISE EXCEPTION, nothing persists
```

Then apply `20261020153000_routine_share_links.sql` to **staging** (`mofhvoudjxinvpplsytd`). Production (`ermbkttsyvpenjjxaxcf`)
is the mobile app's project and needs its own approval: the landing page already asks it second, and tolerates the function
not existing there.

## What the MOBILE repo still needs (not edited here)

1. **Decide which project holds the links, then match the app to it.** The Guardian portal writes to the project the website is
   pointed at (staging by default, `supabase-environment` in localStorage). The app has one client, `src/api/supabase/client.ts`,
   built from `SUPABASE_URL` in its env, and `redeem_routine_share` needs a signed-in user **on the project that holds the link**.
   If Guardians publish on staging but the app's users sign in on production, redeeming cannot work until the routine and link
   live where the app user is signed in. This is the one open question that is not code.
2. **Replace the unapplied draft migration** `supabase/migrations/20261005100000_routine_share_links.sql` with this migration
   (copy it in under its own version); do not apply both.
3. **Redeem and the clone prompt are not wired.** `src/features/protocol/export/routineShare.ts` says NOT WIRED and nothing calls
   it. Needed: on a `routine` link, call `redeem_routine_share(token)`; if `protocol.is_owner`, open the routine; otherwise show the
   "add a copy of this routine?" prompt and clone `protocol` + `items` into the user's own routine (remap `id` and
   `parent_protocol_item_id`; the contract is `docs/PROTOCOL_ITEMS_CONTRACT.md`). Update its `RedeemPayload` type: `owner_id` is now
   `is_owner`, and `creator`, `category`, `tags`, `total_days` and the other fields listed above are present.
4. **Resolver:** `src/services/deepLinkResolver.ts` deliberately has no `routine` entry. Add a branch that routes `routine` to the
   redeem flow, not to a table read. `parseDeepLink` already returns `{ entityType: 'routine', entityId: <token> }` for
   `https://routine3.com/routine/<token>` and `healthscan://routine/<token>`, but it does **not** check the token's shape the way it
   checks a `protocol` UUID: add a `^[0-9a-f]{32}$` test (lower-casing first) in `acceptEntity` so a bad token never reaches the RPC.
5. **Association parity.** The mobile repo keeps its own copy of the routine3.com file at
   `web/routine3.com/.well-known/apple-app-site-association`. It must gain the same `/routine/*` component as
   `public/.well-known/apple-app-site-association` here. Extend the routine3.com test (`src/utils/__tests__/routine3JoinLinks.test.ts`
   style): the entitlement is already `applinks:routine3.com`; assert `/routine/<32 hex>` is claimed, `/routine` and `/routines/x`
   are not, and every claimed `/routine/*` sample is one `parseDeepLink` opens. `universalLinks.test.ts` covers the healthscan.app
   file only (`web/healthscan.app/...`) and needs no change unless that file should claim the path too.
6. **After a signed-out scan:** the app must keep the token across sign-in or sign-up and redeem it afterwards, as `/join/<token>`
   does for guardian invites.
7. **Attribution calls.** Read `click`, `utm_source`, `utm_medium`, `utm_campaign` (and `ref`, informational) from the link, and keep them
   with the token across install and sign-up.
   - Opened **directly** (universal link, no landing-page visit, so no `click` yet): call `record_routine_share_click(token, utm_source,
     utm_medium, utm_campaign, utm_content)` once. It returns `{ ref, click_id, counted }`. Opened through the landing page's hand-off
     (`click` present): do not call it again.
   - After the clone is saved: call `record_routine_share_add(token, <the user's new routine id>, <click id or null>, utm_source, utm_medium,
     utm_campaign)`. It is idempotent; a failure must not block the clone, retry later. It returns `{ added, referral_credited, click_id }`.
   - **Do not call `record_referral_signup` for a share link.** It credits at signup, whether or not the routine is ever added;
     `record_routine_share_add` does the crediting, once, and only for a new account.
8. **Not included in a redeem:** child plans attached to a master routine through `protocol_children` (Diet and Fitness plans), and
   `builder_config`. A shared master routine clones as its own items only. Say so in the prompt, or extend the function.
9. **Payload size.** `redeem_routine_share` returns one JSON value with every column of every item (including nulls). The staging fixture
   routine has 244 items; see the dry-run note for its size. PostgREST's row cap does not apply to a single value, but if size matters on a
   phone, `jsonb_strip_nulls` would cut it (the clone then treats a missing key as null).
