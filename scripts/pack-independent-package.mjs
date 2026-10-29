import { execFileSync } from "node:child_process";
import { globSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { releaseDependencyVersion } from "./release-dependencies.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const typescript = require("typescript");
const typescriptCli = require.resolve("typescript/bin/tsc");

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function npmCli() {
  const value = process.env.npm_execpath;
  if (!value?.endsWith("npm-cli.js")) {
    throw new Error("Run this packer through npm run pack:independent.");
  }
  return value;
}

function runNpm(args, cwd, capture = false, env = {}) {
  return execFileSync(process.execPath, [npmCli(), ...args], {
    cwd,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
    env: { ...process.env, ...env },
  });
}

function publishedTarget(value) {
  if (typeof value === "string") {
    return value.startsWith("./src/") && value.endsWith(".ts")
      ? `./dist/${value.slice("./src/".length, -".ts".length)}.js`
      : value;
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).map(([key, target]) => [key, publishedTarget(target)]));
}

function inside(root, candidate) {
  const relation = relative(root, candidate);
  return relation === "" || (relation !== ".." && !relation.startsWith(`..${sep}`) && !isAbsolute(relation));
}

async function copyDeclaredEntry(packageRoot, stage, entry) {
  const source = resolve(packageRoot, entry);
  if (!inside(packageRoot, source)) throw new Error(`${entry} escapes ${packageRoot}`);
  await stat(source);
  await cp(source, resolve(stage, entry), {
    recursive: true,
    filter: (candidate) => {
      const name = basename(candidate);
      return name !== "__pycache__" && !name.endsWith(".pyc") && !name.endsWith(".pyo");
    },
  });
}

async function compileSources(packageRoot, stage) {
  const sources = globSync("src/**/*.ts", { cwd: packageRoot }).sort();
  if (sources.length === 0) return false;
  execFileSync(process.execPath, [
    typescriptCli,
    "--target", "ES2023",
    "--module", "NodeNext",
    "--moduleResolution", "NodeNext",
    "--customConditions", "hypit-source",
    "--lib", "ES2023,DOM",
    "--strict",
    "--noUncheckedIndexedAccess",
    "--exactOptionalPropertyTypes",
    "--verbatimModuleSyntax",
    "--declaration",
    "--skipLibCheck",
    "--rootDir", resolve(packageRoot, "src"),
    "--outDir", resolve(stage, "dist"),
    ...sources.map((source) => resolve(packageRoot, source)),
  ], { cwd: repositoryRoot, stdio: "inherit" });
  await rewritePublishedDeclarationSpecifiers(stage);
  return true;
}

function exportTargets(value) {
  if (typeof value === "string") return [value];
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.values(value).flatMap(exportTargets);
}

async function embeddedPublicSpecifiers() {
  const rootManifest = JSON.parse(await readFile(resolve(repositoryRoot, "package.json"), "utf8"));
  const candidates = new Map();
  for (const [exportName, value] of Object.entries(rootManifest.exports ?? {})) {
    if (!exportName.startsWith("./")) continue;
    for (const target of exportTargets(value)) {
      const match = /^\.\/packages\/([^/]+)\//u.exec(target);
      if (match === null) continue;
      const list = candidates.get(match[1]) ?? [];
      list.push(`${rootManifest.name}${exportName.slice(1)}`);
      candidates.set(match[1], list);
    }
  }
  const specifiers = new Map();
  for (const [directory, values] of candidates) {
    const manifest = JSON.parse(await readFile(resolve(repositoryRoot, "packages", directory, "package.json"), "utf8"));
    const publicSpecifier = [...new Set(values)].sort((left, right) => {
      const depth = left.split("/").length - right.split("/").length;
      return depth === 0 ? compareCodeUnits(left, right) : depth;
    })[0];
    if (typeof manifest.name === "string" && publicSpecifier !== undefined) {
      specifiers.set(manifest.name, publicSpecifier);
    }
  }
  return specifiers;
}

function referencedModuleSpecifiers(sourceFile) {
  const references = [];
  const visit = (node) => {
    if ((typescript.isImportDeclaration(node) || typescript.isExportDeclaration(node))
      && node.moduleSpecifier !== undefined && typescript.isStringLiteral(node.moduleSpecifier)) {
      references.push(node.moduleSpecifier);
    } else if (typescript.isImportTypeNode(node) && typescript.isLiteralTypeNode(node.argument)
      && typescript.isStringLiteral(node.argument.literal)) {
      references.push(node.argument.literal);
    } else if (typescript.isCallExpression(node) && node.expression.kind === typescript.SyntaxKind.ImportKeyword
      && node.arguments[0] !== undefined && typescript.isStringLiteral(node.arguments[0])) {
      references.push(node.arguments[0]);
    }
    typescript.forEachChild(node, visit);
  };
  visit(sourceFile);
  return references;
}

