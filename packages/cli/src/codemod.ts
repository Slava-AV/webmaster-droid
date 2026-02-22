import path from "node:path";

import { parse } from "@babel/parser";
import traverseImport from "@babel/traverse";
import generateImport from "@babel/generator";
import * as t from "@babel/types";

const traverse =
  (traverseImport as unknown as { default?: typeof traverseImport }).default ?? traverseImport;
const generate =
  (generateImport as unknown as { default?: typeof generateImport }).default ?? generateImport;

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function defaultPathFor(file: string, line: number, kind: "text" | "link" | "image") {
  const stem = file
    .replace(/\\/g, "/")
    .replace(/^\//, "")
    .replace(/\.[tj]sx?$/, "")
    .replace(/[^a-zA-Z0-9/]+/g, "-")
    .replace(/\//g, ".");

  return `pages.todo.${stem}.${kind}.${line}`;
}

export function transformEditableTextCodemod(
  source: string,
  filePath: string,
  cwd: string
): { changed: boolean; next: string } {
  const ast = parse(source, {
    sourceType: "module",
    plugins: ["typescript", "jsx"],
  });

  let touched = false;
  let needsEditableTextImport = false;

  traverse(ast, {
    JSXElement(pathNode) {
      const children = pathNode.node.children;
      const nonWhitespace = children.filter(
        (child) => !(t.isJSXText(child) && normalizeText(child.value) === "")
      );

      if (nonWhitespace.length !== 1 || !t.isJSXText(nonWhitespace[0])) {
        return;
      }

      const text = normalizeText(nonWhitespace[0].value);
      if (!text || text.length < 3) {
        return;
      }

      const loc = nonWhitespace[0].loc?.start.line ?? 0;
      const rel = path.relative(cwd, filePath);
      const pathHint = defaultPathFor(rel, loc, "text");

      const editableEl = t.jsxElement(
        t.jsxOpeningElement(
          t.jsxIdentifier("EditableText"),
          [
            t.jsxAttribute(t.jsxIdentifier("path"), t.stringLiteral(pathHint)),
            t.jsxAttribute(t.jsxIdentifier("fallback"), t.stringLiteral(text)),
          ],
          true
        ),
        null,
        [],
        true
      );

      pathNode.node.children = [t.jsxExpressionContainer(editableEl)];
      touched = true;
      needsEditableTextImport = true;
    },
  });

  if (!touched) {
    return {
      changed: false,
      next: source,
    };
  }

  if (needsEditableTextImport) {
    const body = ast.program.body;
    const hasImport = body.some(
      (node) =>
        t.isImportDeclaration(node) &&
        node.source.value === "@webmaster-droid/web" &&
        node.specifiers.some(
          (specifier) =>
            t.isImportSpecifier(specifier) &&
            t.isIdentifier(specifier.imported) &&
            specifier.imported.name === "EditableText"
        )
    );

    if (!hasImport) {
      body.unshift(
        t.importDeclaration(
          [
            t.importSpecifier(
              t.identifier("EditableText"),
              t.identifier("EditableText")
            ),
          ],
          t.stringLiteral("@webmaster-droid/web")
        )
      );
    }
  }

  const next = generate(ast, { retainLines: true }, source).code;
  return {
    changed: next !== source,
    next,
  };
}
