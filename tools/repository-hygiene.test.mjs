import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, relative } from "node:path";
import test from "node:test";
import ts from "typescript";

const repositoryRoot = new URL("../", import.meta.url);
const scanRoots = ["docs", "examples", "packages", "services", "spec", "test", "tools"];
const rootTextFiles = ["README.md", "package.json", "pnpm-workspace.yaml", "tsconfig.json"];
const ignoredDirectories = new Set(["node_modules", "dist", "output", ".svml", ".vitepress"]);
const textExtensions = new Set([
  ".css", ".html", ".js", ".json", ".jsx", ".md", ".mjs", ".sh", ".svml", ".svrun",
  ".svs", ".ts", ".tsx", ".txt", ".yaml", ".yml",
]);

function isMountedDocumentationPath(path) {
  return path === "docs/public"
    || path.startsWith("docs/public/")
    || path === "docs/index.md"
    || path === "docs/quickstart.md"
    || path.startsWith("docs/quickstart/")
    || path === "docs/guide"
    || path.startsWith("docs/guide/")
    || path === "docs/zh"
    || path.startsWith("docs/zh/");
}

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

async function repositoryTextEntries() {
  const entries = (await repositoryEntries()).filter((entry) =>
    entry.isFile && textExtensions.has(extname(entry.path)));
  for (const path of rootTextFiles) {
    entries.push({ path, child: new URL(`../${path}`, import.meta.url), isFile: true });
  }
  return entries;
}

function lineOf(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

test("source distribution outside the mounted documentation contains no customer or product brand residue", async () => {
  const brand = new RegExp(
    String.raw`\b\x65\x63\x68\x6f(?:[\s_-]+)\x70\x72\x6f\b|\b\x65\x63\x68\x6f\x70\x72\x6f\b|\bwith[-_]\x65\x63\x68\x6f\b|\b\x61\x72\x65\x75\x6d\b|\b\x6c\x6f\x6f\x6b\x73\x6d\x61\x78\b`,
    "giu",
  );
  const failures = [];
  for (const entry of await repositoryEntries()) {
    if (isMountedDocumentationPath(entry.path)) continue;
    if (brand.test(entry.path)) failures.push(`${entry.path} (path)`);
    brand.lastIndex = 0;
    if (!entry.isFile || !textExtensions.has(extname(entry.path))) continue;
    const source = await readFile(entry.child, "utf8");
    for (const match of source.matchAll(brand)) failures.push(`${entry.path}:${lineOf(source, match.index)}`);
  }
  assert.deepEqual(failures, [], `brand residue found:\n${failures.join("\n")}`);
});

test("source distribution outside the mounted documentation contains no retired project identities", async () => {
  const retired = new RegExp(
    String.raw`\b\x74\x77\x69\x6e\x69\x74\b|\b\x68\x79\x70\x69\x74\b|\b\x6d\x65\x67\x6e\x65\x74\x61\b`,
    "giu",
  );
  const failures = [];
  for (const entry of await repositoryTextEntries()) {
    if (isMountedDocumentationPath(entry.path)) continue;
    const source = await readFile(entry.child, "utf8");
    for (const match of source.matchAll(retired)) failures.push(`${entry.path}:${lineOf(source, match.index)}`);
  }
  assert.deepEqual(failures, [], `retired internal identity found:\n${failures.join("\n")}`);
});

test("public repository contains no workstation paths or high-confidence secret bytes", async () => {
  const workstationPath = /(?:\/Users\/[A-Za-z0-9._-]+\/|\/home\/[A-Za-z0-9._-]+\/|[A-Za-z]:\\Users\\[^\\]+\\)/gu;
  const secretBytes = /(?:AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/gu;
  const failures = [];
  for (const entry of await repositoryTextEntries()) {
    const source = await readFile(entry.child, "utf8");
    for (const match of source.matchAll(workstationPath)) {
      failures.push(`${entry.path}:${lineOf(source, match.index)} (workstation path)`);
    }
    for (const match of source.matchAll(secretBytes)) {
      failures.push(`${entry.path}:${lineOf(source, match.index)} (secret bytes)`);
    }
  }
  assert.deepEqual(failures, [], `private repository residue found:\n${failures.join("\n")}`);
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

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node)) return node.text;
  return undefined;
}

function projectIdentityObject(node) {
  const properties = new Map();
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = propertyName(property.name);
    if (name !== undefined) properties.set(name, property.initializer);
  }
  const owner = properties.get("name") ?? properties.get("module");
  return owner !== undefined
    && ts.isStringLiteralLike(owner)
    && owner.text.startsWith("@narratage/")
    && properties.has("version")
    ? properties.get("version")
    : undefined;
}

test("project-owned production Module and Frontend identities use literal version one", async () => {
  const failures = [];
  for (const entry of await repositoryEntries()) {
    if (!entry.isFile || !/^packages\/[^/]+\/src\/.*\.(?:ts|tsx)$/u.test(entry.path)) continue;
    const source = await readFile(entry.child, "utf8");
    const file = ts.createSourceFile(entry.path, source, ts.ScriptTarget.Latest, true,
      entry.path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const version = projectIdentityObject(node);
        if (version !== undefined && (!ts.isStringLiteralLike(version) || version.text !== "1")) {
          const { line } = file.getLineAndCharacterOfPosition(version.getStart(file));
          failures.push(`${entry.path}:${line + 1} (${version.getText(file)})`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  assert.deepEqual(failures, [],
    `project-owned logical identities must use literal version \"1\":\n${failures.join("\n")}`);
});
