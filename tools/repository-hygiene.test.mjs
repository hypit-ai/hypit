import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, relative } from "node:path";
import test from "node:test";

const repositoryRoot = new URL("../", import.meta.url);
const scanRoots = ["docs", "examples", "packages", "services", "spec", "test", "tools"];
const ignoredDirectories = new Set(["node_modules", "dist", "output", ".svml", ".vitepress"]);
const textExtensions = new Set([
  ".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".sh", ".svml", ".svrun",
  ".svs", ".ts", ".tsx", ".txt", ".yaml", ".yml",
]);

async function repositoryEntries() {
  const entries = [];
  const visit = async (url) => {
    for (const entry of await readdir(url, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || ignoredDirectories.has(entry.name)) continue;
      const child = new URL(`./${entry.name}${entry.isDirectory() ? "/" : ""}`, url);
      const path = relative(repositoryRoot.pathname, child.pathname);
      entries.push({ path, child, isFile: entry.isFile() });
      if (entry.isDirectory()) await visit(child);
    }
  };
  for (const root of scanRoots) await visit(new URL(`./${root}/`, repositoryRoot));
  return entries;
}

function lineOf(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

test("public repository contains no customer or product brand residue", async () => {
  const brand = new RegExp(
    String.raw`\b\x65\x63\x68\x6f(?:[\s_-]+)\x70\x72\x6f\b|\b\x65\x63\x68\x6f\x70\x72\x6f\b|\bwith[-_]\x65\x63\x68\x6f\b`,
    "giu",
  );
  const failures = [];
  for (const entry of await repositoryEntries()) {
    if (brand.test(entry.path)) failures.push(`${entry.path} (path)`);
    brand.lastIndex = 0;
    if (!entry.isFile || !textExtensions.has(extname(entry.path))) continue;
    const source = await readFile(entry.child, "utf8");
    for (const match of source.matchAll(brand)) failures.push(`${entry.path}:${lineOf(source, match.index)}`);
  }
  assert.deepEqual(failures, [], `brand residue found:\n${failures.join("\n")}`);
});

test("pre-release project-owned major identities remain at one", async () => {
  const identity = /(?:\bsvml\.[a-z0-9._/-]+|@narratage\/[a-z0-9._/${}-]+)@([0-9]+)(?![.0-9])/giu;
  const failures = [];
  for (const entry of await repositoryEntries()) {
    if (!entry.isFile || !textExtensions.has(extname(entry.path))) continue;
    const source = await readFile(entry.child, "utf8");
    for (const match of source.matchAll(identity)) {
      if (match[1] !== "1") failures.push(`${entry.path}:${lineOf(source, match.index)} (${match[0]})`);
    }
  }
  assert.deepEqual(failures, [], `non-@1 project identity found:\n${failures.join("\n")}`);
});
