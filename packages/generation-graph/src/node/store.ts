import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import type { ProductHistory } from "@hypit/product";
import { assertBuildId } from "@hypit/protocol";

import {
  assertGenerationGraphPath,
  assertGenerationNodeProduct,
  parseGenerationGraphProject,
  parseGenerationNodeProduct,
  serializeGenerationGraphProject,
  serializeGenerationNodeProduct,
} from "../project.js";
import { resolveGenerationNodeProduct } from "../product.js";
import { applyGenerationGraphTransaction } from "../transaction.js";
import type { AcceptedGenerationGraphBuild } from "../prepare.js";
import type {
  GenerationGraphProject,
  GenerationNodeProduct,
} from "../types.js";

async function replaceFile(from: string, to: string): Promise<void> {
  if (process.platform !== "win32") {
    await rename(from, to);
    return;
  }
  const moduleName = "@hypit/atomic-file";
  const atomicFile = await import(moduleName) as { readonly replaceFile: (from: string, to: string) => Promise<void> };
  await atomicFile.replaceFile(from, to);
}

async function writeAtomic(path: string, text: string): Promise<void> {
  const destination = resolve(path);
  await mkdir(dirname(destination), { recursive: true });
  const temporaryDirectory = await mkdtemp(join(dirname(destination), ".hypit-generation-graph-save-"));
  const temporary = join(temporaryDirectory, basename(destination));
  try {
    await writeFile(temporary, text, { encoding: "utf8", flag: "wx" });
    await replaceFile(temporary, destination);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function resolveProjectPath(projectPath: string, path: string): string {
  const root = dirname(resolve(projectPath));
  const target = resolve(root, path);
  const relation = relative(root, target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new Error(`Generation Graph path ${path} leaves its project directory.`);
  }
  return target;
}

export async function readGenerationGraphProjectFile(path: string): Promise<GenerationGraphProject> {
  return parseGenerationGraphProject(await readFile(path, "utf8"));
}

export async function writeGenerationGraphProjectFile(
  path: string,
  project: GenerationGraphProject,
): Promise<void> {
  await writeAtomic(path, serializeGenerationGraphProject(project));
}

export async function readGenerationNodeProductFile(path: string): Promise<GenerationNodeProduct> {
  return parseGenerationNodeProduct(await readFile(path, "utf8"));
}

export async function writeGenerationNodeProductFile(
  path: string,
  product: GenerationNodeProduct,
): Promise<void> {
  await writeAtomic(path, serializeGenerationNodeProduct(product));
}

async function writeGenerationNodeProductOnce(
  path: string,
  product: GenerationNodeProduct,
): Promise<void> {
  const existing = await readFile(path, "utf8").then(parseGenerationNodeProduct, (error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  });
  if (existing !== undefined) {
    if (JSON.stringify(existing) !== JSON.stringify(product)) {
      throw new Error(`Generation Product sidecar ${path} already names another Build output.`);
    }
    return;
  }
  await writeGenerationNodeProductFile(path, product);
}

/** Product lookup adapter for one exact project file; active and failed outputs remain unavailable. */
export function createNodeGenerationGraphProductResolver(
  projectPath: string,
  history: ProductHistory,
) {
  return async (path: string) => await resolveGenerationNodeProduct(
    await readGenerationNodeProductFile(resolveProjectPath(projectPath, path)),
    history,
  );
}

/**
 * Publish sidecars first and the graph revision last. A failed final project write may leave harmless
 * unattached sidecars, but the project can never select a sidecar that this function did not publish.
 */
export async function commitAcceptedGenerationGraphBuild(
  projectPath: string,
  accepted: AcceptedGenerationGraphBuild,
): Promise<GenerationGraphProject> {
  assertBuildId(accepted.build);
  const nodes = new Set<string>();
  const paths = new Set<string>();
  for (const product of accepted.products) {
    if (nodes.has(product.node)) throw new Error(`Accepted Generation Build repeats Node ${product.node}.`);
    if (paths.has(product.path)) throw new Error(`Accepted Generation Build repeats path ${product.path}.`);
    assertGenerationGraphPath(product.path, `Accepted Generation Product ${product.node} path`);
    assertGenerationNodeProduct(product.document);
    if (product.document.build !== accepted.build || product.document.output !== product.node) {
      throw new Error(`Accepted Generation Product ${product.node} does not name its Build output.`);
    }
    nodes.add(product.node);
    paths.add(product.path);
  }
  const expectedCommands = accepted.products.flatMap((product) => [{
    kind: "node.product.add" as const,
    id: product.node,
    path: product.path,
  }, {
    kind: "node.select" as const,
    id: product.node,
    selected: product.path,
  }]);
  if (JSON.stringify(accepted.transaction.commands) !== JSON.stringify(expectedCommands)) {
    throw new Error("Accepted Generation Build transaction does not match its Product sidecars.");
  }
  const current = await readGenerationGraphProjectFile(projectPath);
  const updated = applyGenerationGraphTransaction(current, accepted.transaction);
  for (const product of accepted.products) {
    await writeGenerationNodeProductOnce(
      resolveProjectPath(projectPath, product.path),
      product.document,
    );
  }
  await writeGenerationGraphProjectFile(projectPath, updated);
  return updated;
}
