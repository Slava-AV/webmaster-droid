# Webmaster Droid Agent Guide

This repository is docs-first.

## Mission

Prioritize non-technical website operators who need quick, reliable edits in plain language.

Core promises to preserve:

- intent understanding for non-technical requests
- reliable draft-first content edits
- generated image workflows
- existing-image edit workflows where supported
- vision-assisted context from existing site imagery
- explicit publish and rollback safety

## First sources to read

1. `README.md`
2. `docs/value-proposition.md`
3. `docs/getting-started/non-technical-quickstart.md`
4. `docs/guides/reliability-and-safety.md`
5. `docs/api/openapi.api-aws.yaml`

## Product constraints

- Draft changes are not live until publish.
- Never position migration skill as required for day-to-day editing.
- Capability claims must match runtime flags returned by `GET /api/models`.

## Optional migration skill

- Skill path: `skills/webmaster-droid-convert/SKILL.md`
- Use only for developer-led migration acceleration.
