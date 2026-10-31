# guardian-social

Links a Guardian's Instagram / Facebook / TikTok / YouTube account via each platform's official OAuth.
Tokens are AES-256-GCM encrypted into `guide_social_connections.token_ciphertext` / `token_iv`; the browser never sees them.

Flow: `start` -> platform -> `callback` (redirects the code back to the site) -> `complete` (the signed-in browser POSTs `{state, code}`; the JWT user must match the user who started, so a forwarded authorize link cannot link someone else's account).

Deploy (migration `20261031120000_guide_social_oauth_nonce.sql` first; `--no-verify-jwt` because the callback is a platform redirect):

    supabase functions deploy guardian-social --no-verify-jwt --use-api --project-ref <ref>

## Secrets (`supabase secrets set NAME=value`)
| Name | Purpose |
|---|---|
| `SOCIAL_STATE_SECRET` | HMAC key for the signed OAuth state (`openssl rand -base64 32`) |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | AES-256 key, 32 bytes base64 (`openssl rand -base64 32`). Losing it orphans stored tokens |
| `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` | Meta app ID + secret (App settings > Basic). Used for Facebook **and** Instagram (Instagram connects through Facebook Login and the Page's linked account) |
| `TIKTOK_CLIENT_ID` / `TIKTOK_CLIENT_SECRET` | TikTok for Developers app client key + secret |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` | Google Cloud OAuth 2.0 Web client |
| `PUBLIC_SITE_URL` | Default return origin (default `https://routine3.com`) |
| `SOCIAL_ALLOWED_RETURN_ORIGINS` | Optional comma list of extra origins `return_to` may use (staging, previews) |

A platform with missing credentials answers `503 {"error":"<Platform> OAuth is not configured (set …)"}`.

## Redirect URI to register in every developer console
`https://<project-ref>.supabase.co/functions/v1/guardian-social` (no query string; TikTok rejects one)
(one per Supabase project: ermbkttsyvpenjjxaxcf, mofhvoudjxinvpplsytd)

## Console setup (done by the account owner)
- **Meta (Instagram + Facebook)** developers.facebook.com: create a Business app; add *Instagram API with Instagram login* (scopes `instagram_business_basic`, `instagram_business_content_publish`) and *Facebook Login* (`pages_show_list`, `pages_read_engagement`, `pages_manage_posts`); add the redirect URI; Instagram accounts must be Business/Creator. Publishing for other people's accounts needs App Review + Business Verification; until then only app roles/testers can connect.
- **TikTok** developers.tiktok.com: create an app, add *Login Kit* and *Content Posting API* (`user.info.basic`, `video.publish`, `video.upload`), register the redirect URI. Posting needs app audit; unaudited apps can only post privately.
- **Google (YouTube)** console.cloud.google.com: enable *YouTube Data API v3*, configure the OAuth consent screen (scopes `youtube.upload`, `youtube.readonly`), create an OAuth *Web application* client with the redirect URI. `youtube.upload` is sensitive: verification is required beyond test users.
