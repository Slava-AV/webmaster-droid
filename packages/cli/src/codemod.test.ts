import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultPathFor,
  normalizeText,
  transformEditableTextCodemod,
} from "./codemod";

test("normalizeText compacts whitespace", () => {
  assert.equal(normalizeText("  hello\n\tworld  "), "hello world");
});

test("defaultPathFor creates deterministic editable path hints", () => {
  assert.equal(
    defaultPathFor("/src/pages/Home Hero.tsx", 12, "text"),
    "pages.todo.src.pages.Home-Hero.text.12"
  );
});

test("transformEditableTextCodemod wraps plain JSX text and adds EditableText import", () => {
  const source = `export function Hero() {
  return (
    <section>
      <h1>  Hello   world </h1>
    </section>
  );
}\n`;

  const result = transformEditableTextCodemod(source, "/repo/src/pages/Hero.tsx", "/repo");

  assert.equal(result.changed, true);
  assert.match(result.next, /import \{ EditableText \} from "@webmaster-droid\/web";/);
  assert.match(result.next, /fallback="Hello world"/);
  assert.match(result.next, /path="pages\.todo\.src\.pages\.Hero\.text\.\d+"/);
});

test("transformEditableTextCodemod does not duplicate existing EditableText import", () => {
  const source = `import { EditableText } from "@webmaster-droid/web";

export const Card = () => <p>Card copy</p>;\n`;

  const result = transformEditableTextCodemod(source, "/repo/src/Card.tsx", "/repo");

  assert.equal(result.changed, true);

  const importMatches = result.next.match(/from "@webmaster-droid\/web"/g) ?? [];
  assert.equal(importMatches.length, 1);
});

test("transformEditableTextCodemod skips mixed JSX children", () => {
  const source = `export const Mixed = () => <p>Hi <strong>ok</strong></p>;\n`;

  const result = transformEditableTextCodemod(source, "/repo/src/Mixed.tsx", "/repo");

  assert.equal(result.changed, false);
  assert.equal(result.next, source);
});
