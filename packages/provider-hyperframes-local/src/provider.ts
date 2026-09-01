import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mediaTypes, sealRenderedVisual } from "@hypit/media";
import type { RenderedVisual } from "@hypit/media";
import { verifyCompositableSurfaceBytes } from "@hypit/media-execution";
import type { EndpointInvocationContext, EndpointFulfillment } from "@hypit/endpoint-kit";
import { assertHyperframesDocument } from "@hypit/hyperframes";
import type { HyperframesDocument } from "@hypit/hyperframes";
import { stageHyperframesProject } from "@hypit/hyperframes/project";
import { renderHyperframesCapabilities } from "@hypit/render-hyperframes";
import { canonicalize } from "@hypit/protocol";
import { resolveNodePackageExecutable } from "@hypit/package-loader-node";
import { isStreamingResourceStore } from "@hypit/runtime";
import type { BlobRef, CanonicalValue } from "@hypit/protocol";
import { defineEndpointPackage } from "@hypit/endpoint-kit";

const HYPERFRAMES_VERSION = "0.7.101";

export const localHyperframesProviderModuleRef = {
  name: "@hypit/provider-hyperframes-local",
  version: "1",
} as const;

export type HyperframesWorkers = number | "auto";
export type HyperframesQuality = "draft" | "standard" | "high";
export type HyperframesBrowserGpu = "auto" | "software" | "hardware";

export type CreateLocalHyperframesProviderOptions = {
  readonly instance?: string;
  readonly pool?: string;
  readonly nodePath?: string;
  readonly hyperframesCliPath?: string;
  readonly ffprobePath?: string;
  /** Parallel Chrome workers inside one render. This is separate from Provider request concurrency. */
  readonly workers?: HyperframesWorkers;
  readonly quality?: HyperframesQuality;
  /**
   * Chrome's rasterizer. Defaults to `hardware`: a composited frame is drawn by the GPU rather
   * than by SwiftShader on the CPU, which is the difference between minutes and half an hour on a
   * full-length vertical render. Set `software` on a machine with no usable GPU.
   */
  readonly browserGpu?: HyperframesBrowserGpu;
  /** Number of whole documents allowed to render at once on this configured instance. */
  readonly defaultConcurrency?: number;
  readonly processTimeoutMs?: number;
  readonly maxProcessOutputBytes?: number;
  readonly maxRenderedBytes?: number;
};

type ProcessResult = {
  readonly stdout: Uint8Array;
  readonly stderr: string;
};

type ProbeStream = {
  readonly codec_type?: unknown;
  readonly codec_name?: unknown;
  readonly width?: unknown;
  readonly height?: unknown;
  readonly avg_frame_rate?: unknown;
  readonly r_frame_rate?: unknown;
  readonly nb_read_frames?: unknown;
  readonly nb_frames?: unknown;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function positiveInteger(value: number, subject: string): number {
  assert(Number.isSafeInteger(value) && value > 0, `${subject} must be a positive integer`);
  return value;
}

export function defaultHyperframesCliPath(): string {
  return resolveNodePackageExecutable("hyperframes", "hyperframes", { from: import.meta.url });
}

function processEnvironment(): NodeJS.ProcessEnv {
  const names = ["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"] as const;
  return Object.fromEntries(names.flatMap((name) => process.env[name] === undefined
    ? []
    : [[name, process.env[name]]])) as NodeJS.ProcessEnv;
}

async function runProcess(args: {
  readonly executable: string;
  readonly argv: readonly string[];
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
}): Promise<ProcessResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(args.executable, [...args.argv], {
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: processEnvironment(),
    });
    const stdout: Buffer[] = [];
    let outputBytes = 0;
    let stderr = "";
    let settled = false;
    const finish = (error?: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error === undefined) resolve({ stdout: Buffer.concat(stdout), stderr });
      else reject(error);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`${args.executable} timed out`));
    }, args.timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      if (outputBytes > args.maxOutputBytes) {
        child.kill("SIGKILL");
        finish(new Error(`${args.executable} output exceeded the configured limit`));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      outputBytes += chunk.byteLength;
      stderr = `${stderr}${chunk.toString()}`.slice(-32_000);
      if (outputBytes > args.maxOutputBytes) {
        child.kill("SIGKILL");
        finish(new Error(`${args.executable} output exceeded the configured limit`));
      }
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (code === 0) finish();
      else finish(new Error(`${args.executable} exited ${String(code)}: ${stderr}`));
    });
  });
}

