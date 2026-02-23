# Guide: Content Edits in Plain Language

Use this guide to get reliable content edits without technical wording.

## What works best

- Name the page or section: `homepage hero`, `contact section`, `footer CTA`.
- Say the exact intent: `shorter`, `more formal`, `clearer`, `SEO-friendly`.
- Include constraints: `keep the same meaning`, `do not change links`, `max 2 sentences`.

## Prompt patterns

- `Rewrite the homepage hero subtitle to be clearer for first-time visitors.`
- `Change this selected section to a more professional tone, keep it under 40 words.`
- `Update the CTA label to "Get a Quote" and keep the URL the same.`

## Expected behavior

- The agent reads relevant draft content first.
- Only requested fields are changed.
- A draft update summary is returned.
- Live content remains unchanged until publish.

## Common pitfalls

- Too broad: `Make the whole site better.`
- Missing target: `Change this text.` (without selecting or naming section)
- Conflicting intent: `Make it shorter and include all details.`

## If the assistant asks a clarifying question

This usually means the request is ambiguous or risks editing the wrong area. Provide:

- target page/section
- desired outcome
- any constraints
