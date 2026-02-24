# Changelog

All notable changes to this project will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Release Notes Policy

- This root changelog remains a high-level project narrative.
- Authoritative package release notes are generated per package in `packages/*/CHANGELOG.md`.

## [Unreleased]

### Added

- Initial alpha monorepo setup for `webmaster-droid`.
- Public packages under `@webmaster-droid/*`.
- `@webmaster-droid/web` unified runtime package for editable CMS context and overlay.
- CLI commands for init, schema, scan, codemod, deploy, and skill install.
- Bundled `webmaster-droid-convert` skill.

### Changed

- Consolidated package layout into four packages: `contracts`, `web`, `server`, and `cli`.
- Published `@webmaster-droid/web@0.1.0-alpha.2` with widened CMS document generic compatibility.
- Removed starter seed dependency from server initialization and default allowed internal paths now derive from config/env only.
- `@webmaster-droid/web` runtime is seedless by default; `fallbackDocument` is now optional.
- `Editable*` fallback props are optional and now fail loudly at runtime when both CMS value and fallback are missing.
- Updated CLI/docs to a seedless install flow with optional schema helpers.
- Enforced unified package topology with CI verification (`contracts`, `web`, `server`, `cli`) and removed legacy package references from public docs/workflows.
- Hardened `EditableRichText` against stored XSS by sanitizing CMS HTML before rendering.
- Decomposed admin overlay implementation into dedicated controller, UI components, domain types, and utility modules.
- Breaking integration update: `@webmaster-droid/web/styles.css` is removed in favor of scoped core/theme styling:
  - core layout styles auto-inject by default
  - optional skin in `@webmaster-droid/web/theme.css`
  - strict CSP path via `@webmaster-droid/web/core.css` plus `injectCoreStyles={false}`
- `@webmaster-droid/cli init` no longer writes `webmaster-droid.config.ts`; it now initializes only the env template.
