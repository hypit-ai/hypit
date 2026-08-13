import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  closeDocument,
  discoverMarkup,
  parseOpeningTag,
  parseStructuredElement,
  skipTextTrivia,
} from "@narratage/markup";
import type { SourceUnit, StructuredElement } from "@narratage/markup";

import { maskedSourceHeader } from "./svs.js";

export type ProvidedFile = {
  /** The Logical Output this file stands in for, such as `take.video`. */
  readonly output: string;
  readonly path: string;
  readonly mediaType: string;
};

/** A value an author supplied on disk, such as a semantic map from elsewhere. */
export type ProvidedValue = {
  readonly output: string;
  readonly path: string;
};

export type RunFacts = {
  readonly path: string;
  readonly author?: string;
  readonly targets: readonly string[];
  /** Outputs an author has already supplied as files on disk. */
  readonly files: readonly ProvidedFile[];
  /** Outputs supplied as authored values, read as canonical JSON. */
  readonly values: readonly ProvidedValue[];
  /** Outputs satisfied from an earlier build's records. */
  readonly reused: readonly { readonly output: string; readonly build: string; readonly from: string }[];
};

function attribute(element: StructuredElement, name: string): string | undefined {
  const value = element.attributes[name];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function children(element: StructuredElement): readonly StructuredElement[] {
  return element.children.filter((child): child is StructuredElement => child.kind === "element");
}

/**
 * Read a Run Source for the material it already names.
 *
 * Candidate selection decides which Provider produces a value, which the
 * timeline does not care about. Two candidate kinds do matter, because they
 * supply the thing itself rather than a way to make it: `<file>` names material
 * already on disk, and `<build-record>` names a value an earlier build accepted.
 * Both let the preview show something real before this Source has ever been
 * built.
 */
export function readRunSource(path: string): RunFacts | undefined {
  if (!existsSync(path)) return undefined;
  try {
    return parseRunSource(path);
  } catch {
    // A Run Source that will not parse is an authoring problem in a second
    // file. The Source itself is still perfectly readable, and losing the whole
    // preview over a stray character somewhere else helps nobody.
    return undefined;
  }
}

function parseRunSource(path: string): RunFacts | undefined {
  const text = maskedSourceHeader(readFileSync(path, "utf8"));
  const unit: SourceUnit = { name: path, text };

  // A Run Source opens with <svrun>, not <svml>, so its prologue is walked here
  // rather than through the Author Source discovery.
  let cursor = skipTextTrivia(unit, 0);
  if (cursor >= text.length || text[cursor] !== "<") return undefined;
  const root = parseOpeningTag(unit, cursor);
  if (root.name !== "svrun") return undefined;
  cursor = root.end;

  const files: ProvidedFile[] = [];
  const values: ProvidedValue[] = [];
  const reused: { output: string; build: string; from: string }[] = [];
  const targets: string[] = [];
  const candidates = new Map<string, { kind: "file"; path: string; mediaType: string }
    | { kind: "value"; path: string }
    | { kind: "build-record"; build: string; output: string }>();
  const satisfactions: { output: string; candidate: string }[] = [];
  let author: string | undefined;

  while (cursor < text.length) {
    cursor = skipTextTrivia(unit, cursor);
    if (text.startsWith("</", cursor) || text[cursor] !== "<") break;
    const parsed = parseStructuredElement(unit, cursor);
    cursor = parsed.nextOffset;
    const element = parsed.element;
    if (element.name === "author") author = attribute(element, "source");
    else if (element.name === "target") {
      const output = attribute(element, "output");
      if (output !== undefined) targets.push(output);
    } else if (element.name === "file") {
      const id = attribute(element, "id");
      const from = attribute(element, "from");
      const mediaType = attribute(element, "media-type");
      if (id !== undefined && from !== undefined && mediaType !== undefined) {
        candidates.set(id, { kind: "file", path: resolve(dirname(path), from), mediaType });
      }
    } else if (element.name === "value") {
      const id = attribute(element, "id");
      const from = attribute(element, "from");
      if (id !== undefined && from !== undefined) {
        candidates.set(id, { kind: "value", path: resolve(dirname(path), from) });
      }
    } else if (element.name === "build-record") {
      const id = attribute(element, "id");
      const build = attribute(element, "build");
      const output = attribute(element, "output");
      if (id !== undefined && build !== undefined && output !== undefined) {
        candidates.set(id, { kind: "build-record", build, output });
      }
    } else if (element.name === "satisfy") {
      const output = attribute(element, "output");
      const candidate = attribute(element, "candidate");
      if (output !== undefined && candidate !== undefined) satisfactions.push({ output, candidate });
    }
    // <fragment> and any future declaration are read past: they name a way to
    // produce something rather than the thing itself.
    for (const child of children(element)) void child;
  }
  try { closeDocument(unit, cursor); } catch { /* a truncated Run Source still yields what it named */ }

  for (const { output, candidate } of satisfactions) {
    const declared = candidates.get(candidate);
    if (declared === undefined) continue;
    if (declared.kind === "value") {
      if (existsSync(declared.path)) values.push({ output, path: declared.path });
    } else if (declared.kind === "file") {
      // A path an author wrote but has not produced yet is not material.
      if (existsSync(declared.path)) {
        files.push({ output, path: declared.path, mediaType: declared.mediaType });
      }
    } else {
      reused.push({ output, build: declared.build, from: declared.output });
    }
  }

  return { path, ...(author === undefined ? {} : { author }), targets, files, values, reused };
}
