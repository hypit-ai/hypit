import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { artifactTypes } from "@narratage/artifact";
import { defineEndpointPackage } from "@narratage/endpoint-kit";
import type { EndpointFulfillment } from "@narratage/endpoint-kit";
import { canonicalize } from "@narratage/protocol";
import type { CanonicalValue } from "@narratage/protocol";
import {
  assertRasterRequest,
  rasterCapabilities,
  rasterOutputMediaType,
  rasterSources,
} from "@narratage/raster";
import type { RasterRequest } from "@narratage/raster";

export const localOpenCvImageProviderModuleRef = {
  name: "@narratage/provider-image-opencv-local",
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

function request(value: CanonicalValue): RasterRequest {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "Raster request must be an object");
  const item = value as unknown as RasterRequest;
  assertRasterRequest(item);
  return item;
}

async function runProcess(options: {
  readonly executable: string;
  readonly args: readonly string[];
  readonly timeoutMs: number;
  readonly maxStderrBytes: number;
}): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(options.executable, [...options.args], { shell: false, stdio: ["ignore", "ignore", "pipe"] });
    let stderrBytes = 0;
    const stderr: Buffer[] = [];
    let failed: Error | undefined;
    const fail = (error: Error): void => {
      failed ??= error;
      child.kill("SIGKILL");
    };
    const timer = setTimeout(() => fail(new Error(`OpenCV image transform exceeded ${options.timeoutMs}ms`)),
      options.timeoutMs);
    child.stderr.on("data", (chunk: Buffer) => {
      stderrBytes += chunk.byteLength;
      if (stderrBytes > options.maxStderrBytes) {
        fail(new Error("OpenCV image transform stderr exceeded its limit"));
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
        reject(new Error(`OpenCV image transform exited with ${code ?? `signal ${signal ?? "unknown"}`}`
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
  return defineEndpointPackage({
    module: localOpenCvImageProviderModuleRef,
    facet: "raster",
    instance: config.instance ?? "image.opencv.local",
    pool: config.pool ?? config.instance ?? "image.opencv.local",
    defaultConcurrency: config.defaultConcurrency ?? 1,
    capabilities: [{
      lifecycle: "immediate" as const,
      capability: rasterCapabilities.execute,
      returns: artifactTypes.blob,
      handler: async (context): Promise<EndpointFulfillment> => {
        const need = request(context.need.constraints);
        const sources = [...new Map(rasterSources(need).map((source) => [source.digest, source])).values()];
        const totalInputBytes = sources.reduce((sum, source) => sum + source.size, 0);
        assert(totalInputBytes <= maxInputBytes, "Raster inputs exceed their configured byte limit");
        const work = await mkdtemp(join(tmpdir(), "narratage-raster-opencv-"));
        try {
          const paths = new Map<string, string>();
          for (const [index, source] of sources.entries()) {
            const bytes = await context.artifacts.get(source.digest);
            assert(bytes !== undefined, `Raster source Artifact ${source.digest} is unavailable`);
            assert(bytes.byteLength === source.size, "Raster source size differs from its BlobRef");
            const path = join(work, `source-${String(index + 1).padStart(4, "0")}.bin`);
            await writeFile(path, bytes);
            paths.set(source.digest, path);
          }
          const runtimeRequest = need.kind === "transform"
            ? { kind: "transform", source: paths.get(need.source.digest), operations: need.operations }
            : {
                kind: "compose", canvas: need.canvas, background: need.background,
                layers: need.layers.map((layer) => ({
                  source: paths.get(layer.source.digest), frame: layer.frame, fit: layer.fit,
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
            "OpenCV raster execution produced an invalid output size");
          const mediaType = rasterOutputMediaType(need);
          const artifact = await context.artifacts.put(await readFile(output), mediaType);
          return {
            value: artifact,
          };
        } finally {
          await rm(work, { recursive: true, force: true }).catch(() => {});
        }
      },
    }],
  });
}
