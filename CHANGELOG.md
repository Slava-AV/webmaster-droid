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

### Removed

- Unpublished legacy packages from npm: `@webmaster-droid/admin`, `@webmaster-droid/admin-ui`, `@webmaster-droid/react`, and `@webmaster-droid/api-aws`.

### Deprecated

- Deprecated legacy packages on npm with migration guidance:
  - `@webmaster-droid/core`
  - `@webmaster-droid/storage-s3`
  - `@webmaster-droid/agent-ai-sdk`
