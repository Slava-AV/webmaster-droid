# User Journey: Non-Technical Editor

This journey shows how a non-technical editor can safely update a website from request to publish.

## Flow 1: Update copy

1. Open overlay and sign in.
2. Ask: `Change the homepage hero title to "Reliable website updates in minutes".`
3. Review assistant response and draft update summary.
4. Verify in-page preview.
5. Publish when satisfied.

Expected result:
- Copy is changed in draft.
- History contains a new checkpoint.
- Live site is unchanged until publish.

## Flow 2: Replace hero image

1. Ask: `Generate a new hero image for a modern landscaping business website.`
2. Review generated image in draft.
3. If needed, refine with another prompt.
4. Publish when ready.

Expected result:
- A new image URL is staged in draft.
- Change summary indicates draft-only status.

## Flow 3: Edit existing image style

1. Ask: `Keep the current hero image composition, but make it warmer and brighter.`
2. System uses existing image as reference when supported.
3. Review updated draft image.
4. Publish when ready.

Expected result:
- Existing image field is updated in draft.
- If reference image constraints are not met, the assistant explains the limitation clearly.

## Flow 4: Publish safely

1. Open History tab and review recent checkpoints.
2. If needed, restore a prior checkpoint.
3. Publish draft explicitly.

Expected result:
- Live state updates only after explicit publish.
- Rollback remains available through history snapshots.
