# Contributing to webmaster-droid

Thanks for contributing.

## Development Setup

```bash
nvm use 20
npm install
npm run build
npm run typecheck
```

## Repository Layout

- `packages/*`: published packages
- `skills/*`: Codex skills bundled with the project

## Branches and PRs

1. Create a feature branch (`codex/<short-name>` recommended).
2. Keep changes focused and include tests when behavior changes.
3. Run validation before opening a PR:

```bash
npm run build
npm run typecheck
```

## Commit Guidance

- Use clear commit messages with scope.
- Avoid mixing unrelated refactors with feature work.

## Release Notes

Update `CHANGELOG.md` for user-facing changes.
