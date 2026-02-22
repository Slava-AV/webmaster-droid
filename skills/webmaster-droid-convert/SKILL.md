---
name: webmaster-droid-convert
description: Convert existing React or Next.js static pages into webmaster-droid editable CMS bindings. Use when migrating hardcoded JSX text/images/links into `@webmaster-droid/web` components, generating schema manifests, running scan/codemod workflows, and validating migration quality.
---

# Webmaster Droid Convert

Use this workflow:
1. Run scan first in dry mode.
2. Review report and identify safe high-confidence transforms.
3. Run codemod without `--apply` and inspect report diffs.
4. Apply codemod only after confirming scope.
5. Resolve remaining ambiguous mappings manually.
6. Build schema manifest and run doctor checks.
7. Verify app behavior and run tests.

Commands:
- `npx webmaster-droid scan <srcDir> --out .webmaster-droid/scan-report.json`
- `npx webmaster-droid codemod <srcDir> --out .webmaster-droid/codemod-report.json`
- `npx webmaster-droid codemod <srcDir> --apply --out .webmaster-droid/codemod-report.applied.json`
- `npx webmaster-droid schema build --input cms/schema.webmaster.ts --output cms/schema.manifest.json`
- `npx webmaster-droid doctor`

Rules:
- Keep changes deterministic and incremental.
- Prefer preserving original fallback content in `fallback` props.
- Do not guess schema paths for ambiguous text. Mark TODO paths and surface them clearly.
- Preserve existing visual output unless migration explicitly changes content.

Read references when needed:
- `references/path-mapping.md`
- `references/validation-checklist.md`
