# Higgsfield API research (raw notes, 2026-10-18)

Method: public docs only (docs.higgsfield.ai raw `.md` pages, OpenAPI file, official help center, Terms of Use, official GitHub README). No sign-up, login or credentials used.
Docs index: https://docs.higgsfield.ai/docs/llms.txt

Legend: every claim has its source URL. "UNVERIFIED" means it came only from a third-party source or could not be confirmed.

---

## 1. Authentication

- **Credential = key ID + secret pair**, created in Higgsfield Console. Source: https://docs.higgsfield.ai/docs/authentication.md
- **Header (exact):** `Authorization: Key YOUR_KEY_ID:YOUR_KEY_SECRET`. Source: https://docs.higgsfield.ai/docs/authentication.md
  - OpenAPI security scheme: `apiKey` in header `Authorization`, "Use `Key {api_key_id}:{api_key_secret}`." Source: https://docs.higgsfield.ai/docs/openapi.json
  - FAQ: "Do not use a Bearer token." Source: https://docs.higgsfield.ai/docs/help/faq.md
- **Legacy headers** `hf-api-key` and `hf-secret` are still accepted; new integrations should use `Authorization`. Source: https://docs.higgsfield.ai/docs/authentication.md
- **Server-side only:** "Do not call the API directly from browser or mobile application code." Source: https://docs.higgsfield.ai/docs/authentication.md. The TS v2 client "blocks browser use". Source: https://docs.higgsfield.ai/docs/how-to/sdk.md
- **401 body:** `{"detail": "Invalid credentials"}`. A model the account can't access may return 404, 423 or 503. Source: https://docs.higgsfield.ai/docs/authentication.md

### Env var names
| Context | Env var | Source |
|---|---|---|
| REST docs examples (convention only) | `HF_API_KEY_ID`, `HF_API_KEY_SECRET` | https://docs.higgsfield.ai/docs/quickstart.md |
| Python SDK `higgsfield-client` | `HF_KEY="key-id:key-secret"` **or** `HF_API_KEY` + `HF_API_SECRET` | https://docs.higgsfield.ai/docs/how-to/sdk.md , https://github.com/higgsfield-ai/higgsfield-client |
| Node/TS SDK `@higgsfield/client` (import `@higgsfield/client/v2`) | `HF_CREDENTIALS="key-id:key-secret"` passed to `config({ credentials })` | https://docs.higgsfield.ai/docs/how-to/sdk.md |

