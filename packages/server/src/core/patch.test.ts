import assert from "node:assert/strict";
import test from "node:test";

import type { CmsDocument, CmsPatch } from "@webmaster-droid/contracts";
import { createDefaultCmsDocument } from "@webmaster-droid/contracts";

import { applyPatch, applyThemeTokenPatch, readByPath } from "./patch";

type LooseCmsDocument = CmsDocument<Record<string, any>, Record<string, any>, string>;

function createDocument(): LooseCmsDocument {
  const document = createDefaultCmsDocument();
  document.pages = {
    home: {
      hero: {
        title: "Welcome",
        views: 7,
        published: true,
      },
      features: [
        { title: "Fast" },
        { title: "Safe" },
      ],
    },
  };

  return document;
}

const options = {
  maxOperationsPerPatch: 10,
  allowedInternalPaths: ["/", "/about/", "/contact/"],
};

test("readByPath resolves nested object and array values", () => {
  const source = createDocument();

  assert.equal(readByPath(source, "pages.home.hero.title"), "Welcome");
  assert.equal(readByPath(source, "pages.home.features[1].title"), "Safe");
});

test("readByPath returns undefined for invalid traversal", () => {
  const source = createDocument();

  assert.equal(readByPath(source, "pages.home.features.one.title"), undefined);
  assert.equal(readByPath(source, "pages.home.hero.title.value"), undefined);
});

test("applyPatch writes updates without mutating the source document", () => {
  const source = createDocument();
  const patch: CmsPatch = {
    operations: [
      {
        op: "set",
        path: "pages.home.hero.title",
        value: "Hello",
      },
      {
        op: "set",
        path: "pages.home.features[0].title",
        value: "Reliable",
      },
    ],
  };

  const result = applyPatch(source, patch, options);

  assert.equal(readByPath(result.document, "pages.home.hero.title"), "Hello");
  assert.equal(readByPath(result.document, "pages.home.features[0].title"), "Reliable");
  assert.equal(readByPath(source, "pages.home.hero.title"), "Welcome");
  assert.equal(readByPath(source, "pages.home.features[0].title"), "Fast");
  assert.deepEqual(result.warnings, []);
});

test("applyPatch keeps applying but emits warnings for type mismatches", () => {
  const source = createDocument();
  const patch: CmsPatch = {
    operations: [
      {
        op: "set",
        path: "pages.home.hero.views",
        value: "many",
      },
      {
        op: "set",
        path: "pages.home.hero.published",
        value: "yes",
      },
    ],
  };

  const result = applyPatch(source, patch, options);

  assert.equal(readByPath(result.document, "pages.home.hero.views"), "many");
  assert.equal(readByPath(result.document, "pages.home.hero.published"), "yes");
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings[0] ?? "", /Numeric field/);
  assert.match(result.warnings[1] ?? "", /Boolean field/);
});

test("applyPatch throws when target path does not exist", () => {
  const source = createDocument();
  const patch: CmsPatch = {
    operations: [
      {
        op: "set",
        path: "pages.home.hero.subtitle",
        value: "Nope",
      },
    ],
  };

  assert.throws(() => applyPatch(source, patch, options), /cannot be created by patch_content/);
});

test("applyThemeTokenPatch updates valid values and warns on invalid ones", () => {
  const source = createDocument();
  const originalDark = source.themeTokens.brandDark;
  const originalText = source.themeTokens.brandText;

  const result = applyThemeTokenPatch(source, {
    brandPrimary: "#ff0000",
    brandDark: "   ",
    brandText: 42 as unknown as string,
  });

  assert.equal(result.document.themeTokens.brandPrimary, "#ff0000");
  assert.equal(result.document.themeTokens.brandDark, originalDark);
  assert.equal(result.document.themeTokens.brandText, originalText);
  assert.equal(source.themeTokens.brandPrimary, createDefaultCmsDocument().themeTokens.brandPrimary);
  assert.equal(result.warnings.length, 2);
  assert.match(result.warnings.join("\n"), /brandDark/);
  assert.match(result.warnings.join("\n"), /brandText/);
});
