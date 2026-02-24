---
"@webmaster-droid/web": minor
"@webmaster-droid/cli": minor
---

Improve host integration safety for Tailwind projects and simplify CLI bootstrap behavior.

- web: replace global Tailwind stylesheet export with scoped `core.css` and `theme.css`
- web: auto-inject required overlay core styles by default and add `injectCoreStyles` opt-out for strict CSP
- web: move overlay markup to stable `.wmd-*` class contract and remove Tailwind build dependency from package styles
- cli: update `init` to generate only `.env.webmaster-droid.example` and stop writing `webmaster-droid.config.ts`
- docs/tests: document safe integration paths and add regressions for CSS isolation plus init behavior
