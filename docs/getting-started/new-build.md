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

```tsx
import { WebmasterDroidRuntime } from "@webmaster-droid/web";
import "@webmaster-droid/web/core.css";
import "@webmaster-droid/web/theme.css"; // optional

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <WebmasterDroidRuntime injectCoreStyles={false}>{children}</WebmasterDroidRuntime>;
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

## 5. Configure backend environment

Set required backend environment values including:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CMS_SUPABASE_URL` (optional override for runtime URL source)
- `CMS_SUPABASE_JWKS_URL` (optional override; default derives from `SUPABASE_URL`)
- `CMS_SUPABASE_AUTH_KEY` (optional auth fallback key for `/auth/v1/user`)
- `CMS_SUPABASE_BUCKET` (optional, default `webmaster-droid-cms`)
- `CMS_PUBLIC_BASE_URL` (required for generated image URLs)
- auth/model provider variables

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

## 6. Verify

```bash
npm run build
npm run typecheck
npm test
```
