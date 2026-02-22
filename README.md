# webmaster-droid

Composable toolkit for building or upgrading React/Next.js websites with an **agent-assisted editable CMS layer**.

`webmaster-droid` is self-hosted first: you install React editing components, an admin runtime UI, and backend API packages, then run on your own infrastructure.

## Status

Alpha (`0.1.0-alpha.*`).
APIs may change between alpha releases.

## Who It Is For

- **New website builds**: start with `Editable*` components from day one and keep all key content CMS-editable.
- **Existing website conversion**: convert static JSX content incrementally using scan/codemod + agent skill workflow.

## Packages

- `@webmaster-droid/contracts`: Engine-level CMS document contracts.
- `@webmaster-droid/web`: Unified web package (editable React primitives + admin runtime UI/overlay).
- `@webmaster-droid/server`: Unified backend package (core service + S3 storage + AI agent + AWS API runtime).
- `@webmaster-droid/cli`: Project bootstrap, schema, scan/codemod, skill install, and deploy helpers.

## Quick Start (Seedless, Self-Hosted)

Install frontend packages:

```bash
npm i @webmaster-droid/contracts @webmaster-droid/web
```

Wrap your app once:

```tsx
import { WebmasterDroidRuntime } from "@webmaster-droid/web";
import "@webmaster-droid/web/styles.css";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <WebmasterDroidRuntime>{children}</WebmasterDroidRuntime>
  );
}
```

Use editable components in new pages/components:

```tsx
import { EditableText } from "@webmaster-droid/web";

export function HeroTitle() {
  return (
    <EditableText
      path="pages.home.hero.title"
      fallback="Build your website faster"
      as="h1"
    />
  );
}
```

`fallback` props are optional. If both CMS value and fallback are missing, components throw an explicit runtime error.

## Existing Website Conversion

For existing static JSX websites, use the CLI conversion path first, then refine manually.

```bash
npx @webmaster-droid/cli scan apps/site/src --out .webmaster-droid/scan-report.json
npx @webmaster-droid/cli codemod apps/site/src --out .webmaster-droid/codemod-report.json
npx @webmaster-droid/cli codemod apps/site/src --apply
```

Install bundled Codex skill for assisted conversion:

```bash
CODEX_HOME=~/.codex npx @webmaster-droid/cli skill install
```

### Typical Conversion Workflow

1. Run `scan` to identify static text/attributes.
2. Run `codemod` in preview mode and review patch report.
3. Apply codemod and fix edge cases manually.
4. Use the `webmaster-droid-convert` skill for semantic/path cleanup.
5. Validate with local build/typecheck and runtime editing tests.

## Backend (Shared by Both Paths, Self-Hosted AWS)

Install backend/runtime packages:

```bash
npm i @webmaster-droid/server
```

Bootstrap config and run environment checks:

```bash
npx @webmaster-droid/cli doctor
npx @webmaster-droid/cli init --framework next --backend aws
```

Optional schema helpers:

```bash
npx @webmaster-droid/cli schema init
npx @webmaster-droid/cli schema build --input cms/schema.webmaster.ts
```

Important:
- `CMS_PUBLIC_BASE_URL` must be set when image generation is enabled. The library no longer ships with any hardcoded production domain fallback.

Build and deploy Lambda bundle with CLI helper:

```bash
npx @webmaster-droid/cli deploy aws \
  --entry apps/api/src/lambda.ts \
  --region eu-central-1 \
  --functions webmaster-droid-api
```

## Local Development

```bash
npm install
npm run build
npm run typecheck
```

## Repository

- GitHub: [Slava-AV/webmaster-droid](https://github.com/Slava-AV/webmaster-droid)
- License: MIT

## Security

Report vulnerabilities via the process in `SECURITY.md`.
