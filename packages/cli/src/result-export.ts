import { randomUUID } from "node:crypto";
import { lstat, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";

import type {
  BuildResultHistory,
  ResolvedBuildResultOutput,
  ResultOutputExporter,
} from "@hypit/result";
import { buildResultOutput } from "@hypit/result";
import { isBlobRef, sameType } from "@hypit/protocol";

export type BuildResultExport = {
  readonly build: string;
  readonly output: string;
  readonly type: ResolvedBuildResultOutput["type"];
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

/** Export one resolved retained Output into an explicit user-owned local destination. */
export async function exportBuildResultOutput(
  repository: BuildResultHistory,
  build: string,
  output: string,
  destination: string,
  resolveExporter?: (type: ResolvedBuildResultOutput["type"]) => Promise<ResultOutputExporter | undefined>,
): Promise<BuildResultExport> {
  const manifest = await repository.read(build);
  if (manifest === undefined) throw new Error(`Build Result ${build} does not exist`);
  const retainedOutput = buildResultOutput(manifest, output);
  if (retainedOutput === undefined) throw new Error(`Build ${build} has no retained Output ${output}`);
  const resolvedOutput = await repository.resolve(build, output);
  if (resolvedOutput === undefined) throw new Error(`Build ${build} Output ${output} cannot be resolved`);
  const target = resolve(destination);
  if (!isBlobRef(resolvedOutput.value)
    && resolvedOutput.value !== null
    && typeof resolvedOutput.value === "object") {
    const exporter = await resolveExporter?.(resolvedOutput.type);
    if (exporter === undefined) {
      throw new Error(`Retained Output ${output} has no package-owned exporter for its Type`);
    }
    assert(sameType(exporter.type, resolvedOutput.type),
      `Retained Output ${output} resolved an exporter for a different Type`);
    const exported = await exporter.export({
      name: output,
      type: resolvedOutput.type,
      value: resolvedOutput.value,
      openResource: resolvedOutput.openResource,
    });
    await exportFile(target, async (temporary) => {
      if (exported.bytes instanceof Uint8Array) await writeFile(temporary, exported.bytes, { flag: "wx" });
      else await writeStream(temporary, exported.bytes);
    });
  } else if (isBlobRef(resolvedOutput.value)) {
    const resource = resolvedOutput.value;
    await exportFile(target, async (temporary) => {
      const input = await resolvedOutput.openResource(resource);
      if (input === undefined) throw new Error(`Build ${build} Output ${output} Resource is unavailable`);
      await writeStream(
        temporary,
        input,
      );
    });
  } else {
    await exportFile(target, async (temporary) => {
      await writeFile(temporary, `${JSON.stringify(resolvedOutput.value, null, 2)}\n`, { flag: "wx" });
    });
  }
  return {
    build,
    output,
    type: retainedOutput.type,
    representation: isBlobRef(resolvedOutput.value)
      ? "file"
      : resolvedOutput.value !== null && typeof resolvedOutput.value === "object" ? "structured" : "inline",
    path: target,
  };
}
