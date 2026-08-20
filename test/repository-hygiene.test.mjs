import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { extname, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const repositoryRoot = new URL("../", import.meta.url);
const repositoryRootPath = fileURLToPath(repositoryRoot);
const scanRoots = ["docs", "examples", "packages", "services", "test"];
const rootTextFiles = ["README.md", "package.json", "pnpm-workspace.yaml", "tsconfig.json"];
const ignoredDirectories = new Set(["node_modules", "dist", "output", ".hypit", ".svml", ".vitepress"]);
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
      // Every rule below matches this path with a forward-slash pattern, so it has to be spelled
      // one way on every platform. `URL.pathname` is neither: on Windows it carries a leading
      // slash before the drive letter, and it percent-encodes a name containing a space.
      const path = relative(repositoryRootPath, fileURLToPath(child)).split(sep).join("/");
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

/**
 * Every rule below filters `entry.path` against a forward-slash pattern. A scan that yields
 * platform-shaped paths, or reaches the wrong tree, or reaches nothing at all, turns each of
 * them into a loop that never enters its body — which reports exactly what a clean repository
 * reports. This test is what makes the others mean anything.
 */
test("the repository scan reaches the repository", async () => {
  const entries = await repositoryEntries();
  const paths = new Set(entries.map((entry) => entry.path));
  assert.ok(paths.has("test/repository-hygiene.test.mjs"), "the scan must reach this file");
  assert.deepEqual(entries.filter((entry) => entry.path.includes("\\")).map((entry) => entry.path).slice(0, 5), [],
    "entry paths are repository-relative and separated by forward slashes");
  const sources = entries.filter((entry) => /^packages\/[^/]+\/src\/.*\.ts$/u.test(entry.path));
  assert.ok(sources.length > 300, `expected the package sources, found ${sources.length}`);
  const manifests = entries.filter((entry) => /^packages\/[^/]+\/package\.json$/u.test(entry.path));
  assert.ok(manifests.length > 50, `expected the package manifests, found ${manifests.length}`);
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
  const identity = /(?:\bsvml\.[a-z0-9._/-]+|@hypit\/[a-z0-9._/${}-]+)@([0-9]+)(?![.0-9])/giu;
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
    && owner.text.startsWith("@hypit/")
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

/**
 * Module specifiers this file really imports.
 *
 * Read from the syntax tree rather than the text: a template that generates a package writes the
 * imports that package will have, and matching those would demand the generator depend on
 * everything it can generate.
 */
function packageImports(path, source) {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true,
    path.endsWith(".tsx") ? ts.ScriptKind.TSX : path.endsWith(".mjs") ? ts.ScriptKind.JS : ts.ScriptKind.TS);
  const found = [];
  const take = (node) => {
    if (node !== undefined && ts.isStringLiteralLike(node)) {
      const match = /^(@hypit\/[a-z0-9-]+)(?:\/.*)?$/u.exec(node.text);
      if (match !== null) found.push(match[1]);
    }
  };
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) take(node.moduleSpecifier);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) take(node.arguments[0]);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

test("production imports belong to each package while the root owns repository tests", async () => {
  const entries = await repositoryEntries();
  const rootManifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const rootTestDependencies = new Set([
    ...Object.keys(rootManifest.dependencies ?? {}),
    ...Object.keys(rootManifest.devDependencies ?? {}),
  ]);
  const manifests = new Map();
  for (const entry of entries) {
    const match = /^packages\/([^/]+)\/package\.json$/u.exec(entry.path);
    if (match === null) continue;
    manifests.set(match[1], JSON.parse(await readFile(entry.child, "utf8")));
  }
  const failures = [];
  for (const entry of entries) {
    const match = /^packages\/([^/]+)\/(src|test)\/.*\.(?:ts|tsx|mts|cts|mjs)$/u.exec(entry.path);
    if (match === null) continue;
    const [directory, area] = [match[1], match[2]];
    const manifest = manifests.get(directory);
    if (manifest === undefined) {
      failures.push(`${entry.path} (package has no package.json)`);
      continue;
    }
    const allowed = new Set([
      ...Object.keys(manifest.dependencies ?? {}),
      ...(area === "test" ? [
        ...Object.keys(manifest.devDependencies ?? {}),
        ...rootTestDependencies,
      ] : []),
    ]);
    const source = await readFile(entry.child, "utf8");
    for (const dependency of new Set(packageImports(entry.path, source))) {
      if (dependency !== manifest.name && !allowed.has(dependency)) {
        failures.push(`${entry.path} (${dependency})`);
      }
    }
  }
  assert.deepEqual(failures, [], `undeclared package imports found:\n${failures.join("\n")}`);
});

function objectProperties(node) {
  const properties = new Map();
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = propertyName(property.name);
    if (name !== undefined) properties.set(name, property.initializer);
  }
  return properties;
}

