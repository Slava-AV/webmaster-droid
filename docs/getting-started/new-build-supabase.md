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

## 5. Configure backend environment

Set required backend environment values including:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWKS_URL`
- `CMS_SUPABASE_BUCKET` (optional, default `webmaster-droid-cms`)
- `CMS_PUBLIC_BASE_URL` (recommended for generated image URLs)
- auth/model provider variables

## 6. Deploy edge functions

```bash
npx @webmaster-droid/cli deploy supabase --project-ref your-project-ref --functions webmaster-api
```

## 7. Verify

```bash
npm run build
npm run typecheck
npm test
```
