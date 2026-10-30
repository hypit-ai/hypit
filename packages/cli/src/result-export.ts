import { fileReferenceIdentity } from "@hypit/result/node";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import type {
  BuildResultFileRef,
  BuildResultHistory,
  RepositoryBuildResultOutput,
  ResultOutputExporter,
} from "@hypit/result";
import { buildResultOutput } from "@hypit/result";
import type { BlobRef, CanonicalValue, Value, ValuePath } from "@hypit/protocol";
import { sameType } from "@hypit/protocol";

export type BuildResultExport = {
  readonly build: string;
  readonly output: string;
  readonly type: RepositoryBuildResultOutput["type"];
  readonly representation: "inline" | "file" | "structured";
  readonly path: string;
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

async function writeStream(
  path: string,
  input: AsyncIterable<Uint8Array>,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, input, { flag: "wx" });
}

async function openResultFile(
  repository: BuildResultHistory,
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

function inflateValueDocument(
  repository: BuildResultHistory,
  build: string,
  document: Extract<RepositoryBuildResultOutput["value"], { readonly kind: "value" }>["document"],
): { readonly value: Value; readonly openResource: (blob: BlobRef) => Promise<AsyncIterable<Uint8Array> | undefined> } {
  const files = new Map<string, BuildResultFileRef>();
  const bindings = new Map(document.resources.map((binding, index) => {
    const resource = `res_result_export_${String(index + 1)}`;
    files.set(resource, binding.file);
    return [JSON.stringify(binding.at), {
      kind: "blob" as const,
      resource,
      size: binding.file.size,
      mediaType: binding.file.mediaType,
    }];
  }));
  const inflate = (value: CanonicalValue, at: ValuePath): Value => {
    const blob = bindings.get(JSON.stringify(at));
    if (blob !== undefined) return blob;
    if (Array.isArray(value)) return value.map((child, index) => inflate(child, [...at, index]));
    if (value !== null && typeof value === "object") {
      return Object.fromEntries(Object.entries(value).map(([name, child]) => [name, inflate(child, [...at, name])]));
    }
    return value;
  };
  return {
    value: inflate(document.value, []),
    async openResource(blob) {
      const file = files.get(blob.resource);
      return file === undefined ? undefined : await repository.openFile(build, file);
    },
  };
}

/** Export one resolved retained Output into an explicit user-owned local destination. */
export async function exportBuildResultOutput(
  repository: BuildResultHistory,
  build: string,
  output: string,
  destination: string,
  resolveExporter?: (type: RepositoryBuildResultOutput["type"]) => Promise<ResultOutputExporter | undefined>,
): Promise<BuildResultExport> {
  const manifest = await repository.read(build);
  if (manifest === undefined) throw new Error(`Build Result ${build} does not exist`);
  const retainedOutput = buildResultOutput(manifest, output);
  if (retainedOutput === undefined) throw new Error(`Build ${build} has no retained Output ${output}`);
  const resolvedOutput = await repository.resolve(build, output);
  if (resolvedOutput === undefined) throw new Error(`Build ${build} Output ${output} cannot be resolved`);
  const target = resolve(destination);
  if (resolvedOutput.value.kind === "value") {
    const exporter = await resolveExporter?.(resolvedOutput.type);
    if (exporter === undefined) {
      throw new Error(`Retained Output ${output} has no package-owned exporter for its Type`);
    }
    assert(sameType(exporter.type, resolvedOutput.type),
      `Retained Output ${output} resolved an exporter for a different Type`);
    const inflated = inflateValueDocument(repository, build, resolvedOutput.value.document);
    const exported = await exporter.export({
      name: output,
      type: resolvedOutput.type,
      value: inflated.value,
      openResource: inflated.openResource,
    });
    await exportFile(target, async (temporary) => {
      if (exported.bytes instanceof Uint8Array) await writeFile(temporary, exported.bytes, { flag: "wx" });
      else await writeStream(temporary, exported.bytes);
    });
  } else if (resolvedOutput.value.kind === "build-file") {
    const resource = resolvedOutput.value;
    await exportFile(target, async (temporary) => {
      await writeStream(
        temporary,
        await openResultFile(repository, build, resource),
      );
    });
  } else {
    const inlineValue = resolvedOutput.value.value;
    await exportFile(target, async (temporary) => {
      await writeFile(temporary, `${JSON.stringify(inlineValue, null, 2)}\n`, { flag: "wx" });
    });
  }
  return {
    build,
    output,
    type: retainedOutput.type,
    representation: resolvedOutput.value.kind === "inline"
      ? "inline"
      : resolvedOutput.value.kind === "build-file" ? "file" : "structured",
    path: target,
  };
}