async function artifactBytes(
  context: EndpointInvocationContext,
  artifact: BlobRef,
): Promise<Uint8Array | AsyncIterable<Uint8Array>> {
  if (isStreamingResourceStore(context.resources)) {
    const chunks = await context.resources.open(artifact.resource);
    assert(chunks !== undefined, `HyperFrames Artifact ${artifact.resource} is unavailable`);
    return chunks;
  }
  const bytes = await context.resources.get(artifact.resource);
  assert(bytes !== undefined, `HyperFrames Artifact ${artifact.resource} is unavailable`);
  assert(bytes.byteLength === artifact.size, `HyperFrames Artifact ${artifact.resource} size differs`);
  return bytes;
}

function parseRational(value: unknown, subject: string): { readonly numerator: bigint; readonly denominator: bigint } {
  assert(typeof value === "string" && /^\d+\/\d+$/u.test(value), `${subject} is not a rational`);
  const [numerator, denominator] = value.split("/");
  assert(numerator !== undefined && denominator !== undefined && BigInt(denominator) > 0n,
    `${subject} is invalid`);
  return { numerator: BigInt(numerator), denominator: BigInt(denominator) };
}

function equalsRational(
  actual: { readonly numerator: bigint; readonly denominator: bigint },
  expected: { readonly numerator: number; readonly denominator: number },
): boolean {
  return actual.numerator * BigInt(expected.denominator)
    === BigInt(expected.numerator) * actual.denominator;
}

function outputFrameCount(stream: ProbeStream): number {
  const value = stream.nb_read_frames ?? stream.nb_frames;
  assert(typeof value === "string" && /^\d+$/u.test(value), "Rendered visual has no decoded frame count");
  const count = Number(value);
  assert(Number.isSafeInteger(count), "Rendered visual frame count exceeds safe arithmetic");
  return count;
}

async function verifyOutput(args: {
  readonly path: string;
  readonly document: HyperframesDocument;
  readonly ffprobePath: string;
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
}): Promise<void> {
  const probe = await runProcess({
    executable: args.ffprobePath,
    argv: ["-v", "error", "-print_format", "json", "-show_streams", "-count_frames", args.path],
    timeoutMs: args.timeoutMs,
    maxOutputBytes: args.maxOutputBytes,
  });
  let value: unknown;
  try {
    value = JSON.parse(Buffer.from(probe.stdout).toString("utf8"));
  } catch {
    throw new Error("ffprobe returned invalid JSON for the HyperFrames output");
  }
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "ffprobe returned an invalid HyperFrames inspection");
  const streams = (value as { readonly streams?: unknown }).streams;
  assert(Array.isArray(streams) && streams.length === 1, "Rendered visual must contain exactly one stream");
  const stream = streams[0] as ProbeStream;
  assert(stream.codec_type === "video" && stream.codec_name === "h264",
    "Rendered visual must contain one H.264 video stream and no audio");
  assert(stream.width === args.document.canvas.width && stream.height === args.document.canvas.height,
    "Rendered visual canvas differs from its document");
  const rate = parseRational(stream.avg_frame_rate ?? stream.r_frame_rate, "Rendered visual frame rate");
  assert(equalsRational(rate, args.document.frameRate), "Rendered visual frame rate differs from its document");
  assert(outputFrameCount(stream) === args.document.frameCount,
    "Rendered visual frame count differs from its document");
}

function visualRequest(value: CanonicalValue): HyperframesDocument {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "HyperFrames visual request must be an object");
  const item = value as { readonly document?: unknown };
  assertHyperframesDocument(item.document as HyperframesDocument);
  return item.document as HyperframesDocument;
}

function result(value: CanonicalValue): EndpointFulfillment {
  return { value: { kind: "inline", value } };
}

