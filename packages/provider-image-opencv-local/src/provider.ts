import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { artifactTypes } from "@narratage/artifact";
import { defineEndpointPackage } from "@narratage/endpoint-kit";
import type { EndpointFulfillment } from "@narratage/endpoint-kit";
import {
  imageTransformCapabilities,
  verifyImageTransformProgram,
} from "@narratage/image-transform";
import type { ImageTransformRequest } from "@narratage/image-transform";
import type { ImageEncodeOperation } from "@narratage/image-transform";
import { canonicalize, digestOf } from "@narratage/protocol";
import type { CanonicalValue } from "@narratage/protocol";

export const localOpenCvImageProviderModuleRef = {
  name: "@narratage/provider-image-opencv-local",
  version: "0.0.0-dev",
} as const;
export const localOpenCvImageProviderImplementationDigest = digestOf(
  "@narratage/provider-image-opencv-local/opencv@1",
);

export type CreateLocalOpenCvImageProviderOptions = {
  readonly instance?: string;
  readonly lane?: string;
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

function request(value: CanonicalValue): ImageTransformRequest {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "Image transform request must be an object");
  const item = value as unknown as ImageTransformRequest;
  assert(item.contract === "svml.image-transform-request@1"
    && item.source?.kind === "blob"
    && item.source.mediaType.startsWith("image/"),
  "Image transform request is invalid");
  verifyImageTransformProgram(item.program);
  return item;
}

function outputMediaType(program: ImageTransformRequest["program"]): string {
  const format = program.operations.find((operation): operation is ImageEncodeOperation =>
    operation.kind === "encode")?.format ?? "png";
  return format === "jpeg" ? "image/jpeg" : format === "webp" ? "image/webp" : "image/png";
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

export function createLocalOpenCvImageProvider(config: CreateLocalOpenCvImageProviderOptions = {}) {
  const pythonExecutable = config.pythonExecutable ?? "python3";
  const processTimeoutMs = positiveInteger(config.processTimeoutMs ?? 5 * 60_000, "processTimeoutMs");
  const maxInputBytes = positiveInteger(config.maxInputBytes ?? 128 * 1024 * 1024, "maxInputBytes");
  const maxOutputBytes = positiveInteger(config.maxOutputBytes ?? 256 * 1024 * 1024, "maxOutputBytes");
  const script = fileURLToPath(new URL("../runtime/image_transform.py", import.meta.url));
  return defineEndpointPackage({
    module: localOpenCvImageProviderModuleRef,
    facet: "image-transform",
    instance: config.instance ?? "image.opencv.local",
    ...(config.lane === undefined ? {} : { lane: config.lane }),
    implementation: {
      locator: "@narratage/provider-image-opencv-local/opencv",
      digest: localOpenCvImageProviderImplementationDigest,
    },
    permissions: ["process:image"],
    configuration: canonicalize({ pythonExecutable, processTimeoutMs, maxInputBytes, maxOutputBytes }),
    defaultConcurrency: config.defaultConcurrency ?? 1,
    capabilities: [{
      lifecycle: "immediate" as const,
      capability: imageTransformCapabilities.transform,
      returns: artifactTypes.blob,
      supports: (need) => {
        try {
          request(need.constraints);
          return true;
        } catch {
          return false;
        }
      },
      handler: async (context): Promise<EndpointFulfillment> => {
        const need = request(context.need.constraints);
        assert(need.source.size <= maxInputBytes, "Image transform input exceeds its configured byte limit");
        const bytes = await context.artifacts.get(need.source.digest);
        assert(bytes !== undefined, `Image transform source Artifact ${need.source.digest} is unavailable`);
        assert(bytes.byteLength === need.source.size, "Image transform source size differs from its BlobRef");
        const work = await mkdtemp(join(tmpdir(), "svml-image-opencv-"));
        try {
          const input = join(work, "input.bin");
          const program = join(work, "program.json");
          const output = join(work, "output.bin");
          await writeFile(input, bytes);
          await writeFile(program, JSON.stringify(need.program), "utf8");
          await runProcess({
            executable: pythonExecutable,
            args: [script, input, program, output],
            timeoutMs: processTimeoutMs,
            maxStderrBytes: 256 * 1024,
          });
          const info = await stat(output);
          assert(info.isFile() && info.size > 0 && info.size <= maxOutputBytes,
            "OpenCV image transform produced an invalid output size");
          const mediaType = outputMediaType(need.program);
          const artifact = await context.artifacts.put(await readFile(output), mediaType);
          return {
            value: artifact,
            conformance: "exact",
            delivery: "executed",
            metadata: canonicalize({ provider: "opencv.local", operation: "image-transform" }),
          };
        } finally {
          await rm(work, { recursive: true, force: true }).catch(() => {});
        }
      },
    }],
  });
}