function packageNameFromSpecifier(specifier) {
  if (specifier.startsWith(".") || specifier.startsWith("/")
    || specifier.startsWith("#") || specifier.startsWith("node:")) return undefined;
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
}

function runtimeModuleSpecifiers(sourceFile) {
  const references = [];
  const visit = (node) => {
    if (typescript.isImportDeclaration(node) && typescript.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      const typeOnlyNames = clause?.namedBindings !== undefined
        && typescript.isNamedImports(clause.namedBindings)
        && clause.namedBindings.elements.length > 0
        && clause.namedBindings.elements.every((item) => item.isTypeOnly);
      if (clause === undefined || (!clause.isTypeOnly && (clause.name !== undefined || !typeOnlyNames))) {
        references.push(node.moduleSpecifier.text);
      }
    } else if (typescript.isExportDeclaration(node) && node.moduleSpecifier !== undefined
      && typescript.isStringLiteral(node.moduleSpecifier)) {
      const typeOnlyNames = node.exportClause !== undefined
        && typescript.isNamedExports(node.exportClause)
        && node.exportClause.elements.length > 0
        && node.exportClause.elements.every((item) => item.isTypeOnly);
      if (!node.isTypeOnly && !typeOnlyNames) references.push(node.moduleSpecifier.text);
    } else if (typescript.isCallExpression(node) && node.expression.kind === typescript.SyntaxKind.ImportKeyword
      && node.arguments[0] !== undefined && typescript.isStringLiteral(node.arguments[0])) {
      references.push(node.arguments[0].text);
    }
    typescript.forEachChild(node, visit);
  };
  visit(sourceFile);
  return references;
}

/**
 * A package must name every package imported by its published sources. Installing a complete
 * workspace closure can otherwise make an undeclared import work accidentally through another
 * package's dependency. The package manifest remains the only dependency topology.
 */
async function assertPublishedSourceDependencies(packageRoot, manifest) {
  const declared = new Set(Object.keys({
    ...(manifest.dependencies ?? {}),
    ...(manifest.optionalDependencies ?? {}),
    ...(manifest.peerDependencies ?? {}),
  }));
  const missing = new Set();
  for (const source of globSync("src/**/*.ts", { cwd: packageRoot }).sort()) {
    const path = resolve(packageRoot, source);
    const text = await readFile(path, "utf8");
    const sourceFile = typescript.createSourceFile(path, text, typescript.ScriptTarget.Latest, true,
      typescript.ScriptKind.TS);
    for (const specifier of runtimeModuleSpecifiers(sourceFile)) {
      const dependency = packageNameFromSpecifier(specifier);
      if (dependency !== undefined && dependency !== manifest.name && !declared.has(dependency)) {
        missing.add(dependency);
      }
    }
  }
  if (missing.size > 0) {
    throw new Error(`${manifest.name} published sources import undeclared dependencies: ${[...missing].sort().join(", ")}`);
  }
}

/**
 * Independent packages compile against the Distribution's source condition while the repository is
 * under development. Declaration inference can consequently expose an embedded workspace identity
 * such as `@hypit/protocol`, even though its npm owner is the public `@hypit/hypit/protocol` export.
 * Translate only module specifiers, deriving the ownership map from the root's real exports rather
 * than maintaining another package list.
 */
async function rewritePublishedDeclarationSpecifiers(stage) {
  const publicSpecifiers = await embeddedPublicSpecifiers();
  const rewrite = (value) => {
    for (const [embedded, published] of publicSpecifiers) {
      if (value === embedded || value.startsWith(`${embedded}/`)) {
        return `${published}${value.slice(embedded.length)}`;
      }
    }
    return value;
  };
  for (const declaration of globSync("dist/**/*.d.ts", { cwd: stage }).sort()) {
    const path = resolve(stage, declaration);
    let text = await readFile(path, "utf8");
    const sourceFile = typescript.createSourceFile(path, text, typescript.ScriptTarget.Latest, true,
      typescript.ScriptKind.TS);
    const edits = referencedModuleSpecifiers(sourceFile).flatMap((literal) => {
      const next = rewrite(literal.text);
      return next === literal.text ? [] : [{ start: literal.getStart(sourceFile), end: literal.getEnd(), next }];
    }).sort((left, right) => right.start - left.start);
    for (const edit of edits) text = `${text.slice(0, edit.start)}${JSON.stringify(edit.next)}${text.slice(edit.end)}`;
    if (edits.length > 0) await writeFile(path, text);

    const rewritten = typescript.createSourceFile(path, text, typescript.ScriptTarget.Latest, true,
      typescript.ScriptKind.TS);
    const leaked = referencedModuleSpecifiers(rewritten)
      .map((literal) => literal.text)
      .filter((value) => rewrite(value) !== value);
    if (leaked.length > 0) {
      throw new Error(`${declaration} exposes embedded package specifiers: ${[...new Set(leaked)].join(", ")}`);
    }
  }
}

