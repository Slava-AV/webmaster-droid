# webmaster-droid

`webmaster-droid` helps non-technical website owners make quick, reliable changes in plain language.

It provides an in-site admin chat that understands intent, edits content safely in draft mode, can generate or edit images, and uses visual context from existing site images when needed.

## Core Value

- Non-technical editors can request website updates without writing code.
- Changes are reliable: draft-first, checkpointed history, explicit publish.
- Image workflows are built in: generate new images, edit existing images, and use vision context.

## Use as an editor (non-technical)

Start here if you only want to edit website content safely.

1. Open the admin overlay in your website.
2. Ask for changes in plain language.
3. Review draft updates and history.
4. Publish only when ready.

Read: [`docs/getting-started/non-technical-quickstart.md`](docs/getting-started/non-technical-quickstart.md)

## Integrate as a developer

Use this path to add Webmaster Droid to a React/Next.js project.

Install packages:

```bash
npm i @webmaster-droid/contracts @webmaster-droid/web @webmaster-droid/server
```

Initialize project configuration:

```bash
npx @webmaster-droid/cli doctor
npx @webmaster-droid/cli init
```

Generate first-run seed content from `Editable*` paths:

```bash
npx @webmaster-droid/cli seed src --out cms/seed.from-editables.json
```

Upload this seed to both `cms/live/current.json` and `cms/draft/current.json` before first editor mutations.

Use AWS instead:

```bash
npx @webmaster-droid/cli init --backend aws
```

Safe overlay styles:

- Required overlay layout styles are injected automatically by runtime.
- Optional overlay skin: `import "@webmaster-droid/web/theme.css";`
- Strict CSP path: `import "@webmaster-droid/web/core.css";` and set `injectCoreStyles={false}`.
- Tailwind hosts do not need `@source` or package class scanning for overlay placement.

Read:

- [`docs/getting-started/new-build.md`](docs/getting-started/new-build.md)
- [`docs/getting-started/migrate-existing.md`](docs/getting-started/migrate-existing.md)

## Optional migration acceleration skill

Migration skill is optional and developer-facing. It is not required for day-to-day non-technical editing.

```bash
CODEX_HOME=~/.codex npx @webmaster-droid/cli skill install
```

Read: [`docs/migration/optional-skill.md`](docs/migration/optional-skill.md)

## Documentation map

- Value proposition: [`docs/value-proposition.md`](docs/value-proposition.md)
- Non-technical editor journey: [`docs/user-journeys/non-technical-editor.md`](docs/user-journeys/non-technical-editor.md)
- Content editing guide: [`docs/guides/content-edits.md`](docs/guides/content-edits.md)
- Image workflows guide: [`docs/guides/image-workflows.md`](docs/guides/image-workflows.md)
- Reliability and safety: [`docs/guides/reliability-and-safety.md`](docs/guides/reliability-and-safety.md)
- API contracts: [`docs/api/openapi.api.yaml`](docs/api/openapi.api.yaml)

## Packages

- `@webmaster-droid/contracts`: shared CMS contracts and types.
- `@webmaster-droid/web`: editable components, runtime context, and admin overlay.
- `@webmaster-droid/server`: backend service, AI agent, storage adapters, and API adapters for Supabase/AWS.
- `@webmaster-droid/cli`: initialization, schema, scan/codemod, doctor, deploy, and skill install tools.

## Server import paths

- Supabase route handler (works in standard Node/Edge runtimes):
  - `import { supabaseHandler } from "@webmaster-droid/server";`
- AWS handlers:
  - `import { handler, streamHandler } from "@webmaster-droid/server/api-aws";`

## Security

Report vulnerabilities via [`SECURITY.md`](SECURITY.md).
