import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultCmsDocument,
  type CmsDocument,
} from "@webmaster-droid/contracts";

import { normalizeCmsDocumentWithFallback } from "./normalize-document";

interface GalleryPages {
  gallery: {
    postcards: Array<{ title: string }>;
  };
}

type GalleryDocument = CmsDocument<GalleryPages, object, string>;

function createGalleryFallback(): GalleryDocument {
  const base = createDefaultCmsDocument();
  return {
    ...base,
    layout: {},
    seo: {},
    pages: {
      gallery: {
        postcards: [{ title: "Starter postcard" }],
      },
    },
  };
}

test("normalizeCmsDocumentWithFallback fills missing nested sections from fallback schema", () => {
  const fallback = createGalleryFallback();
  const partial = {
    ...fallback,
    pages: {},
  };

  const normalized = normalizeCmsDocumentWithFallback<GalleryDocument>(partial, fallback);

  assert.equal(normalized.pages.gallery.postcards.length, 1);
  assert.equal(normalized.pages.gallery.postcards[0]?.title, "Starter postcard");
});

test("normalizeCmsDocumentWithFallback preserves existing runtime values", () => {
  const fallback = createGalleryFallback();
  const partial = {
    ...fallback,
    pages: {
      gallery: {
        postcards: [{ title: "Runtime postcard" }],
      },
    },
  };

  const normalized = normalizeCmsDocumentWithFallback<GalleryDocument>(partial, fallback);

  assert.equal(normalized.pages.gallery.postcards.length, 1);
  assert.equal(normalized.pages.gallery.postcards[0]?.title, "Runtime postcard");
});

test("normalizeCmsDocumentWithFallback tolerates non-object runtime payloads", () => {
  const fallback = createGalleryFallback();
  const normalized = normalizeCmsDocumentWithFallback<GalleryDocument>(null, fallback);

  assert.equal(normalized.pages.gallery.postcards[0]?.title, "Starter postcard");
});
