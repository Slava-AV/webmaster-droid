# Optional Migration Skill

The migration skill is optional and intended for developer-led migration work.

It is not required for routine non-technical editing in the admin overlay.

## When to use it

Use the skill when migration includes many static JSX sections and you want guided, repeatable conversion steps.

## Install

```bash
CODEX_HOME=~/.codex npx @webmaster-droid/cli skill install
```

## Scope

- Helps with migration flow (`scan`, `codemod`, validation checks).
- Does not replace runtime editing features for non-technical operators.

## Recommendation

Default to docs-first workflows. Add the skill only when migration complexity justifies it.