/** A Surface declaration that publishes a VisualTrack draws something a reader has to see. */
function visualSurfaceTag(node) {
  const properties = objectProperties(node);
  const tag = properties.get("tag");
  const outputs = properties.get("outputs");
  if (tag === undefined || outputs === undefined || !ts.isArrayLiteralExpression(outputs)) return undefined;
  const visual = outputs.elements.some((element) => element.getText().includes("visualTrack"));
  if (!visual || !ts.isStringLiteralLike(tag)) return undefined;
  const vocabulary = properties.get("vocabulary");
  const declaresPreview = vocabulary !== undefined
    && ts.isObjectLiteralExpression(vocabulary)
    && objectProperties(vocabulary).has("preview");
  return declaresPreview ? undefined : tag.text;
}

test("a Surface that draws declares a preview at all", async () => {
  // The check below only fires once a preview is declared, so a package that skips the declaration
  // escapes it entirely — and a component that cannot draw itself is exactly the one whose author
  // never got a preview out of it. Publishing a VisualTrack is the structural signal, independent
  // of whether anyone remembered to promise a picture.
  const entries = await repositoryEntries();
  const failures = [];
  for (const entry of entries) {
    if (!entry.isFile || !/^((?:examples\/[^/]+\/)?packages\/[^/]+)\/src\/.*\.ts$/u.test(entry.path)) continue;
    const source = await readFile(entry.child, "utf8");
    if (!source.includes("visualTrack")) continue;
    const file = ts.createSourceFile(entry.path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const visit = (node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const tag = visualSurfaceTag(node);
        if (tag !== undefined) failures.push(`${entry.path} declares ${tag}, which publishes a VisualTrack and promises no preview`);
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  assert.deepEqual(failures, [], `drawing Surfaces without a preview:\n${failures.join("\n")}`);
});

test("a declared Surface preview names a picture that exists", async () => {
  // A component that cannot draw itself cannot produce a preview image. Declaring one and shipping
  // nothing is how that goes unnoticed: the declaration reads as evidence the component renders.
  const entries = await repositoryEntries();
  const failures = [];
  for (const entry of entries) {
    const match = /^((?:examples\/[^/]+\/)?packages\/[^/]+)\/src\/.*\.ts$/u.exec(entry.path);
    if (match === null || !entry.isFile) continue;
    const source = await readFile(entry.child, "utf8");
    // Read the syntax tree, not the text: a template that generates a package writes the preview
    // call that package will have, and its filename is an interpolation rather than a path.
    const parsed = ts.createSourceFile(entry.path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const declaredNames = [];
    const collect = (node) => {
      if (ts.isCallExpression(node)
        && ts.isIdentifier(node.expression)
        && node.expression.text === "previewImage"
        && node.arguments.length === 1
        && ts.isStringLiteral(node.arguments[0])) {
        declaredNames.push(node.arguments[0].text);
      }
      ts.forEachChild(node, collect);
    };
    collect(parsed);
    for (const declared of declaredNames.map((name) => [undefined, name])) {
      const file = new URL(`./${match[1]}/preview/${declared[1]}`, repositoryRoot);
      const size = await stat(file).then((item) => item.size, () => undefined);
      if (size === undefined) failures.push(`${entry.path} declares preview/${declared[1]}, which does not exist`);
      else if (size === 0) failures.push(`${entry.path} declares preview/${declared[1]}, which is empty`);
    }
  }
  assert.deepEqual(failures, [], `declared previews without a picture:\n${failures.join("\n")}`);
});

/** The `child_process` entry points that start a program, and where each one takes its options. */
const PROCESS_STARTERS = new Map([
  ["spawn", 2], ["spawnSync", 2], ["execFile", 2], ["execFileSync", 2], ["fork", 2],
  ["exec", 1], ["execSync", 1],
]);

test("every child process is started with its console window hidden", async () => {
  // On Windows a console program started without `windowsHide` is given a window, and the window
  // is shown. A render is a tree of them — ffmpeg per Need, a browser, a transcriber that re-execs
  // Python, which opens a pool of workers — so the flag being absent is not one window but dozens,
  // opening and closing over whatever the author was doing. There is no call here that wants one.
  const entries = await repositoryEntries();
  const failures = [];
  for (const entry of entries) {
    if (!entry.isFile || !/\.(?:ts|tsx|mts|cts|mjs)$/u.test(entry.path)) continue;
    const source = await readFile(entry.child, "utf8");
    if (![...PROCESS_STARTERS.keys()].some((name) => source.includes(name))) continue;
    const file = ts.createSourceFile(entry.path, source, ts.ScriptTarget.Latest, true,
      entry.path.endsWith(".tsx") ? ts.ScriptKind.TSX
        : entry.path.endsWith(".mjs") ? ts.ScriptKind.JS : ts.ScriptKind.TS);
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
        const at = PROCESS_STARTERS.get(node.expression.text);
        const options = at === undefined ? undefined : node.arguments[at];
        // Only a literal can be read here. A call that passes its options along has none to check,
        // and is answered where the object it passes was written.
        if (options !== undefined && ts.isObjectLiteralExpression(options)
          && !objectProperties(options).has("windowsHide")) {
          const { line } = file.getLineAndCharacterOfPosition(options.getStart(file));
          failures.push(`${entry.path}:${line + 1} (${node.expression.text})`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  assert.deepEqual(failures, [], `child processes started with a visible console:\n${failures.join("\n")}`);
});
