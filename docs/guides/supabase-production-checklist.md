# Guide: Supabase Production Checklist

Use this checklist before enabling non-technical editors in production.

## 1. Confirm required environment values

Required:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- model provider keys (`OPENAI_API_KEY` and/or `GOOGLE_GENERATIVE_AI_API_KEY`)

Optional but recommended:

- `CMS_SUPABASE_JWKS_URL` (override default JWKS URL derivation)
- `CMS_SUPABASE_AUTH_KEY` (API key used for `/auth/v1/user` auth fallback)
- `CMS_SUPABASE_BUCKET` (default: `webmaster-droid-cms`)
- `CMS_STORAGE_PREFIX` (default: `cms`)
- `CMS_PUBLIC_BASE_URL` (required for generated image URLs in responses)
- `ADMIN_EMAIL` (single-admin allowlist)

Notes:

- Supabase Edge blocks user-defined secrets that start with `SUPABASE_`.
- Keep built-in `SUPABASE_*` values and add custom values with `CMS_*`.

## 2. Verify `verify_jwt` behavior

Default recommendation: keep `verify_jwt = true` for the function.

- Use `verify_jwt = false` only when another trusted gateway enforces bearer-token auth before requests reach the function.
- If `verify_jwt = false`, keep `/api/session`, `/api/history`, and `/api/chat/stream` protected by valid Supabase bearer tokens.

## 3. Confirm storage layout exists

The service creates missing stage files during startup, but production should verify:

- `<prefix>/live/current.json` (example: `cms/live/current.json`)
- `<prefix>/draft/current.json` (example: `cms/draft/current.json`)
- `<prefix>/checkpoints/` (created as needed)
- `<prefix>/published/` (created as needed)
- `<prefix>/events/` (created as needed)

If starter content is required for your site, seed these stage files before first editor use.

## 4. Run auth smoke tests

With no auth token:

```bash
curl -i "$API_BASE_URL/api/session"
curl -i "$API_BASE_URL/api/history"
```

With a valid admin token:

```bash
curl -i -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "$API_BASE_URL/api/session"
curl -i -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "$API_BASE_URL/api/history"
```

Streaming auth check:

```bash
curl -N -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"health check"}' \
  "$API_BASE_URL/api/chat/stream"
```

## 5. Validate draft/publish safety

- Confirm draft updates are visible to admins but not public visitors.
- Confirm publish requires explicit action and updates live content only after confirmation.
- Confirm rollback works from at least one checkpoint and one published version.
