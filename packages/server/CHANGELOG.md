# @webmaster-droid/server

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
