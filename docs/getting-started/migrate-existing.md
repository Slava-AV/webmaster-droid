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

## 4. Generate seed document from editable paths

Generate a seed document that matches converted `Editable*` paths before first editor use:

```bash
npx @webmaster-droid/cli seed apps/site/src --out cms/seed.from-editables.json
```

Then upload or copy this seed into both stage files:

- `cms/live/current.json`
- `cms/draft/current.json`

Why this step matters:

- Mutations only apply to existing paths.
- If stage files are still empty defaults, first edits will fail with `path does not exist`.

## 5. Build schema manifest (optional but recommended)

```bash
npx @webmaster-droid/cli schema build --input cms/schema.webmaster.ts --output cms/schema.manifest.json
```

## 6. Handle array-rendered content explicitly

Codemod handles static JSX text. For array-driven UI (`items.map(...)`), add explicit editable components:

```tsx
{cards.map((card, i) => (
  <article key={card.id}>
    <h3>
      <EditableText
        path={`pages.gallery.cards.${i}.title`}
        fallback={card.title}
      />
    </h3>
    <p>
      <EditableText
        path={`pages.gallery.cards.${i}.description`}
        fallback={card.description}
      />
    </p>
  </article>
))}
```

After adding new paths, regenerate and reseed:

```bash
npx @webmaster-droid/cli seed apps/site/src --out cms/seed.from-editables.json
```

## 7. Validate and test

```bash
npx @webmaster-droid/cli doctor
npm run build
npm run typecheck
npm test
```

## 8. Optional migration skill

Use migration skill only if you want extra guided conversion assistance.

Read: [`../migration/optional-skill.md`](../migration/optional-skill.md)
