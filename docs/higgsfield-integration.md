# Guardian videos with Higgsfield

Researched 2026-10-18 from Higgsfield's public docs, help centre and Terms of Use. No account, login or credentials were used. Every claim below has a source; the full notes, verbatim JSON and a per-model table are in [higgsfield-research-notes.md](higgsfield-research-notes.md).

## Short answer

- **No "log in with Higgsfield" for the REST API.** It uses a per-account **API key ID + secret**. A Guardian connects by pasting both. The only OAuth path is Higgsfield's MCP server, which is meant for AI agents and spends subscription credits. It is not a web-app login.
- **The API is paid separately from a Higgsfield subscription.** It runs on a prepaid USD API balance (minimum top-up $5, credits expire after a year). A Guardian with a Higgsfield subscription still has to add API balance.
- **Every video is an async job:** submit → `request_id` → poll the status endpoint, or receive a webhook → `video.url`.
- **9:16, 1:1 and 16:9 are native. 4:5 is not offered by any Higgsfield video model.** We render 4:5 at 3:4 where the model supports it, otherwise at 9:16. Instagram's feed shows both as 4:5.
- **Terms risk:** Higgsfield keys are "issued for your use only" (ToS §11.3). The terms don't say whether a user may let a third-party service hold their key. **This needs a legal check, or written OK from Higgsfield, before going live.**

## 1. Authentication and connecting an account

| Question | Finding | Source |
|---|---|---|
| Credential | Key ID + secret pair, created in the Higgsfield console | https://docs.higgsfield.ai/docs/authentication.md |
| Header | `Authorization: Key {key_id}:{key_secret}`. **Bearer is not supported.** Legacy `hf-api-key` / `hf-secret` headers still work. | same; https://docs.higgsfield.ai/docs/help/faq.md |
| Where | Server-side only: "Do not call the API directly from browser or mobile application code" | https://docs.higgsfield.ai/docs/authentication.md |
| Where users create keys | console.higgsfield.ai, which today redirects to open.higgsfield.ai. The secret is shown once. | https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api |
| OAuth for the REST API | None documented: no OAuth app registration and no scopes | https://docs.higgsfield.ai/docs/llms.txt |
| Delegated access | MCP server `https://mcp.higgsfield.ai/mcp` uses OAuth and spends the user's **plan** credits. Needs a paid subscription and an MCP client. | https://higgsfield.ai/creator-hub/help-center/mcp-cli/what-is-higgsfield-mcp |
| Billing | API balance and subscription credits are separate and don't mix | https://higgsfield.ai/blog/ai-video-api-pricing-vs-subscriptions |

**So a third-party app can act on a user's account only by holding that user's API key pair.** For ROUTINE³, the Guardian pastes their key ID and secret once, and our server stores and uses them.

## 2. Video endpoints

Base URL `https://api.higgsfield.ai`. Submit with `POST /{endpoint_id}` and a model-specific JSON body. An optional `Idempotency-Key` header makes retries safe. Source: https://docs.higgsfield.ai/docs/openapi.json, https://docs.higgsfield.ai/docs/concepts/idempotency.md

| Model (what we offer) | Text-to-video | Image-to-video | aspect_ratio | Duration |
|---|---|---|---|---|
| Kling 3.0 Standard (default) | `kling-video/v3.0/std/text-to-video` | `kling-video/v3.0/std/image-to-video` (follows the image) | 16:9, 9:16, 1:1 | 3–15 s |
| Wan 2.7 | `wan/v2.7/text-to-video` | `wan/v2.7/image-to-video` | 16:9, 9:16, 1:1, 4:3, 3:4 | 2–15 s |
| Seedance 2.0 | `bytedance/seedance-2.0/text-to-video` | `bytedance/seedance-2.0/image-to-video` | 16:9, 4:3, 1:1, 3:4, 9:16, 21:9 | 4–15 s |

Source pattern: `https://docs.higgsfield.ai/docs/models/<family>/<workflow>.md`, e.g. https://docs.higgsfield.ai/docs/models/kling-3/standard-text-to-video.md. Image-to-video needs a **public HTTPS** `image_url`; local files go through `POST /files/generate-upload-url` first (https://docs.higgsfield.ai/docs/concepts/file-uploads.md). Veo, Sora and DoP are not in the current API catalog (https://docs.higgsfield.ai/docs/models/video-generation.md).

