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

## 4. Use editable components

```tsx
import { EditableText } from "@webmaster-droid/web";

export function HeroTitle() {
  return <EditableText path="pages.home.hero.title" fallback="Build your website faster" as="h1" />;
}
```

If your runtime documents can be partial, pass a schema-shaped fallback document and normalize fetched content with:

- `normalizeCmsDocumentWithFallback` from `@webmaster-droid/web`

## 5. Configure backend environment

Set required backend environment values including:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CMS_SUPABASE_URL` (optional override for runtime URL source)
- `CMS_SUPABASE_JWKS_URL` (optional override, default derives from `SUPABASE_URL`)
- `CMS_SUPABASE_AUTH_KEY` (optional auth fallback key for `/auth/v1/user`)
- `CMS_SUPABASE_BUCKET` (optional, default `webmaster-droid-cms`)
- `CMS_PUBLIC_BASE_URL` (recommended for generated image URLs)
- auth/model provider variables

Important:

- Supabase Edge blocks user-defined secrets that start with `SUPABASE_`.
- Use `CMS_*` names for custom overrides and leave built-in `SUPABASE_*` values as provided by Supabase.

## 6. Add Supabase Edge function entrypoint

Use the starter template:

- [`templates/supabase/functions/webmaster-api/index.ts`](./templates/supabase/functions/webmaster-api/index.ts)

This file delegates directly to `supabaseHandler` from `@webmaster-droid/server`.

## 7. Deploy edge functions

```bash
npx @webmaster-droid/cli deploy supabase --project-ref your-project-ref --functions webmaster-api
```

Use `--no-verify-jwt` only if your gateway/auth layer already enforces bearer tokens upstream.

## 8. Verify

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
