# Developer Getting Started: New Build (AWS)

Use this path when building a new React/Next.js site with Webmaster Droid on AWS.

## 1. Install packages

```bash
npm i @webmaster-droid/contracts @webmaster-droid/web @webmaster-droid/server
```

## 2. Initialize project config

```bash
npx @webmaster-droid/cli doctor
npx @webmaster-droid/cli init --backend aws
```

## 3. Wrap runtime in app

```tsx
import { WebmasterDroidRuntime } from "@webmaster-droid/web";
import "@webmaster-droid/web/theme.css"; // optional visual skin

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <WebmasterDroidRuntime>{children}</WebmasterDroidRuntime>;
}
```

Notes:

- Overlay core layout styles are injected automatically by default.
- Tailwind hosts do not need `@source` entries or package class scanning hacks.
- For strict CSP (no inline styles), import `@webmaster-droid/web/core.css` and use `injectCoreStyles={false}`.
- By default, overlay uses avatar text fallback only (no image required). Set `config.assistantAvatarUrl` for a custom avatar image.
- Overlay mono font uses `--font-ibm-plex-mono` when present and falls back to system monospace otherwise.

## 4. Use editable components

```tsx
import { EditableText } from "@webmaster-droid/web";

export function HeroTitle() {
  return <EditableText path="pages.home.hero.title" fallback="Build your website faster" as="h1" />;
}
```

For Next.js internal navigation, keep `next/link` and make only link text editable:

```tsx
import Link from "next/link";
import { EditableText } from "@webmaster-droid/web";

<Link href="/about">
  <EditableText path="pages.home.hero.ctaLabel" fallback="About us" as="span" />
</Link>;
```

## 5. Configure backend environment

Set required backend environment values including:

- `CMS_S3_BUCKET`
- `CMS_S3_REGION`
- `CMS_PUBLIC_BASE_URL` (required for generated image URLs)
- `OPENAI_API_KEY` (required when `MODEL_OPENAI_ENABLED=true`)
- `GOOGLE_GENERATIVE_AI_API_KEY` (required when `MODEL_GEMINI_ENABLED=true`)

## 6. Generate initial seed from editable paths

Before first editor use, generate a seed document from your `Editable*` components:

```bash
npx @webmaster-droid/cli seed src --out cms/seed.from-editables.json
```

Seed supports these root prefixes only:

- `pages.`
- `layout.`
- `seo.`
- `themeTokens.`

If seed reports dynamic/invalid skips, treat them as required manual migration items. The CLI output includes source file and line locations for each skipped entry.

In local-first development, copy seed into stage files:

```bash
mkdir -p cms/live cms/draft
cp cms/seed.from-editables.json cms/live/current.json
cp cms/seed.from-editables.json cms/draft/current.json
```

Upload this same seed to both remote stage files:

- `cms/live/current.json`
- `cms/draft/current.json`

If these files remain empty defaults, edits will fail with `path does not exist`.

## 7. Deploy Lambda bundle

```bash
npx @webmaster-droid/cli deploy aws --entry src/api/handler.ts --region us-east-1 --functions functionOne,functionTwo
```

## 8. Verify

```bash
npm run build
npm run typecheck
npm test
```
