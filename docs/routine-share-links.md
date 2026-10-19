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
| Tests | `src/utils/__tests__/routineShare.test.ts`, `routineLanding.test.ts`, `routineAasa.test.ts` |

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
7. **Not included in a redeem:** child plans attached to a master routine through `protocol_children` (Diet and Fitness plans), and
   `builder_config`. A shared master routine clones as its own items only. Say so in the prompt, or extend the function.
