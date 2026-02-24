---
"@webmaster-droid/server": minor
"@webmaster-droid/web": minor
"@webmaster-droid/cli": minor
---

Ship a Supabase hard-cut auth/runtime update and first-party partial document normalization.

- server: remove `SUPABASE_JWKS_URL` dependency, add `CMS_SUPABASE_JWKS_URL` override with derivation from `SUPABASE_URL`, and add resilient `/auth/v1/user` fallback validation.
- server: add runtime-safe env resolution (`Deno.env` then `process.env`) and apply it across auth/service/image flows.
- web: add `normalizeCmsDocumentWithFallback` and apply normalization in runtime fetch path to prevent crashes with partial CMS payloads.
- cli: update init env template for Supabase reserved-secret constraints and new `CMS_*` auth override variables.
