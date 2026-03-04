# Developer Getting Started: New Build

Use this path when building a new React/Next.js site with Webmaster Droid from day one.

Backend guides:

- Supabase (default): [`new-build-supabase.md`](./new-build-supabase.md)
- AWS (optional): [`new-build-aws.md`](./new-build-aws.md)

## 1. Install packages

```bash
npm i @webmaster-droid/contracts @webmaster-droid/web @webmaster-droid/server
```

## 2. Initialize project config

```bash
npx @webmaster-droid/cli doctor
npx @webmaster-droid/cli init
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
- For strict CSP (no inline styles), import `@webmaster-droid/web/core.css` and disable injection:
- By default, overlay uses avatar text fallback only (no image required). Set `config.assistantAvatarUrl` if you want a custom image.
- Overlay mono font uses `--font-ibm-plex-mono` when provided, and falls back to system monospace if not set.

```tsx
import { WebmasterDroidRuntime } from "@webmaster-droid/web";
import "@webmaster-droid/web/core.css";
import "@webmaster-droid/web/theme.css"; // optional

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <WebmasterDroidRuntime injectCoreStyles={false}>{children}</WebmasterDroidRuntime>;
}
```

Optional avatar/font customization:

```tsx
import { WebmasterDroidRuntime } from "@webmaster-droid/web";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <WebmasterDroidRuntime
      config={{
        assistantAvatarUrl: "/assets/admin/webmaster-avatar.png",
        assistantAvatarFallback: "W",
      }}
    >
      {children}
    </WebmasterDroidRuntime>
  );
}
```

## 4. Use editable components

```tsx
import { EditableText } from "@webmaster-droid/web";

export function HeroTitle() {
  return <EditableText path="pages.home.hero.title" fallback="Build your website faster" as="h1" />;
}
```

If runtime data may be partial, use `normalizeCmsDocumentWithFallback` from `@webmaster-droid/web` with a schema-shaped fallback document.

For Next.js internal navigation, keep `next/link` and make only link text editable:

```tsx
import Link from "next/link";
import { EditableText } from "@webmaster-droid/web";

<Link href="/about">
  <EditableText path="pages.home.hero.ctaLabel" fallback="About us" as="span" />
</Link>;
```

## 5. Generate initial seed from editable paths

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

Then publish the same seed to both storage stages:

- `cms/live/current.json`
- `cms/draft/current.json`

If these files stay empty defaults, first edits will fail with `path does not exist`.

For array-rendered UI (`items.map(...)`), add explicit indexed paths first, then rerun `seed`:

```tsx
{cards.map((card, i) => (
  <EditableText path={`pages.home.cards.${i}.title`} fallback={card.title} />
))}
```

## 6. Configure backend environment

Set required backend environment values including:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CMS_SUPABASE_URL` (optional override for runtime URL source)
- `CMS_SUPABASE_JWKS_URL` (optional override; default derives from `SUPABASE_URL`)
- `CMS_SUPABASE_AUTH_KEY` (optional auth fallback key for `/auth/v1/user`)
- `CMS_SUPABASE_BUCKET` (optional, default `webmaster-droid-cms`)
- `CMS_PUBLIC_BASE_URL` (required for generated image URLs)
- `OPENAI_API_KEY` (required when `MODEL_OPENAI_ENABLED=true`)
- `GOOGLE_GENERATIVE_AI_API_KEY` (required when `MODEL_GEMINI_ENABLED=true`)

Supabase hardening details:

- [`new-build-supabase.md`](./new-build-supabase.md)
- [`../guides/supabase-production-checklist.md`](../guides/supabase-production-checklist.md)

Use AWS instead:

```bash
npx @webmaster-droid/cli init --backend aws
```

For AWS variables, use:

- `CMS_S3_BUCKET`
- `CMS_S3_REGION`

## 7. Verify

```bash
npm run build
npm run typecheck
npm test
```
