import path from "node:path";

import { parse } from "@babel/parser";
import traverseImport from "@babel/traverse";
import generateImport from "@babel/generator";
import * as t from "@babel/types";

const traverse =
  (traverseImport as unknown as { default?: typeof traverseImport }).default ?? traverseImport;
const generate =
  (generateImport as unknown as { default?: typeof generateImport }).default ?? generateImport;
const PARSER_PLUGINS: ("typescript" | "jsx")[] = ["typescript", "jsx"];

interface TextReplacement {
  start: number;
  end: number;
  value: string;
}

function parseModule(source: string) {
  return parse(source, {
    sourceType: "module",
    plugins: PARSER_PLUGINS,
  });
}

export function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function defaultPathFor(file: string, line: number, kind: "text" | "link" | "image") {
  const normalized = file
    .replace(/\\/g, "/")
    .replace(/^\//, "")
    .replace(/\.[tj]sx?$/, "");

  const stem = normalized
    .split("/")
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .map((segment) =>
      segment
        .replace(/[^a-zA-Z0-9]+/g, "-")
        .replace(/^-+/, "")
        .replace(/-+$/, "")
    )
    .filter(Boolean)
    .join(".");

  return `pages.todo.${stem || "file"}.${kind}.${line}`;
}

function escapeJsxString(value: string): string {
  return JSON.stringify(value);
}

function applyReplacements(source: string, replacements: TextReplacement[]): string {
  if (replacements.length === 0) {
    return source;
  }

  const sorted = [...replacements].sort((a, b) => b.start - a.start);
  let out = source;
  for (const replacement of sorted) {
    out = out.slice(0, replacement.start) + replacement.value + out.slice(replacement.end);
  }

  return out;
}

function hasEditableTextImportDeclaration(node: t.ImportDeclaration): boolean {
  return (
    node.source.value === "@webmaster-droid/web" &&
    node.specifiers.some(
      (specifier) =>
        t.isImportSpecifier(specifier) &&
        t.isIdentifier(specifier.imported) &&
        specifier.imported.name === "EditableText"
    )
  );
}

function ensureEditableTextImport(source: string): string {
  const ast = parseModule(source);
  const body = ast.program.body;

  let lastImportEnd = 0;
  let moduleImport: t.ImportDeclaration | null = null;

  for (const node of body) {
    if (!t.isImportDeclaration(node)) {
      break;
    }

    lastImportEnd = node.end ?? lastImportEnd;

    if (node.source.value === "@webmaster-droid/web" && node.importKind !== "type" && !moduleImport) {
      moduleImport = node;
    }
  }

  if (moduleImport && hasEditableTextImportDeclaration(moduleImport)) {
    return source;
  }

  if (moduleImport) {
    const hasNamespaceSpecifier = moduleImport.specifiers.some((specifier) =>
      t.isImportNamespaceSpecifier(specifier)
    );

    if (!hasNamespaceSpecifier && moduleImport.start !== null && moduleImport.end !== null) {
      const updatedImport = t.cloneNode(moduleImport);
      updatedImport.specifiers.push(
        t.importSpecifier(t.identifier("EditableText"), t.identifier("EditableText"))
      );

      const importSource = generate(updatedImport, { compact: false }).code;
      return (
        source.slice(0, moduleImport.start) + importSource + source.slice(moduleImport.end)
      );
    }
  }

  const importLine = `import { EditableText } from "@webmaster-droid/web";\n`;
  if (lastImportEnd > 0) {
    let insertionPoint = lastImportEnd;
    if (source.slice(insertionPoint, insertionPoint + 2) === "\r\n") {
      insertionPoint += 2;
    } else if (source[insertionPoint] === "\n") {
      insertionPoint += 1;
    }

    return source.slice(0, insertionPoint) + importLine + source.slice(insertionPoint);
  }

  return `${importLine}${source}`;
}

export function transformEditableTextCodemod(
  source: string,
  filePath: string,
  cwd: string
): { changed: boolean; next: string } {
  const ast = parseModule(source);

  let touched = false;
  const replacements: TextReplacement[] = [];

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
      const targetNode = nonWhitespace[0];
      if (typeof targetNode.start !== "number" || typeof targetNode.end !== "number") {
        return;
      }

      const replacement = `<EditableText path=${escapeJsxString(pathHint)} fallback=${escapeJsxString(text)} />`;
      replacements.push({
        start: targetNode.start,
        end: targetNode.end,
        value: replacement,
      });

      touched = true;
    },
  });

  if (!touched) {
    return {
      changed: false,
      next: source,
    };
  }

  let next = applyReplacements(source, replacements);
  next = ensureEditableTextImport(next);

  // Safety check: never emit broken TSX.
  parseModule(next);

  if (source.endsWith("\n") && !next.endsWith("\n")) {
    next += "\n";
  }

  return {
    changed: next !== source,
    next,
  };
}
