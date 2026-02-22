import assert from "node:assert/strict";
import test from "node:test";

import { normalizeEditablePath } from "./normalize-editable-path";

test("normalizeEditablePath accepts valid editable roots and trims whitespace", () => {
  assert.equal(normalizeEditablePath(" pages.home.hero.title "), "pages.home.hero.title");
  assert.equal(normalizeEditablePath("layout.header.menuLabel"), "layout.header.menuLabel");
  assert.equal(normalizeEditablePath("seo.home.title"), "seo.home.title");
  assert.equal(normalizeEditablePath("themeTokens.brandPrimary"), "themeTokens.brandPrimary");
});

test("normalizeEditablePath rejects non-string and empty values", () => {
  assert.equal(normalizeEditablePath(null), null);
  assert.equal(normalizeEditablePath(undefined), null);
  assert.equal(normalizeEditablePath(123), null);
  assert.equal(normalizeEditablePath("   "), null);
});

test("normalizeEditablePath enforces root prefix and max length", () => {
  assert.equal(normalizeEditablePath("meta.contentVersion"), null);

  const maxLengthPath = `pages.${"a".repeat(314)}`;
  const tooLongPath = `pages.${"a".repeat(315)}`;

  assert.equal(maxLengthPath.length, 320);
  assert.equal(tooLongPath.length, 321);
  assert.equal(normalizeEditablePath(maxLengthPath), maxLengthPath);
  assert.equal(normalizeEditablePath(tooLongPath), null);
});