export function createLocalHyperframesProvider(config: CreateLocalHyperframesProviderOptions) {
  const nodePath = config.nodePath ?? process.execPath;
  const hyperframesCliPath = config.hyperframesCliPath ?? defaultHyperframesCliPath();
  const ffprobePath = config.ffprobePath ?? "ffprobe";
  const workers = config.workers ?? "auto";
  assert(workers === "auto" || (Number.isSafeInteger(workers) && workers > 0 && workers <= 64),
    "workers must be auto or an integer in [1, 64]");
  const quality = config.quality ?? "standard";
  assert(["draft", "standard", "high"].includes(quality), "HyperFrames quality is invalid");
  const browserGpu = config.browserGpu ?? "hardware";
  assert(["auto", "software", "hardware"].includes(browserGpu), "HyperFrames browserGpu is invalid");
  const processTimeoutMs = positiveInteger(config.processTimeoutMs ?? 30 * 60_000, "processTimeoutMs");
  const maxProcessOutputBytes = positiveInteger(config.maxProcessOutputBytes ?? 4 * 1024 * 1024,
    "maxProcessOutputBytes");
  const maxRenderedBytes = positiveInteger(config.maxRenderedBytes ?? 16 * 1024 * 1024 * 1024,
    "maxRenderedBytes");
  const configuration = canonicalize({
    nodePath,
    hyperframesCliPath,
    hyperframesVersion: HYPERFRAMES_VERSION,
    ffprobePath,
    workers,
    quality,
    browserGpu,
    processTimeoutMs,
    maxProcessOutputBytes,
    maxRenderedBytes,
  });
  return defineEndpointPackage({
    module: localHyperframesProviderModuleRef,
    facet: "render",
    instance: config.instance ?? "hyperframes.local",
    pool: config.pool ?? config.instance ?? "hyperframes.local",
    defaultConcurrency: config.defaultConcurrency ?? 1,
    capabilities: [{
      lifecycle: "immediate" as const,
      capability: renderHyperframesCapabilities.renderVisual,
      returns: mediaTypes.renderedVisual,
      handler: async (context) => {
        const document = visualRequest(context.need.constraints);
        const work = await mkdtemp(join(tmpdir(), "hypit-hyperframes-local-"));
        try {
          await stageHyperframesProject({
            document,
            directory: work,
            read: (artifact) => artifactBytes(context, artifact),
            validateSurface: async (surface, bytes) => {
              await verifyCompositableSurfaceBytes({
                surface,
                bytes,
                ffprobePath,
                processTimeoutMs,
                maxProbeOutputBytes: maxProcessOutputBytes,
              });
            },
          });
          const output = join(work, "visual.mp4");
          const fps = document.frameRate.denominator === 1
            ? String(document.frameRate.numerator)
            : `${document.frameRate.numerator}/${document.frameRate.denominator}`;
          const browserGpuArg = browserGpu === "software"
            ? ["--no-browser-gpu"]
            : browserGpu === "hardware" ? ["--browser-gpu"] : [];
          await runProcess({
            executable: nodePath,
            argv: [
              hyperframesCliPath,
              "render",
              work,
              "--composition", "index.html",
              "--output", output,
              "--format", "mp4",
              "--fps", fps,
              "--workers", String(workers),
              "--quality", quality,
              ...browserGpuArg,
              "--no-best-effort",
              "--quiet",
            ],
            timeoutMs: processTimeoutMs,
            maxOutputBytes: maxProcessOutputBytes,
          });
          const outputStat = await stat(output);
          assert(outputStat.isFile() && outputStat.size > 0, "HyperFrames emitted no visual output");
          assert(outputStat.size <= maxRenderedBytes, "HyperFrames output exceeded the configured size limit");
          await verifyOutput({
            path: output,
            document,
            ffprobePath,
            timeoutMs: processTimeoutMs,
            maxOutputBytes: maxProcessOutputBytes,
          });
          const artifact = isStreamingResourceStore(context.resources)
            ? await context.resources.putStream(createReadStream(output), "video/mp4")
            : await context.resources.put(await readFile(output), "video/mp4");
          const value: RenderedVisual = sealRenderedVisual({
            frameRate: document.frameRate,
            frameCount: document.frameCount,
            canvas: document.canvas,
            artifact,
          });
          return result(canonicalize(value));
        } finally {
          await rm(work, { recursive: true, force: true }).catch(() => {});
        }
      },
    }],
  });
}
