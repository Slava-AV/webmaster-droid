# Guide: Image Workflows

Webmaster Droid supports image generation and image edits through the same chat workflow used for content edits.

## Generate a new image

Example:

`Generate a new hero image for a premium landscaping service in early morning light.`

Expected behavior:

- Agent generates a new image.
- Image URL is staged into the requested image field in draft.
- Draft update summary confirms the change.

## Edit an existing image

Example:

`Use the current hero image and make it warmer, with softer contrast.`

Expected behavior:

- Agent uses existing image as reference (edit mode) when supported.
- Updated image is staged in draft.

## Reference-image constraints

For edit mode references, supported source formats are JPEG or PNG.

If the current image cannot be used as a valid reference, the assistant should explain the limitation and ask for a compatible image path/asset.

## Vision context behavior

When a request is visual or image-grounded, the system can attach existing site images as context.

Examples:

- `Does this hero image feel too dark for the headline?`
- `Match the style of the current banner image for a new promo image.`

If no suitable context image is available, the assistant should say so clearly and continue with best available context.

## Draft and publish model

Image changes are draft-first by default and are not live until publish.
