import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { blobTypes } from "@hypit/hypit/blob";
import { defineEndpoint } from "@hypit/hypit/endpoint";
import type { EndpointInvocationContext } from "@hypit/hypit/endpoint";
import type { CanonicalValue, Value } from "@hypit/hypit/protocol";
import {
  assertRasterComposition,
  rasterCompositionCapabilities,
  rasterCompositionSources,
} from "@hypit/raster-composition";
import type { RasterComposition } from "@hypit/raster-composition";

export const localOpenCvImageProviderModuleRef = {
  name: "@hypit/provider-image-opencv-local",
  version: "1",
} as const;

export type CreateLocalOpenCvImageProviderOptions = {
  readonly instance?: string;
  readonly pool?: string;
  readonly pythonExecutable?: string;
  readonly processTimeoutMs?: number;
  readonly maxInputBytes?: number;
  readonly maxOutputBytes?: number;
  readonly defaultConcurrency?: number;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function positiveInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive integer`);
  return value;
}

function compositionRequest(value: CanonicalValue): RasterComposition {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "Raster composition request must be an object");
  const item = value as unknown as RasterComposition;
  assertRasterComposition(item, true);
  return item;
}

async function runProcess(options: {
  readonly executable: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
  readonly maxStderrBytes: number;
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(options.executable, [...options.args], { shell: false, windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    let stderrBytes = 0;
    const stderr: Buffer[] = [];
    let failed: Error | undefined;
    const fail = (error: Error): void => {
      failed ??= error;
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => fail(new Error(`OpenCV raster composition exceeded ${options.timeoutMs}ms`)),
      options.timeoutMs);
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > options.maxStderrBytes) {
        fail(new Error("OpenCV raster composition stderr exceeded its limit"));
        return;
      }
      stderr.push(chunk);
    });
    child.on("error", fail);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (failed !== undefined) reject(failed);
      else if (code !== 0) {
        const detail = Buffer.concat(stderr).toString("utf8").trim();
        reject(new Error(`OpenCV raster composition exited with ${code ?? `signal ${signal ?? "unknown"}`}`
          + (detail.length === 0 ? "" : `: ${detail}`)));
      }
      else resolve();
    });
  });
}

export function createLocalOpenCvImageProvider(config: CreateLocalOpenCvImageProviderOptions) {
  const pythonExecutable = config.pythonExecutable ?? "python3";
  const processTimeoutMs = positiveInteger(config.processTimeoutMs ?? 5 * 60_000, "processTimeoutMs");
  const maxInputBytes = positiveInteger(config.maxInputBytes ?? 128 * 1024 * 1024, "maxInputBytes");
  const maxOutputBytes = positiveInteger(config.maxOutputBytes ?? 256 * 1024 * 1024, "maxOutputBytes");
  const script = fileURLToPath(new URL("../runtime/raster_execute.py", import.meta.url));

  const execute = async (
    need: RasterComposition,
    context: EndpointInvocationContext,
  ): Promise<Value> => {
    const sources = rasterCompositionSources(need);
    const uniqueSources = [...new Map(sources.map((source) => [source.resource, source])).values()];
    const totalInputBytes = uniqueSources.reduce((sum, source) => sum + source.size, 0);
    assert(totalInputBytes <= maxInputBytes, "Image operation inputs exceed their configured byte limit");
    const work = await mkdtemp(join(tmpdir(), "hypit-image-opencv-"));
    try {
      const paths = new Map<string, string>();
      for (const [index, source] of uniqueSources.entries()) {
        const bytes = await context.resources.get(source.resource);
        assert(bytes !== undefined, `Image source Artifact ${source.resource} is unavailable`);
        assert(bytes.byteLength === source.size, "Image source size differs from its BlobRef");
        const path = join(work, `source-${String(index + 1).padStart(4, "0")}.bin`);
        await writeFile(path, bytes);
        paths.set(source.resource, path);
      }
      const runtimeRequest = {
        kind: "compose",
        target: need.target,
        background: need.background,
        layers: need.layers.map((layer) => ({
          source: paths.get(layer.source.resource), mapping: layer.mapping,
          interpolation: layer.interpolation, opacity: layer.opacity,
        })),
      };
      const program = join(work, "request.json");
      const output = join(work, "output.bin");
      await writeFile(program, JSON.stringify(runtimeRequest), "utf8");
      await runProcess({
        executable: pythonExecutable,
        args: [script, program, output],
        timeoutMs: processTimeoutMs,
        maxStderrBytes: 256 * 1024,
      });
      const info = await stat(output);
      assert(info.isFile() && info.size > 0 && info.size <= maxOutputBytes,
        "OpenCV image execution produced an invalid output size");
      return await context.resources.put(await readFile(output), "image/png");
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => {});
    }
  };

  return defineEndpoint({
    instance: config.instance ?? "image.opencv.local",
    pool: config.pool ?? config.instance ?? "image.opencv.local",
    pricing: { kind: "local" },
    defaultConcurrency: config.defaultConcurrency ?? 1,
    capabilities: [{
      lifecycle: "immediate" as const,
      transient: true,
      capability: rasterCompositionCapabilities.render,
      returns: blobTypes.blob,
      handler: async (context): Promise<Value> =>
        await execute(compositionRequest(context.request.constraints), context),
    }],
  });
}
