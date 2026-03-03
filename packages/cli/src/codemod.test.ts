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

test("defaultPathFor strips relative traversal segments", () => {
  assert.equal(
    defaultPathFor("../../demo-site-2/src/app/page.tsx", 4, "text"),
    "pages.todo.demo-site-2.src.app.page.text.4"
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

test("transformEditableTextCodemod inserts import on its own line", () => {
  const source = `import Link from "next/link";

export default function Hero() {
  return <h1>Hello world</h1>;
}
`;

  const result = transformEditableTextCodemod(source, "/repo/src/app/page.tsx", "/repo");

  assert.match(result.next, /import Link from "next\/link";\nimport \{ EditableText \} from "@webmaster-droid\/web";/);
  assert.equal(result.next.includes('";import Link'), false);
});

test("transformEditableTextCodemod keeps map arrow wrapping stable", () => {
  const source = `export default function Gallery() {
  return (
    <div>
      {[1, 2].map((item) => (
        <section key={item}>
          <h2>Title</h2>
        </section>
      ))}
    </div>
  );
}
`;

  const result = transformEditableTextCodemod(source, "/repo/src/app/gallery/page.tsx", "/repo");

  assert.equal(result.changed, true);
  assert.match(result.next, /map\(\(item\) => \(\n        <section key=\{item\}>/);
  assert.match(result.next, /<h2><EditableText path=/);
});

test("transformEditableTextCodemod does not duplicate existing EditableText import", () => {
  const source = `import { EditableText } from "@webmaster-droid/web";

export const Card = () => <p>Card copy</p>;\n`;

  const result = transformEditableTextCodemod(source, "/repo/src/Card.tsx", "/repo");

  assert.equal(result.changed, true);

  const importMatches = result.next.match(/from "@webmaster-droid\/web"/g) ?? [];
  assert.equal(importMatches.length, 1);
});

test("transformEditableTextCodemod augments existing webmaster-droid import", () => {
  const source = `import { EditableImage } from "@webmaster-droid/web";

export const Hero = () => <p>Card copy</p>;
`;

  const result = transformEditableTextCodemod(source, "/repo/src/Card.tsx", "/repo");

  assert.match(result.next, /import \{ EditableImage, EditableText \} from "@webmaster-droid\/web";/);
  const importMatches = result.next.match(/from "@webmaster-droid\/web"/g) ?? [];
  assert.equal(importMatches.length, 1);
});

test("transformEditableTextCodemod preserves trailing newline", () => {
  const source = `export const Card = () => <p>Card copy</p>;\n`;

  const result = transformEditableTextCodemod(source, "/repo/src/Card.tsx", "/repo");

  assert.equal(result.next.endsWith("\n"), true);
});

test("transformEditableTextCodemod is idempotent", () => {
  const source = `import Link from "next/link";

export default function Hero() {
  return <h1>Hello world</h1>;
}
`;

  const once = transformEditableTextCodemod(source, "/repo/src/app/page.tsx", "/repo");
  const twice = transformEditableTextCodemod(once.next, "/repo/src/app/page.tsx", "/repo");

  assert.equal(once.changed, true);
  assert.equal(twice.changed, false);
  assert.equal(twice.next, once.next);
});

test("transformEditableTextCodemod skips mixed JSX children", () => {
  const source = `export const Mixed = () => <p>Hi <strong>ok</strong></p>;\n`;

  const result = transformEditableTextCodemod(source, "/repo/src/Mixed.tsx", "/repo");

  assert.equal(result.changed, false);
  assert.equal(result.next, source);
});
