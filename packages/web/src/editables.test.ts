import assert from "node:assert/strict";
import test from "node:test";

import { editableMeta } from "./editables";

test("editableMeta warns once for invalid root path in development", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const warnings: string[] = [];
  const originalWarn = console.warn;

  try {
    process.env.NODE_ENV = "development";
    console.warn = (...messages: unknown[]) => {
      warnings.push(messages.map((item) => String(item)).join(" "));
    };

    const first = editableMeta({
      componentName: "EditableText",
      path: "components.footer.copyright",
      label: "Footer copyright",
      kind: "text",
    });
    const second = editableMeta({
      componentName: "EditableText",
      path: "components.footer.copyright",
      label: "Footer copyright",
      kind: "text",
    });

    assert.deepEqual(first, {});
    assert.deepEqual(second, {});
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /editable paths must start with one of/i);
    assert.match(warnings[0], /webmaster-droid seed/i);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    console.warn = originalWarn;
  }
});

test("editableMeta does not warn for valid root paths", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const warnings: string[] = [];
  const originalWarn = console.warn;

  try {
    process.env.NODE_ENV = "development";
    console.warn = (...messages: unknown[]) => {
      warnings.push(messages.map((item) => String(item)).join(" "));
    };

    const attrs = editableMeta({
      componentName: "EditableLink",
      path: "pages.home.hero.ctaLabel",
      label: "Hero CTA",
      kind: "link",
      relatedPaths: ["pages.home.hero.ctaHref"],
      preview: "/about",
    });

    assert.equal(attrs["data-wmd-path"], "pages.home.hero.ctaLabel");
    assert.equal(attrs["data-wmd-kind"], "link");
    assert.equal(warnings.length, 0);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
    console.warn = originalWarn;
  }
});
