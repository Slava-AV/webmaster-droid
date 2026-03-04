# @webmaster-droid/web

## 0.3.2

### Patch Changes

- 6b01bbc: Improve seed diagnostics by surfacing dynamic and invalid editable paths with source locations, and add dev-time warnings when editable components use unsupported path roots. Also clarifies local-first seed staging and model provider env var docs.

## 0.3.1

### Patch Changes

- 95756c4: Improve first-run setup stability by adding editable-path seed generation guidance and hardening Supabase event-log initialization and missing-object handling. Also documents array-rendered `EditableText` patterns and overlay avatar/font defaults.

## 0.3.0

### Minor Changes

- 7a34617: Ship a Supabase hard-cut auth/runtime update and first-party partial document normalization.

  - server: remove `SUPABASE_JWKS_URL` dependency, add `CMS_SUPABASE_JWKS_URL` override with derivation from `SUPABASE_URL`, and add resilient `/auth/v1/user` fallback validation.
  - server: add runtime-safe env resolution (`Deno.env` then `process.env`) and apply it across auth/service/image flows.
  - web: add `normalizeCmsDocumentWithFallback` and apply normalization in runtime fetch path to prevent crashes with partial CMS payloads.
  - cli: update init env template for Supabase reserved-secret constraints and new `CMS_*` auth override variables.

## 0.2.0

### Minor Changes

- bcf1ca8: Improve host integration safety for Tailwind projects and simplify CLI bootstrap behavior.

  - web: replace global Tailwind stylesheet export with scoped `core.css` and `theme.css`
  - web: auto-inject required overlay core styles by default and add `injectCoreStyles` opt-out for strict CSP
  - web: move overlay markup to stable `.wmd-*` class contract and remove Tailwind build dependency from package styles
  - cli: update `init` to generate only `.env.webmaster-droid.example` and stop writing `webmaster-droid.config.ts`
  - docs/tests: document safe integration paths and add regressions for CSS isolation plus init behavior

## Unreleased

### Breaking Changes

- Removed `@webmaster-droid/web/styles.css`.
- Overlay styles are now split into:
  - auto-injected core layout styles (default runtime behavior)
  - optional `@webmaster-droid/web/theme.css` skin
  - manual `@webmaster-droid/web/core.css` for strict CSP (`injectCoreStyles={false}`)

### Added

- Added `injectCoreStyles?: boolean` to `WebmasterDroidRuntime` and `WebmasterDroidOverlay`.
- Added new CSS entrypoints: `@webmaster-droid/web/core.css` and `@webmaster-droid/web/theme.css`.

## 0.1.1

### Patch Changes

- 708b7d0: Make all editable components render empty content (with console error) instead of throwing when both CMS value and fallback are missing.

## 0.1.0

### Patch Changes

- 851e46e: Graduate all public packages from alpha prereleases to stable `0.1.0` and align internal workspace dependency ranges for automated releases.
- Updated dependencies [851e46e]
  - @webmaster-droid/contracts@0.1.0
