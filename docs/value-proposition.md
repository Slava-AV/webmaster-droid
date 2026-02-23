# Value Proposition

Webmaster Droid enables non-technical website operators to make quick, reliable website updates in plain language.

## Who it is for

- Business owners and operators who need to update copy, images, and basic site content without coding.
- Marketing and content teams that need fast turnarounds with a safe draft workflow.
- Teams that want AI-assisted editing but still require review and explicit publish control.
- Developers who need to integrate a reliable editing layer for non-technical stakeholders.

## Who it is not for

- Teams looking for autonomous publishing without review.
- Workloads requiring unrestricted structural refactors of arbitrary codebases from the editor UI.
- Setups that cannot support draft/checkpoint/publish operational discipline.

## Product promise

- Understand intent from non-technical language.
- Apply reliable content edits in draft mode.
- Generate new images and edit existing images where supported.
- Use visual context from existing site images for better image-grounded requests.
- Keep edits recoverable with checkpoints and rollback.

## Reliability model

1. Changes are staged to draft first.
2. Each mutating request creates a checkpointable change trail.
3. Publish is explicit and separate.
4. Limitations are surfaced clearly when a request cannot be performed safely.
