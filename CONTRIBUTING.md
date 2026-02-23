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

## Release Workflow

Package publishing is automated with Changesets and GitHub Actions.

1. For any PR that changes files under `packages/**`, add a changeset file:

```bash
npm run changeset
```

2. Commit the generated `.changeset/*.md` file with your feature/fix.
3. After merge to `main`, the release workflow creates/updates a release PR.
4. Merging the release PR publishes changed packages to npm and syncs `alpha` dist-tags.

### Publish Failure Recovery

If a publish job partially fails:

1. Fix the root cause in a normal PR.
2. Add a follow-up changeset for the affected package(s).
3. Merge to `main` to generate a new release PR, or rerun `Release Packages` via `workflow_dispatch` after confirming no conflicting in-flight release.
