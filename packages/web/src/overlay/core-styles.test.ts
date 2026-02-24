import assert from "node:assert/strict";
import test from "node:test";

import {
  OVERLAY_CORE_STYLE_ID,
  OVERLAY_CORE_STYLE_TEXT,
  ensureOverlayCoreStyles,
} from "./core-styles";

type FakeStyleElement = {
  id: string;
  textContent: string | null;
};

function createFakeDocument() {
  const byId = new Map<string, FakeStyleElement>();
  const headChildren: FakeStyleElement[] = [];

  const head = {
    appendChild(element: FakeStyleElement) {
      headChildren.push(element);
      if (element.id) {
        byId.set(element.id, element);
      }
      return element;
    },
  };

  const fakeDocument = {
    head,
    documentElement: null,
    getElementById(id: string) {
      return byId.get(id) ?? null;
    },
    createElement(tagName: string) {
      assert.equal(tagName, "style");
      return { id: "", textContent: null } satisfies FakeStyleElement;
    },
  };

  return {
    fakeDocument: fakeDocument as unknown as Document,
    headChildren,
  };
}

test("ensureOverlayCoreStyles injects one style tag", () => {
  const { fakeDocument, headChildren } = createFakeDocument();

  ensureOverlayCoreStyles(fakeDocument);
  ensureOverlayCoreStyles(fakeDocument);

  assert.equal(headChildren.length, 1);
  assert.equal(headChildren[0]?.id, OVERLAY_CORE_STYLE_ID);
  assert.equal(headChildren[0]?.textContent, OVERLAY_CORE_STYLE_TEXT);
});

test("ensureOverlayCoreStyles is safe when document is missing", () => {
  assert.doesNotThrow(() => ensureOverlayCoreStyles(undefined));
});
