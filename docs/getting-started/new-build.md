# Developer Getting Started: New Build

Use this path when building a new React/Next.js site with Webmaster Droid from day one.

## 1. Install packages

```bash
npm i @webmaster-droid/contracts @webmaster-droid/web @webmaster-droid/server
```

## 2. Initialize project config

```bash
npx @webmaster-droid/cli doctor
npx @webmaster-droid/cli init --framework next --backend aws
```

## 3. Wrap runtime in app

```tsx
import { WebmasterDroidRuntime } from "@webmaster-droid/web";
import "@webmaster-droid/web/styles.css";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <WebmasterDroidRuntime>{children}</WebmasterDroidRuntime>;
}
```

## 4. Use editable components

```tsx
import { EditableText } from "@webmaster-droid/web";

export function HeroTitle() {
  return <EditableText path="pages.home.hero.title" fallback="Build your website faster" as="h1" />;
}
```

## 5. Configure backend environment

Set required backend environment values including:

- `CMS_S3_BUCKET`
- `CMS_S3_REGION`
- `CMS_PUBLIC_BASE_URL` (required for generated image URLs)
- auth/model provider variables

## 6. Verify

```bash
npm run build
npm run typecheck
npm test
```
