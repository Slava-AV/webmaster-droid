# Guide: Reliability and Safety

Reliability is a product feature, not an afterthought.

## Safety model

- Draft-first edits: user requests update draft content first.
- Checkpointed history: mutating requests create recoverable checkpoints.
- Explicit publish: live site changes only on publish confirmation.
- Clear limitations: unsupported operations are surfaced plainly.

## Operational safeguards

- The assistant applies only explicit requested edits.
- High-risk or ambiguous requests trigger clarification.
- Missing schema paths are blocked instead of guessed.

## Recovery workflow

1. Open History tab.
2. Pick a checkpoint or published snapshot.
3. Restore draft.
4. Re-review and publish.

## Non-technical expectation setting

- "Saved" means saved to draft, not live.
- "Published" means visible to site visitors.
- If a request cannot be safely completed, the assistant should explain why in plain language.