`POST /estimate/{endpoint_id}` with the same body returns a cost quote without generating anything (https://docs.higgsfield.ai/docs/concepts/billing-and-retention.md). We use it to check a key when the Guardian connects.

## 3. Jobs, polling and webhooks

- Submit returns `{ "status": "queued", "request_id", "status_url", "cancel_url" }` (https://docs.higgsfield.ai/docs/concepts/requests.md).
- Status: `GET /requests/{request_id}/status`. It returns 404 when the request belongs to another account. Values are `queued`, `in_progress`, `completed`, `failed`, `nsfw`, `canceled`; the last four are terminal. A finished video is at **`video.url`**. Same source.
- Poll starting at 2 s, backing off to 10 s, with jitter (https://docs.higgsfield.ai/docs/concepts/polling.md).
- Cancel: `POST /requests/{id}/cancel`, only while queued.
- Webhook: add the `?hf_webhook=<url>` query param on submit. It fires on completed, failed and nsfw, and puts the video at `payload.video.url`. **No signature is documented**, so a webhook body can't be trusted and has to be re-checked against the status endpoint (https://docs.higgsfield.ai/docs/how-to/webhooks.md).

## 4. Output

- MP4. Resolution and duration depend on the model (1–30 s, 360p–4K) (see the notes table).
- Aspect ratios for our four formats:
  - **9:16:** native.
  - **1:1:** native.
  - **16:9:** native.
  - **4:5:** not available. We use 3:4 (Wan, Seedance) or 9:16 (Kling) and preview it in a 4:5 frame.
- **Results are kept "for at least seven days"** (https://docs.higgsfield.ai/docs/concepts/billing-and-retention.md), so we copy each finished video into our own storage.

## 5. Pricing and limits

- Billed per second of output from the API balance. Kling 3.0 Standard at 720p with audio off is **$0.084/s**, so a 5 s clip is about $0.42 (https://higgsfield.ai/blog/ai-video-api-pricing-vs-subscriptions, prices checked 2026-10-14). The docs have no price table; live prices are in the console.
- Failed, NSFW and cancelled-while-queued jobs are refunded (https://docs.higgsfield.ai/docs/concepts/billing-and-retention.md).
- The limit is **concurrency** per account and model. Going over it returns `400 "Maximum number of concurrent requests (N) has been reached"`, with no `Retry-After` header (https://docs.higgsfield.ai/docs/concepts/rate-limits.md). A low balance returns 403 (https://docs.higgsfield.ai/docs/concepts/errors.md).

## 6. Terms on third-party use

From https://higgsfield.ai/terms-of-use-agreement, Section 11 "Developer Access":

- **§11.3:** keys are "issued for your use only". They must not be shared, sold or embedded in client-side code.
- **§11.5:** you are responsible for your End Users. No sublicensing or reselling, and no "pass-through or service bureau" use without independent value.
- **§4.4:** Higgsfield doesn't claim ownership of outputs, and commercial use is allowed. Higgsfield may train on content unless there's an Enterprise agreement.
- **§5.1(iii), §5.2(iv):** outputs may not be used to build a competing product or to train other models.

What this means for us:

- **Bring-your-own-key** (each Guardian uses their own key, for their own content, through our app) seems to fit "your use only" and adds independent value: prompts built from their brief and brand, plus storage. But the terms don't address it.
- **A platform key** (ROUTINE³ pays and re-bills Guardians) runs closer to "reselling" and "pass-through".
- **Get a legal read, or ask Higgsfield (Discord / partnerships), before switching on live mode.**

## Recommended design for ROUTINE³

1. **Connect with your own API key** (implemented). In the Content builder's video panel, the Guardian pastes their key ID and secret. The `higgsfield` Edge Function:
   - checks the key with the free estimate call;
   - encrypts the pair with AES-256-GCM (a server-only `HIGGSFIELD_ENCRYPTION_KEY`, with the user id as associated data so a row can't be moved to another user);
   - stores it in `guardian_higgsfield_connections`.

   Row-level security and column grants let the owner see only `key_hint` and the timestamps, never the ciphertext. Disconnecting deletes the row.
2. **Every call goes server-side.** The browser sends `generate` / `poll` to the function. The function holds the key, shapes the request (allowed models only; validated aspect, prompt length and duration) and talks to Higgsfield. Errors come back as plain messages. Logs carry only the HTTP status and Higgsfield's correlation id, never a key.
3. **Jobs are stored and polled.**
   - `guardian_video_jobs` keeps each job, so progress survives a reload and there's a history.
   - The browser polls through the function (2 s → 10 s backoff).
   - A finished video is copied into the private `guardian-videos` bucket and served as a 1-hour signed download link.
   - Polling is used instead of webhooks because webhooks are unsigned and would need re-checking anyway. Webhooks could be added later as a "check now" trigger.
4. **Spend guard** on the Guardian's own balance: at most 3 videos rendering at once and 20 a day (`HIGGSFIELD_DAILY_LIMIT`). Sound is off by default, which is cheaper, and posts usually get music on-platform.
5. **Mock mode by default.** Until `HIGGSFIELD_LIVE=true` is set on the function, it never calls Higgsfield and never spends credits. Jobs "render" for about 12 s and finish without a video, and the panel shows a **Test mode** badge. The same pattern as `ALLOW_LIVE_PAYMENTS` for Stripe.
6. **The prompt is built on the brand brief** (`src/utils/videoPrompt.ts`). It extends `imagePrompt` from `src/utils/brandBrief.ts` (the same text as ContentStudio's "Prompts for AI tools" panel), so a brand's posts and videos share:
   - the scene for the audience and the problem or goal;
   - the offer;
   - the kit's **visual language** and palette.

   Video additions:
   - a concrete moment for the topic (sleep → evening wind-down, and so on);
   - mood;
   - slow, gentle camera motion;
   - framing for the chosen format;
   - "no on-screen text" (captions and the CTA belong on-platform or in the post designer).

   The brand **voice** and words stay out, because they are about copy. The Guardian can edit the prompt. Once edited, a brief change doesn't overwrite it, and "Use suggested" restores the generated prompt.

7. **Script and text overlay, matching the image posts.**
   - **Script** (`src/utils/videoScript.ts`): a hook, two or three lines and the CTA, drafted from the brief and the brand brief. It uses one of the brand's "words to use" and drops any line containing a word to avoid. The Guardian can edit it. "Copy AI prompt for a script" gives a prompt built on `copyPrompt`, in the brand voice.
   - **Text overlay**: ContentStudio's `drawPost` with no background draws the post's text layer (headline, subline, CTA, QR, credit, logo) on a transparent canvas over the preview. It has the same 6 text styles and 4 positions as the image posts. Headline, subline and button default to the script's hook, first line and CTA, and each can be edited.
   - **Downloads**: "Download with text" records the video plus the text layer on a canvas (MediaRecorder; MP4 where the browser supports it, otherwise WebM), in real time. "Video only" downloads the plain MP4. "Text layer PNG" gives a transparent overlay for editors like CapCut.
   - **CORS caveat**: recording needs the video served with CORS headers. Our `guardian-videos` signed URLs have them. If copying to storage failed and the URL is Higgsfield's CDN, the panel says so and offers the separate downloads instead.

### Not built yet (proposed next)

- **Image-to-video from the post's background or brand imagery.** The server already supports `image_url` (public https). The panel doesn't expose it yet because the post background lives inside ContentStudio.
- Server-side burn-in (ffmpeg) for a guaranteed MP4 with text, if browser recording proves unreliable.
- Voice-over from the script (Higgsfield or another TTS) and captions timed to the script.
- Webhooks (`hf_webhook`) as a hint to re-poll sooner.
- MCP OAuth as an alternative for Guardians who have only a subscription and no API balance. This needs Higgsfield's agreement and an MCP client.
- Higgsfield's cost estimate shown in the panel before Generate.

## Plan / go-live checklist

Everything is written and tested with Supabase and Higgsfield mocked. Nothing is deployed or applied.

1. **Legal or Higgsfield sign-off** that Guardians may connect their own keys to ROUTINE³ (ToS §11.3 / §11.5).
2. **Apply the migration on Staging:** `supabase/migrations/20261018120000_guardian_higgsfield.sql`. It adds two tables with RLS and column grants, and the private `guardian-videos` bucket (200 MB, mp4).
3. **Set function secrets on Staging:**
   - `HIGGSFIELD_ENCRYPTION_KEY` = 32 random bytes, base64. Generate with `openssl rand -base64 32`. Keep it safe: losing it means every Guardian has to reconnect.
   - Optional: `HIGGSFIELD_DAILY_LIMIT` (default 20).
   - Leave `HIGGSFIELD_LIVE` unset (mock mode).
4. **Deploy:** `supabase functions deploy higgsfield --project-ref mofhvoudjxinvpplsytd`. It verifies the JWT itself and needs signed-in Guardians.
5. **Test the flow on Staging in mock mode:** connect with any well-formed key, generate, watch progress, disconnect.
6. **One real test, with the user's explicit OK:** set `HIGGSFIELD_LIVE=true` on Staging. Connect a real key with a small API balance (the $5 minimum) and generate one 5 s 9:16 Kling clip (about $0.42). Then check that the download comes from the `guardian-videos` bucket.
7. **Production:** the Guardian schema has to reach Production first. Then apply the same migration, set a **different** `HIGGSFIELD_ENCRYPTION_KEY`, deploy, and set `HIGGSFIELD_LIVE=true` when ready.