Note: the docs mention the npm package as `@higgsfield/client` (repo https://github.com/higgsfield-ai/higgsfield-js), not `higgsfield-js` on npm.

### Where users create keys
- Console: https://console.higgsfield.ai (docs link). As of today `console.higgsfield.ai` and `cloud.higgsfield.ai` both 301-redirect to `https://open.higgsfield.ai/` (which goes to `/explore`). Verified via HTTP probe on 2026-10-18.
- Help center: keys are generated in the console at open.higgsfield.ai; full key is shown only once. Source: https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api
- Organizations: team workspaces in the API dashboard with an account switcher. Source: https://docs.higgsfield.ai/docs/organizations.md

### API billing vs consumer subscription: SEPARATE
- "A subscription on higgsfield.ai and the API are two separate products with separate billing." API runs on its own USD balance; minimum top-up is $5. Source: https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api
- "Plan credits and API balance do not mix, and neither can be transferred into the other." Source: https://higgsfield.ai/blog/ai-video-api-pricing-vs-subscriptions
- API is pay-as-you-go (top up balance, pay per generation); invoice billing for committed-use contracts. Source: https://docs.higgsfield.ai/docs/help/faq.md
- API credits expire one year after being added. Source: https://docs.higgsfield.ai/docs/concepts/billing-and-retention.md

### OAuth / delegated access
- **REST API: no OAuth.** Only key-pair auth is documented. No "Sign in with Higgsfield", no OAuth app registration, no scopes found in the docs index. Sources: https://docs.higgsfield.ai/docs/llms.txt , https://docs.higgsfield.ai/docs/authentication.md
- **Higgsfield MCP server is OAuth:** "MCP connects through OAuth authorization, no API key is needed." URL `https://mcp.higgsfield.ai/mcp`. Uses the user's **plan credits** (consumer subscription), always deducted at standard rates; any MCP-compatible agent can connect; governed by the Developer Terms in the Terms of Use; requires a paid subscription. Source: https://higgsfield.ai/creator-hub/help-center/mcp-cli/what-is-higgsfield-mcp
  - So the only delegated-access path for a third-party app acting on a user's own Higgsfield account is the MCP OAuth connector (an MCP client), not the REST API. Whether a non-agent web app may act as an MCP client for its end users is UNVERIFIED (ToS 11.13 covers "Third-Party MCP Clients" but I found no developer OAuth client-registration docs).
- Terms of Use mention no OAuth. Source: https://higgsfield.ai/terms-of-use-agreement

---

## 2. Base URL and video endpoints

- **Base URL:** `https://api.higgsfield.ai`. Sources: https://docs.higgsfield.ai/docs/help/faq.md , https://docs.higgsfield.ai/docs/openapi.json (`servers: - url: https://api.higgsfield.ai`)
- **Endpoint pattern:** `POST https://api.higgsfield.ai/{endpoint_id}` with a JSON body specific to each model. Endpoint ID doubles as the SDK model id. Source: e.g. https://docs.higgsfield.ai/docs/models/kling-3/standard-text-to-video.md
- Old host `platform.higgsfield.ai` still responds (HTTP 405 on GET /) but current docs never use it. The old `POST /v1/image2video/dop` (DoP) endpoint is **not in current docs**; DoP does not appear in the current catalog. UNVERIFIED whether the legacy endpoints still work.
- **Optional headers:** `Idempotency-Key` (1–255 visible ASCII, UUID recommended; reuse with different params gives 422). Source: https://docs.higgsfield.ai/docs/concepts/idempotency.md
- **Cost estimate:** `POST https://api.higgsfield.ai/estimate/{endpoint_id}` with same body returns `{"credits": "1.500", "usd": "0.094"}` (illustrative). Source: https://docs.higgsfield.ai/docs/concepts/billing-and-retention.md
- **Catalog:** 84 entries (17 image, 67 video); availability depends on account. Source: https://docs.higgsfield.ai/docs/models.md
- Video families listed: Genjutsu, Seedance 2.0/2.5, Kling 2.5 Turbo/2.6/3.0/O3/Omni (+ Motion Control), Happy Horse 1.0/1.1, Wan 2.6/2.7/3.0/3.0 Prime, Cinema Studio 4.0, LTX-2.5, MiniMax H3, Hailuo 2.3, PixVerse V6, Grok Imagine Video 1.5. **No Veo, no Sora, no DoP** in the current API catalog. Source: https://docs.higgsfield.ai/docs/models/video-generation.md

### Example request (verbatim, Kling 3.0 Standard text-to-video)
Source: https://docs.higgsfield.ai/docs/models/kling-3/standard-text-to-video.md
```bash
curl --request POST \
  --url https://api.higgsfield.ai/kling-video/v3.0/std/text-to-video \
  --header "Authorization: Key ${HF_API_KEY_ID}:${HF_API_KEY_SECRET}" \
  --header "Content-Type: application/json" \
  --header "Idempotency-Key: ${IDEMPOTENCY_KEY}" \
  --data '{
  "prompt": "A slow cinematic tracking shot along a sunlit coastal road."
}'
```

### Input image
- Image-to-video takes a **public HTTPS URL** in `image_url` (some also `end_image_url` / `last_image_url`). Source: https://docs.higgsfield.ai/docs/models/kling-3/standard-image-to-video.md
- For local files: `POST https://api.higgsfield.ai/files/generate-upload-url` with `{"content_type":"image/jpeg"}` returns `public_url`, `upload_url` (presigned PUT, expires in 1 h) and `upload_headers`; then pass `public_url` as `image_url`. Supported: jpeg/jpg/png/webp/gif, wav, mp4. Source: https://docs.higgsfield.ai/docs/concepts/file-uploads.md
- Seedance i2v: "Output framing follows image_url". Source: https://docs.higgsfield.ai/docs/models/seedance-2/image-to-video.md

### Text-to-video vs image-to-video endpoints (from each page's "Complete JSON schema")
All paths are `POST https://api.higgsfield.ai/<path>`. Source pattern: `https://docs.higgsfield.ai/docs/models/<family>/<workflow>.md`

| Model | T2V path | I2V path | Required (T2V / I2V) | aspect_ratio enum (T2V) | aspect_ratio on I2V? | duration (s) | resolution |
|---|---|---|---|---|---|---|---|
| Kling 3.0 Std | `kling-video/v3.0/std/text-to-video` | `kling-video/v3.0/std/image-to-video` | none listed / `image_url` | 16:9, 9:16, 1:1 (def 16:9) | no field | 3–15 (def 5) | not settable |
| Kling 3.0 Pro | `kling-video/v3.0/pro/text-to-video` | `kling-video/v3.0/pro/image-to-video` (page exists, not parsed) | — | 16:9, 9:16, 1:1 | — | 3–15 | — |
| Kling 3.0 4K | `kling-video/v3.0/4k/text-to-video` | `.../4k/image-to-video` (not parsed) | — | 16:9, 9:16, 1:1 | — | 3–15 | — |
| Kling 3.0 Turbo | `kling-video/v3.0-turbo/text-to-video` | `kling-video/v3.0-turbo/image-to-video` | prompt / prompt+image_url | 16:9, 9:16, 1:1 | no | 3–15 | 720p, 1080p |
| Kling 2.6 Pro | `kling-video/v2.6/pro/text-to-video` | `kling-video/v2.6/pro/image-to-video` | prompt / prompt+image_url | 16:9, 9:16, 1:1 | yes, same enum | 5 or 10 | — |
| Kling 2.5 Turbo Pro | `kling-video/v2.5-turbo/pro/text-to-video` | `kling-video/v2.5-turbo/pro/image-to-video` | prompt / prompt+image_url | **none** | no | 5 or 10 | — |
| Seedance 2.0 | `bytedance/seedance-2.0/text-to-video` | `bytedance/seedance-2.0/image-to-video` | prompt / image_url | 16:9, 4:3, 1:1, 3:4, 9:16, 21:9 | no (follows image) | 4–15 | 480p, 720p, 1080p, 4k |
| Seedance 2.5 | `bytedance/seedance-2.5/text-to-video` | `bytedance/seedance-2.5/image-to-video` | prompt / image_url | 16:9, 4:3, 1:1, 3:4, 9:16, 21:9 | no | 4–30 | 480p, 720p, 1080p; `output_format` mp4/mov (T2V) |
| Wan 3.0 | `alibaba/wan-3.0/text-to-video` | `alibaba/wan-3.0/image-to-video` | prompt / prompt+image_url | 16:9, 4:3, 1:1, 3:4, 9:16, adaptive | yes, same | 2–30 | 480p, 720p, 1080p |
| Wan 3.0 Prime | `alibaba/wan-3.0-prime/text-to-video` | `alibaba/wan-3.0-prime/image-to-video` (not parsed) | prompt | 16:9, 4:3, 1:1, 3:4, 9:16, adaptive | — | 2–30 | 480p–1080p |
| Wan 2.7 | `wan/v2.7/text-to-video` | `wan/v2.7/image-to-video` | prompt / image_url | 16:9, 9:16, 1:1, 4:3, 3:4 | no | 2–15 | 720p, 1080p |
| Wan 2.6 | `wan/v2.6/text-to-video` | `wan/v2.6/image-to-video` | prompt / prompt+image_url | **none** | no | 5, 10, 15 | 720p/1080p (i2v adds 480p) |
| Happy Horse 1.1 | `alibaba/happy-horse/v1.1/text-to-video` | `alibaba/happy-horse/v1.1/image-to-video` | prompt / image_url | 16:9, 9:16, 1:1, 4:3, 3:4 | no | 3–15 (i2v 2–15) | 720p, 1080p |
| MiniMax H3 | `minimax/h3/text-to-video` | `minimax/h3/image-to-video` | prompt / prompt+image_url | auto, adaptive, 21:9, 16:9, 4:3, 1:1, 3:4, 9:16 | yes, same | 5–15 | 2K only |
| Hailuo 2.3 Std | `minimax/hailuo-2.3/standard/text-to-video` | `minimax/hailuo-2.3/standard/image-to-video` | prompt / prompt+image_url | **none** | no | 6 or 10 | fixed 768P |
| PixVerse V6 | `pixverse/v6/text-to-video` | `pixverse/v6/image-to-video` | prompt / prompt+image_url | 16:9, 4:3, 1:1, 3:4, 9:16 | no | 1–15 | 360p–1080p |
| LTX-2.5 Fast | `lightricks/ltx-2.5/text-to-video/fast` | `lightricks/ltx-2.5/image-to-video/fast` | prompt+duration / +image_url | 16:9, 9:16 only | yes, same | 6, 8, 10 | 720p, 1080p, 2k, 4k |
| Grok Imagine Video 1.5 | `xai/grok-imagine-video/v1.5/reference-to-video` (one endpoint; image optional) | same (`image_url`/`image_urls`) | prompt | auto, 1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3 | yes | 1–15 | 480p, 720p, 1080p |
| Cinema Studio 4.0 | `higgsfield/cinema-studio/4.0` (one endpoint; `image_urls` optional) | same | prompt | 16:9, 4:3, 1:1, 3:4, 9:16, 21:9 | yes | 4–30 | 480p, 720p |

Other common fields: `seed` (Wan, Happy Horse, PixVerse), `negative_prompt` (Kling 2.5, Wan, PixVerse), `generate_audio` (bool) or `sound: "on"|"off"` (Kling), `cfg_scale` (Kling), `end_image_url`. There is **no `webhook` body field**: webhook is a query param (see section 3).

Pure text-to-video: every family above except Genjutsu (video-to-video), Kling O3/Omni (reference/edit) and Motion Control has a T2V endpoint. Source: https://docs.higgsfield.ai/docs/models/video-generation.md

---

## 3. Job model

### Submit response (verbatim)
Source: https://docs.higgsfield.ai/docs/concepts/requests.md
```json
{
  "status": "queued",
  "request_id": "d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff",
  "status_url": "https://api.higgsfield.ai/requests/d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff/status",
  "cancel_url": "https://api.higgsfield.ai/requests/d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff/cancel"
}
```
"Use the URLs from the response instead of constructing them manually." (same source)

### Status
- `GET https://api.higgsfield.ai/requests/{request_id}/status` (uuid). 404 if the request belongs to another account. Source: https://docs.higgsfield.ai/docs/api-reference/requests/get-request-status.md
- Status values: `queued`, `in_progress`, `completed`, `failed`, `nsfw`, `canceled` (note US spelling, one L). Terminal: completed, failed, nsfw, canceled. Source: https://docs.higgsfield.ai/docs/concepts/requests.md
  - The Python SDK uses class names `Queued`, `InProgress`, `Completed`, `Failed`, `NSFW`, `Cancelled`. Source: https://github.com/higgsfield-ai/higgsfield-client
- `failed` responses may include `error` (string). Source: https://docs.higgsfield.ai/docs/concepts/errors.md
- Polling guidance: start at 2 s, back off to 10 s, add jitter. Source: https://docs.higgsfield.ai/docs/concepts/polling.md

### Completed video result (verbatim)
Source: https://docs.higgsfield.ai/docs/concepts/requests.md
```json
{
  "status": "completed",
  "request_id": "d7e6c0f3-6699-4f6c-bb45-2ad7fd9158ff",
  "video": {
    "url": "https://cdn.example.com/video.mp4"
  }
}
```
**Video URL field: `video.url`** (images use `images[].url`, audio uses `audio.url` / `audios[]`). Some ops add `zip`, `mov`, `jsx`, `fbx`, `ply`.

### Cancel
- `POST https://api.higgsfield.ai/requests/{request_id}/cancel`. Only while queued. Returns `202` (empty body); `400` if processing started. Source: https://docs.higgsfield.ai/docs/concepts/requests.md

### Webhooks
Source: https://docs.higgsfield.ai/docs/how-to/webhooks.md
- Pass the URL as **query param `hf_webhook`** on the submit URL, e.g. `POST https://api.higgsfield.ai/higgsfield-ai/soul/v2/standard?hf_webhook=https%3A%2F%2Fexample.com%2Fwebhooks%2Fhiggsfield`.
- Sent on `completed`, `failed`, `nsfw`. Endpoint must be public HTTPS and respond within 10 s. 5xx/network failures retried up to 2 h; 4xx are permanent. Duplicates possible: dedupe by `request_id` + `status`.
- Payload (verbatim, completed video):
```json
{
  "request_id": "9417a243-e457-4075-895b-b68f3cda5303",
  "status": "completed",
  "error": null,
  "payload": {
    "video": {
      "url": "https://cdn.example.com/generated-video.mp4",
      "content_type": "video/mp4"
    }
  }
}
```
- **Signature: none documented.** The webhook page has no signing secret or signature header. Treat webhook bodies as untrusted and re-fetch from the authenticated status endpoint. (Absence verified on the page above. Whether an undocumented signature header exists is UNVERIFIED.)
- Python SDK: optional `webhook_url` argument to `submit()` / `submit_async()`. Source: https://github.com/higgsfield-ai/higgsfield-client

---

## 4. Output

- Format: mp4 (`content_type: video/mp4`) in examples; Seedance 2.5 T2V lets you pick `output_format` mp4 or mov. Sources: https://docs.higgsfield.ai/docs/how-to/webhooks.md , https://docs.higgsfield.ai/docs/models/seedance-2-5/text-to-video.md
- Durations and resolutions: per model, see table in section 2 (range overall 1–30 s; 360p to 4K).
- **Aspect ratios needed (9:16, 4:5, 1:1, 16:9):**
  - **16:9: native** on every T2V model with an `aspect_ratio` field.
  - **9:16: native** on Kling 2.6/3.0, Seedance 2.0/2.5, Wan 2.7/3.0, Happy Horse 1.1, MiniMax H3, PixVerse V6, LTX-2.5, Grok 1.5, Cinema Studio 4.0.
  - **1:1: native** on all of the above except LTX-2.5 (16:9 and 9:16 only).
  - **4:5: NOT supported by any video model in the catalog.** No schema in the 33 workflow pages I parsed lists `4:5`. The closest are `3:4` (Seedance, Wan, Happy Horse, PixVerse, MiniMax H3, Cinema Studio, Grok) or 9:16, cropped or padded to 4:5 afterwards. Another route is i2v with a 4:5 start image on models where "framing follows image_url" (Seedance i2v). Whether the output then keeps exactly 4:5 is UNVERIFIED.
  - Kling 2.5 Turbo, Wan 2.6 and Hailuo 2.3 have **no aspect_ratio field** at all.
- Retention: output available "for at least seven days", may be removed after. Source: https://docs.higgsfield.ai/docs/concepts/billing-and-retention.md , https://docs.higgsfield.ai/docs/help/faq.md

---

## 5. Pricing and limits

- Charged in account credits per successful generation; cost depends on model and parameters; use the `/estimate/{endpoint}` endpoint. Failed, NSFW and canceled-while-queued requests are refunded. Source: https://docs.higgsfield.ai/docs/concepts/billing-and-retention.md
- The docs give **no per-model price table**. Live prices appear in the console (open.higgsfield.ai). UNVERIFIED beyond these sources.
- Official blog (prices "checked on October 14, 2026"): billing "runs per second of video output and per image"; Kling 3.0 Standard 720p, audio off = **$0.084/s** (8 s clip ≈ $0.67). Source: https://higgsfield.ai/blog/ai-video-api-pricing-vs-subscriptions
- Third-party only (UNVERIFIED): Seedance 2.0 from $0.141/s, Seedance 2.5 from $0.206/s. Source: https://www.seedance.tv/blog/higgsfield-api-pricing-per-video
- Minimum top-up $5. Source: https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api
- **Rate limits:** the main limit is concurrency (queued + processing at once), set per account and model and shown in the console. When it is hit: `400` with `{"detail": "Maximum number of concurrent requests (4) has been reached"}`. There are no rate-limit headers and no `Retry-After`. Higher limits are requested via Discord. Source: https://docs.higgsfield.ai/docs/concepts/rate-limits.md. The default concurrency number per tier is UNVERIFIED (4 is only the example).
- Error codes: 400 (invalid or concurrency), 401, 403 (insufficient credits), 404, 422, 423 (model blocked), 500, 503. Every response has an `X-Correlation-ID` header. Source: https://docs.higgsfield.ai/docs/concepts/errors.md

---

## 6. Terms (Terms of Use, last updated July 26, 2026; effective Aug 27, 2026 for earlier registrants)
Source for all bullets: https://higgsfield.ai/terms-of-use-agreement (section numbers as reported by the page; paraphrased)

- **Section 11 "Developer Access"** covers API, MCP, CLI and other programmatic access (11.1). Section 1.2 licenses use for your own purposes or to build apps for End Users under Section 11.
- **11.3 API Key Security:** keys are "issued for your use only". No sharing, selling, publishing, or embedding in client-side code. You are responsible for all activity on them. 11.4: report a compromise within 24 h.
- **11.5 End User Responsibility:** you are responsible for your End Users' acts. **No sublicensing or reselling.** No acting as a "pass-through or service bureau" without independent value. Making Developer Access available to third parties is prohibited.
  - Implication: a SaaS feature built on *our* key that adds independent value appears allowed. Proxying raw access is not. **Letting each end user bring their own Higgsfield API key is not addressed explicitly.** Keys are "for your use only", so a BYOK flow where the user pastes their own key into our server is a grey area (UNVERIFIED, needs legal review). MCP OAuth is the sanctioned way for third-party clients to act on a user's account (11.13; MCP help page above).
- **11.8 Attribution and Branding:** restrictions on using Higgsfield name/logos.
- **11.12:** all activity through your Developer Access counts as your activity (including agents).
- **11.13 Third-Party MCP Clients:** governed by their own terms.
- **5.1(iii):** no using the Service or Outputs to build competing products. **5.2(iv):** no using Outputs to train other ML models (limited exceptions).
- **4.4 Ownership:** Higgsfield "does not claim ownership" of Inputs or Outputs and does not restrict commercial use. You may sublicense Output rights to clients. Outputs may not be unique. Higgsfield may train on your content unless you have an Enterprise Agreement.
- **Retention:** no obligation to store content (3.2). Tier-based retention and cold storage (3.4). API output URLs last at least 7 days (docs above), so **copy videos to our own storage (e.g. Supabase Storage) right after completion**.
- **Credits (9.4):** prepaid, no cash value, non-transferable.

---

## Not verified / gaps
- Exact per-model API prices (console-only). UNVERIFIED.
- Default concurrency per account tier. UNVERIFIED.
- Webhook signature (none documented). UNVERIFIED whether one exists.
- Whether 4:5 output can be produced via i2v from a 4:5 source image. UNVERIFIED.
- Whether legacy `platform.higgsfield.ai` endpoints (e.g. `/v1/image2video/dop`) still work. UNVERIFIED; not in current docs.
- Any OAuth client registration for non-MCP third-party apps: none found. UNVERIFIED that it doesn't exist privately.
- Kling 3.0 Pro/4K i2v and Wan 3.0 Prime i2v pages were not parsed in detail.
