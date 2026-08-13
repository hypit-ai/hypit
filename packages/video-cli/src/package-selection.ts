import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { discoverMarkup, markupAuthorFrontendId } from "@narratage/markup";
import { parseRunDocument, runMarkupFrontendId } from "@narratage/run-markup";
import { maskSourceHeader, parseSourceHeader } from "@narratage/source";

function isWithin(root: string, path: string): boolean {
  const relation = relative(root, path);
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
}

/** Convert a logical `package[/subpath]@version` request to its physical npm package root. */
function physicalPackage(request: string): string {
  const version = request.lastIndexOf("@");
  if (version <= 0) throw new Error(`Package request ${request} must end in @version`);
  const logical = request.slice(0, version);
  if (logical.startsWith("@")) {
    const slash = logical.indexOf("/", 1);
    if (slash < 0) throw new Error(`Scoped package request ${request} is invalid`);
    const subpath = logical.indexOf("/", slash + 1);
    return subpath < 0 ? logical : logical.slice(0, subpath);
  }
  const subpath = logical.indexOf("/");
  return subpath < 0 ? logical : logical.slice(0, subpath);
}

function relativeSource(importer: string, request: string): string {
  if (!request.startsWith("./") && !request.startsWith("../")) {
    throw new Error(`Source import ${request} in ${importer} must be relative`);
  }
  return resolve(dirname(importer), request);
}

/**
 * Official video Distribution package discovery.
 *
 * It reads only Source Headers and import prologues. No component, Provider,
 * Runtime adapter or package activation executes while the new lock is chosen.
 */
export async function discoverVideoSourcePackages(
  sourcePath: string,
  options: { readonly workspaceRoot?: string } = {},
): Promise<{ readonly selected: readonly string[]; readonly logical: readonly string[] }> {
  const canonicalSource = await realpath(resolve(sourcePath));
  const root = await realpath(resolve(options.workspaceRoot ?? dirname(canonicalSource)));
  if (!isWithin(root, canonicalSource)) throw new Error(`Source ${canonicalSource} is outside workspace root ${root}`);

  const selected = new Set<string>();
  const logical = new Set<string>();
  const visited = new Set<string>();
  const discoverAuthor = async (path: string): Promise<void> => {
    const canonical = await realpath(path);
    if (!isWithin(root, canonical)) throw new Error(`Author Source ${canonical} is outside workspace root ${root}`);
    if (visited.has(canonical)) return;
    visited.add(canonical);
    const text = await readFile(canonical, "utf8");
    const name = relative(root, canonical);
    const header = parseSourceHeader(name, text);
    if (header.using !== markupAuthorFrontendId) {
      // Markup is the Distribution's bootstrap Frontend. Every other Frontend
      // is ordinary selected package code and therefore belongs in the lock.
      selected.add(physicalPackage(header.using));
      logical.add(header.using);
      return;
    }
    const discovery = discoverMarkup({ name, text: maskSourceHeader(text, header) });
    for (const item of discovery.imports) {
      if (item.kind === "module") {
        selected.add(physicalPackage(item.from));
        logical.add(item.from);
      }
      else await discoverAuthor(relativeSource(canonical, item.from));
    }
  };

  const text = await readFile(canonicalSource, "utf8");
  const header = parseSourceHeader(relative(root, canonicalSource), text);
  if (header.using === runMarkupFrontendId) {
    selected.add(physicalPackage(header.using));
    logical.add(header.using);
    const run = parseRunDocument(relative(root, canonicalSource), maskSourceHeader(text, header));
    for (const item of run.imports) {
      selected.add(physicalPackage(item.from));
      logical.add(item.from);
    }
    await discoverAuthor(relativeSource(canonicalSource, run.author.source));
  } else {
    await discoverAuthor(canonicalSource);
  }
  return { selected: [...selected].sort(), logical: [...logical].sort() };
}
