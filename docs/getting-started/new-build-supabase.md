# Developer Getting Started: New Build (Supabase)

Use this path when building a new React/Next.js site with Webmaster Droid on Supabase.

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

If your runtime documents can be partial, pass a schema-shaped fallback document and normalize fetched content with:

- `normalizeCmsDocumentWithFallback` from `@webmaster-droid/web`

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

Upload this same seed to both remote stage files:

- `cms/live/current.json`
- `cms/draft/current.json`

If these files remain empty defaults, edits will fail with `path does not exist`.

For array-rendered sections (`items.map(...)`), add explicit indexed paths before seeding:

```tsx
{cards.map((card, i) => (
  <EditableText path={`pages.gallery.cards.${i}.title`} fallback={card.title} />
))}
```

## 6. Configure backend environment

Set required backend environment values including:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CMS_SUPABASE_URL` (optional override for runtime URL source)
- `CMS_SUPABASE_JWKS_URL` (optional override, default derives from `SUPABASE_URL`)
- `CMS_SUPABASE_AUTH_KEY` (optional auth fallback key for `/auth/v1/user`)
- `CMS_SUPABASE_BUCKET` (optional, default `webmaster-droid-cms`)
- `CMS_PUBLIC_BASE_URL` (recommended for generated image URLs)
- `OPENAI_API_KEY` (required when `MODEL_OPENAI_ENABLED=true`)
- `GOOGLE_GENERATIVE_AI_API_KEY` (required when `MODEL_GEMINI_ENABLED=true`)

Important:

- Supabase Edge blocks user-defined secrets that start with `SUPABASE_`.
- Use `CMS_*` names for custom overrides and leave built-in `SUPABASE_*` values as provided by Supabase.

## 7. Add Supabase Edge function entrypoint

Use the starter template:

- [`templates/supabase/functions/webmaster-api/index.ts`](./templates/supabase/functions/webmaster-api/index.ts)

This file delegates directly to `supabaseHandler` from `@webmaster-droid/server`.

## 8. Deploy edge functions

```bash
npx @webmaster-droid/cli deploy supabase --project-ref your-project-ref --functions webmaster-api
```

Use `--no-verify-jwt` only if your gateway/auth layer already enforces bearer tokens upstream.

## 9. Verify

```bash
npm run build
npm run typecheck
npm test
```

Then run auth endpoint checks:

```bash
curl -i "$API_BASE_URL/api/session"
curl -i -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "$API_BASE_URL/api/session"
```

For production rollout steps, read:

- [`../guides/supabase-production-checklist.md`](../guides/supabase-production-checklist.md)
