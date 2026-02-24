# @webmaster-droid/web

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
