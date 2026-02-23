# Developer Getting Started: Migrate Existing Website

Use this path to convert existing static JSX content into editable fields incrementally.

## 1. Run discovery scan

```bash
npx @webmaster-droid/cli scan apps/site/src --out .webmaster-droid/scan-report.json
```

## 2. Preview codemod changes

```bash
npx @webmaster-droid/cli codemod apps/site/src --out .webmaster-droid/codemod-report.json
```

## 3. Apply codemod when reviewed

```bash
npx @webmaster-droid/cli codemod apps/site/src --apply --out .webmaster-droid/codemod-report.applied.json
```

## 4. Build schema manifest (optional but recommended)

```bash
npx @webmaster-droid/cli schema build --input cms/schema.webmaster.ts --output cms/schema.manifest.json
```

## 5. Validate and test

```bash
npx @webmaster-droid/cli doctor
npm run build
npm run typecheck
npm test
```

## 6. Optional migration skill

Use migration skill only if you want extra guided conversion assistance.

Read: [`../migration/optional-skill.md`](../migration/optional-skill.md)
