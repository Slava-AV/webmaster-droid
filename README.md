# webmaster-droid

Composable toolkit for building or upgrading React/Next.js websites with an **agent-assisted editable CMS layer**.

`webmaster-droid` is self-hosted first: you install React editing components, an admin runtime UI, and backend API packages, then run on your own infrastructure.

## Status

Alpha (`0.1.0-alpha.*`).
APIs may change between alpha releases.

## Who It Is For

- **New website builds**: start with `Editable*` components from day one and keep all key content CMS-editable.
- **Existing website migration**: convert static JSX content incrementally using scan/codemod + agent skill workflow.

## Packages

- `@webmaster-droid/contracts`: Shared CMS document types, schema contracts, and defaults.
- `@webmaster-droid/react`: UI primitives like `EditableText`, `EditableImage`, and related helpers.
- `@webmaster-droid/admin-ui`: Drop-in admin runtime, auth-aware context, and chat/overlay UI.
- `@webmaster-droid/core`: Core patching and CMS service abstractions.
- `@webmaster-droid/storage-s3`: S3-backed document/media storage adapters.
- `@webmaster-droid/agent-ai-sdk`: AI skill/tool runtime wiring (OpenAI/Gemini SDK integration).
- `@webmaster-droid/api-aws`: Self-hostable AWS Lambda API runtime.
- `@webmaster-droid/cli`: Project bootstrap, schema, scan/codemod, skill install, and deploy helpers.

## Quick Start (New Website, Self-Hosted)

Install frontend packages:

```bash
npm i @webmaster-droid/contracts @webmaster-droid/react @webmaster-droid/admin-ui
```

Wrap your app once:

```tsx
import { WebmasterDroidRuntime } from "@webmaster-droid/admin-ui";
import "@webmaster-droid/admin-ui/styles.css";
import { createDefaultCmsDocument } from "@webmaster-droid/contracts";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <WebmasterDroidRuntime fallbackDocument={createDefaultCmsDocument()}>
      {children}
    </WebmasterDroidRuntime>
  );
}
```

Use editable components in new pages/components:

```tsx
import { EditableText } from "@webmaster-droid/react";

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
npm i @webmaster-droid/api-aws @webmaster-droid/core @webmaster-droid/storage-s3 @webmaster-droid/agent-ai-sdk
```

Bootstrap config/schema and run environment checks:

```bash
npx @webmaster-droid/cli doctor
npx @webmaster-droid/cli init --framework next --backend aws
npx @webmaster-droid/cli schema init
npx @webmaster-droid/cli schema build --input cms/schema.webmaster.ts
```

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
