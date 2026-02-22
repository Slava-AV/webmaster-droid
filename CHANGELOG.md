# Changelog

All notable changes to this project will be documented in this file.

This project follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