async function releasedDependencyMap(manifest, values) {
  return Object.fromEntries(await Promise.all(Object.entries(values ?? {}).map(async ([name, version]) => {
    if (typeof version !== "string") throw new Error(`${manifest.name} dependency ${name} has no version`);
    return [name, releaseDependencyVersion(manifest.name, name, version)];
  })));
}

/** The dependency map npm consumers receive after workspace ownership is translated to release ranges. */
export async function releasedPackageDependencyMap(packageDirectory, field) {
  if (field !== "dependencies" && field !== "peerDependencies") {
    throw new Error(`Unsupported release dependency field ${field}`);
  }
  const packageRoot = resolve(repositoryRoot, packageDirectory);
  const manifest = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));
  return releasedDependencyMap(manifest, manifest[field]);
}

export async function packIndependentPackage(packageDirectory, outputDirectory, options = {}) {
  const packageRoot = resolve(repositoryRoot, packageDirectory);
  const output = resolve(repositoryRoot, outputDirectory);
  const manifest = JSON.parse(await readFile(resolve(packageRoot, "package.json"), "utf8"));
  const rootManifest = JSON.parse(await readFile(resolve(repositoryRoot, "package.json"), "utf8"));
  if (typeof manifest.name !== "string" || typeof manifest.version !== "string") {
    throw new Error(`${packageRoot}/package.json has no package identity`);
  }
  await assertPublishedSourceDependencies(packageRoot, manifest);
  if (manifest.repository === undefined && rootManifest.repository === undefined) {
    throw new Error(`${manifest.name} has no repository identity for npm provenance`);
  }
  if (options.buildPublicTypes !== false) runNpm(["run", "build:public-types"], repositoryRoot);

  const stage = await mkdtemp(resolve(tmpdir(), "hypit-independent-package-"));
  try {
    const compiled = await compileSources(packageRoot, stage);
    for (const entry of manifest.files ?? []) {
      if (entry === "dist" || entry === "LICENSE") continue;
      await copyDeclaredEntry(packageRoot, stage, entry);
    }
    const localLicense = resolve(packageRoot, "LICENSE");
    const license = await stat(localLicense).then(() => localLicense).catch(() => resolve(repositoryRoot, "LICENSE"));
    await cp(license, resolve(stage, "LICENSE"));

    const dependencies = await releasedDependencyMap(manifest, manifest.dependencies);
    const peerDependencies = await releasedDependencyMap(manifest, manifest.peerDependencies);
    const published = {
      ...manifest,
      repository: manifest.repository ?? rootManifest.repository,
      exports: publishedTarget(manifest.exports),
      ...(manifest.hypit === undefined ? {} : {
        hypit: { ...manifest.hypit, activation: publishedTarget(manifest.hypit.activation) },
      }),
      files: [...new Set([...(compiled ? ["dist"] : []), ...(manifest.files ?? []), "LICENSE"])],
      dependencies,
      ...(Object.keys(peerDependencies).length === 0 ? {} : { peerDependencies }),
    };
    delete published.private;
    delete published.devDependencies;
    delete published.scripts;
    await writeFile(resolve(stage, "package.json"), `${JSON.stringify(published, null, 2)}\n`);
    await mkdir(output, { recursive: true });
    const packed = JSON.parse(runNpm([
      "pack", "--ignore-scripts", "--pack-destination", output, "--json",
    ], stage, true, { npm_config_cache: resolve(stage, ".npm-cache") }));
    const filename = packed[0]?.filename;
    if (typeof filename !== "string") throw new Error(`${manifest.name} pack returned no filename`);
    return resolve(output, filename);
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

const invokedDirectly = process.argv[1] !== undefined
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (invokedDirectly) {
  const packageDirectory = process.argv[2];
  const outputDirectory = process.argv[3] ?? "dist/independent";
  if (packageDirectory === undefined) {
    throw new Error("Usage: npm run pack:independent -- packages/<name> [output-directory]");
  }
  console.log(await packIndependentPackage(packageDirectory, outputDirectory));
}
