import { fileReferenceIdentity } from "@hypit/build-result";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";

import type {
  BuildResultFileRef,
  BuildResultRepository,
  RepositoryBuildResultOutput,
} from "@hypit/build-result";

export type BuildResultExport = {
  readonly build: string;
  readonly output: string;
  readonly type: RepositoryBuildResultOutput["type"];
  readonly kind: "scalar" | "resource" | "composite";
  readonly path: string;
};

type CompositeResultOutput = Omit<RepositoryBuildResultOutput, "value"> & {
  readonly value: Extract<RepositoryBuildResultOutput["value"], { readonly kind: "value" }>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function pathExists(path: string): Promise<boolean> {
  return await lstat(path).then(() => true, (error: unknown) => {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  });
}

function containedPath(root: string, path: string): string {
  const target = resolve(root, path);
  const relation = relative(root, target);
  assert(relation.length > 0 && relation !== ".." && !relation.startsWith(`..${sep}`),
    `Result file ${path} leaves export directory ${root}`);
  return target;
}

async function writeStream(
  path: string,
  input: AsyncIterable<Uint8Array>,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, input, { flag: "wx" });
}

async function openResultFile(
  repository: BuildResultRepository,
  build: string,
  file: BuildResultFileRef,
): Promise<AsyncIterable<Uint8Array>> {
  const input = await repository.openFile(build, file);
  if (input === undefined) throw new Error(`File ${fileReferenceIdentity(build, file)} is unavailable`);
  return input;
}

async function exportFile(
  target: string,
  write: (temporary: string) => Promise<void>,
): Promise<void> {
  assert(!await pathExists(target), `Export destination ${target} already exists`);
  await mkdir(dirname(target), { recursive: true });
  const temporary = join(dirname(target), `.${basename(target)}.part-${randomUUID()}`);
  try {
    await write(temporary);
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function exportComposite(
  repository: BuildResultRepository,
  resolvedOutput: CompositeResultOutput,
  target: string,
): Promise<void> {
  assert(!await pathExists(target), `Export destination ${target} already exists`);
  await mkdir(dirname(target), { recursive: true });
  const temporary = join(dirname(target), `.${basename(target)}.part-${randomUUID()}`);
  try {
    await mkdir(temporary);
    const copied = new Map<string, BuildResultFileRef>();
    const paths = new Set<string>();
    const bindings = [];
    for (const binding of resolvedOutput.value.document.resources) {
      const file = await repository.describeFile(resolvedOutput.build, binding.file);
      const identity = fileReferenceIdentity(resolvedOutput.build, file);
      let local = copied.get(identity);
      if (local === undefined) {
        let path = file.kind === "build-file" ? file.path : `files/file-${copied.size + 1}`;
        const name = basename(path);
        let index = copied.size + 1;
        while (paths.has(path) || path === "value.json") path = `files/import-${index++}/${name}`;
        paths.add(path);
        local = { kind: "build-file", path, size: file.size, mediaType: file.mediaType };
        copied.set(identity, local);
        await writeStream(containedPath(temporary, path), await openResultFile(repository, resolvedOutput.build, file));
      }
      bindings.push({ at: binding.at, file: local });
    }
    await writeFile(
      join(temporary, "value.json"),
      `${JSON.stringify({ ...resolvedOutput.value.document, resources: bindings }, null, 2)}\n`,
      { flag: "wx" },
    );
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
}

/** Export one resolved public Output into an explicit user-owned local destination. */
export async function exportBuildResultOutput(
  repository: BuildResultRepository,
  build: string,
  output: string,
  destination: string,
): Promise<BuildResultExport> {
  const manifest = await repository.read(build);
  if (manifest === undefined) throw new Error(`Build Result ${build} does not exist`);
  const publishedOutput = manifest.outputs[output];
  if (publishedOutput === undefined) throw new Error(`Build ${build} has no Output ${output}`);
  const resolvedOutput = await repository.resolve(build, output);
  if (resolvedOutput === undefined) throw new Error(`Build ${build} Output ${output} cannot be resolved`);
  const target = resolve(destination);
  if (resolvedOutput.value.kind === "value") {
    await exportComposite(repository, { ...resolvedOutput, value: resolvedOutput.value }, target);
  } else if ((resolvedOutput.value.kind === "build-file" || resolvedOutput.value.kind === "external-file")) {
    const resource = resolvedOutput.value;
    await exportFile(target, async (temporary) => {
      await writeStream(
        temporary,
        await openResultFile(repository, resolvedOutput.build, resource),
      );
    });
  } else {
    const scalar = resolvedOutput.value.value;
    await exportFile(target, async (temporary) => {
      await writeFile(temporary, `${JSON.stringify(scalar, null, 2)}\n`, { flag: "wx" });
    });
  }
  return {
    build,
    output,
    type: publishedOutput.type,
    kind: resolvedOutput.value.kind === "inline"
      ? "scalar"
      : (resolvedOutput.value.kind === "build-file" || resolvedOutput.value.kind === "external-file") ? "resource" : "composite",
    path: target,
  };
}
