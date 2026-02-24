# @webmaster-droid/server

## 0.3.0

### Minor Changes

- 7a34617: Ship a Supabase hard-cut auth/runtime update and first-party partial document normalization.

  - server: remove `SUPABASE_JWKS_URL` dependency, add `CMS_SUPABASE_JWKS_URL` override with derivation from `SUPABASE_URL`, and add resilient `/auth/v1/user` fallback validation.
  - server: add runtime-safe env resolution (`Deno.env` then `process.env`) and apply it across auth/service/image flows.
  - web: add `normalizeCmsDocumentWithFallback` and apply normalization in runtime fetch path to prevent crashes with partial CMS payloads.
  - cli: update init env template for Supabase reserved-secret constraints and new `CMS_*` auth override variables.

## 0.2.1

### Patch Changes

- 6562f6f: Fix Supabase-first server imports and remove legacy AWS SDK v2 transitive install.

  - server: make `streamHandler` lazy so importing `@webmaster-droid/server` no longer crashes outside AWS Lambda
  - server: replace `aws-lambda` package type coupling with local API Gateway types
  - server: remove runtime `aws-lambda` dependency to stop pulling `aws-sdk` v2 for Supabase-only installs

## 0.2.0

### Minor Changes

- 6c6e1be: Add Supabase support as a first-class backend.

  - server: add Supabase API handler and Supabase storage adapter exports
  - cli: default `init` backend to Supabase and add `deploy supabase` command
  - docs: split getting-started flows for Supabase and AWS, and add a unified API contract reference

## 0.1.0

### Patch Changes

- 851e46e: Graduate all public packages from alpha prereleases to stable `0.1.0` and align internal workspace dependency ranges for automated releases.
- Updated dependencies [851e46e]
  - @webmaster-droid/contracts@0.1.0
