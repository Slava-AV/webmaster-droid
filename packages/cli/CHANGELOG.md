# @webmaster-droid/cli

## 0.3.0

### Minor Changes

- bcf1ca8: Improve host integration safety for Tailwind projects and simplify CLI bootstrap behavior.

  - web: replace global Tailwind stylesheet export with scoped `core.css` and `theme.css`
  - web: auto-inject required overlay core styles by default and add `injectCoreStyles` opt-out for strict CSP
  - web: move overlay markup to stable `.wmd-*` class contract and remove Tailwind build dependency from package styles
  - cli: update `init` to generate only `.env.webmaster-droid.example` and stop writing `webmaster-droid.config.ts`
  - docs/tests: document safe integration paths and add regressions for CSS isolation plus init behavior

## Unreleased

### Changed

- `webmaster-droid init` no longer generates `webmaster-droid.config.ts`.
- `webmaster-droid init` now only initializes `.env.webmaster-droid.example` and reports backend preset.

## 0.2.0

### Minor Changes

- 6c6e1be: Add Supabase support as a first-class backend.

  - server: add Supabase API handler and Supabase storage adapter exports
  - cli: default `init` backend to Supabase and add `deploy supabase` command
  - docs: split getting-started flows for Supabase and AWS, and add a unified API contract reference

## 0.1.0

### Patch Changes

- 851e46e: Graduate all public packages from alpha prereleases to stable `0.1.0` and align internal workspace dependency ranges for automated releases.
