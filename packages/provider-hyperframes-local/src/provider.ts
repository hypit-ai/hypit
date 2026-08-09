import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { mediaTypes, sealRenderedVisual } from "@narratage/media";
import type { RenderedVisual } from "@narratage/media";
import { verifyCompositableSurfaceBytes } from "@narratage/media-execution";
import type { EndpointInvocationContext, EndpointFulfillment } from "@narratage/endpoint-kit";
import { assertHyperframesDocument, stageHyperframesProject } from "@narratage/hyperframes";
import type { HyperframesDocument } from "@narratage/hyperframes";
import { renderHyperframesCapabilities } from "@narratage/render-hyperframes";
import { canonicalize, digestOf } from "@narratage/protocol";
import type { BlobRef, CanonicalValue, Digest } from "@narratage/protocol";
import { defineEndpointPackage } from "@narratage/endpoint-kit";

const HYPERFRAMES_VERSION = "0.7.101";

export const localHyperframesProviderModuleRef = {
  name: "@narratage/provider-hyperframes-local",
  version: "1",
} as const;
export const localHyperframesProviderImplementationDigest = digestOf(
  `@narratage/provider-hyperframes-local/render@1+hyperframes@${HYPERFRAMES_VERSION}`,
);

export type HyperframesWorkers = number | "auto";
export type HyperframesQuality = "draft" | "standard" | "high";
export type HyperframesBrowserGpu = "auto" | "software" | "hardware";

export type CreateLocalHyperframesProviderOptions = {
  readonly instance?: string;
  readonly lane?: string;
  readonly nodePath?: string;
  readonly hyperframesCliPath?: string;
  readonly ffprobePath?: string;
  /** Parallel Chrome workers inside one render. This is separate from Provider request concurrency. */
  readonly workers?: HyperframesWorkers;
  readonly quality?: HyperframesQuality;
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

type BrowserIdentity = {
  readonly path: string;
  readonly version: string;
  readonly digest: Digest;
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

function defaultHyperframesCliPath(): string {
  const require = createRequire(import.meta.url);
  return join(dirname(require.resolve("hyperframes/package.json")), "bin", "hyperframes.mjs");
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

async function artifactBytes(context: EndpointInvocationContext, artifact: BlobRef): Promise<Uint8Array> {
  const bytes = await context.artifacts.get(artifact.digest);
  assert(bytes !== undefined, `HyperFrames Artifact ${artifact.digest} is unavailable`);
  assert(bytes.byteLength === artifact.size, `HyperFrames Artifact ${artifact.digest} size differs`);
  return bytes;
}

async function fileDigest(path: string): Promise<Digest> {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(`sha256:${hash.digest("hex")}`));
  });
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
  const item = value as { readonly contract?: unknown; readonly document?: unknown };
  assert(item.contract === "svml.hyperframes-visual-render-request@1",
    "HyperFrames visual request contract is invalid");
  assertHyperframesDocument(item.document as HyperframesDocument);
  return item.document as HyperframesDocument;
}

function result(value: CanonicalValue, metadata: CanonicalValue): EndpointFulfillment {
  return {
    value: { kind: "inline", value },
    conformance: "exact",
    delivery: "executed",
    metadata,
  };
}

export function createLocalHyperframesProvider(config: CreateLocalHyperframesProviderOptions = {}) {
  const nodePath = config.nodePath ?? process.execPath;
  const hyperframesCliPath = config.hyperframesCliPath ?? defaultHyperframesCliPath();
  const ffprobePath = config.ffprobePath ?? "ffprobe";
  const workers = config.workers ?? "auto";
  assert(workers === "auto" || (Number.isSafeInteger(workers) && workers > 0 && workers <= 64),
    "workers must be auto or an integer in [1, 64]");
  const quality = config.quality ?? "standard";
  assert(["draft", "standard", "high"].includes(quality), "HyperFrames quality is invalid");
  const browserGpu = config.browserGpu ?? "software";
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
  let browserIdentity: Promise<BrowserIdentity> | undefined;
  const identifyBrowser = (): Promise<BrowserIdentity> => {
    browserIdentity ??= (async () => {
      const located = await runProcess({
        executable: nodePath,
        argv: [hyperframesCliPath, "browser", "path"],
        timeoutMs: processTimeoutMs,
        maxOutputBytes: maxProcessOutputBytes,
      });
      const path = Buffer.from(located.stdout).toString("utf8").trim();
      assert(path.length > 0 && !path.includes("\n") && !path.includes("\r"),
        "HyperFrames returned an invalid browser path");
      const [versionResult, digest] = await Promise.all([
        runProcess({
          executable: path,
          argv: ["--version"],
          timeoutMs: processTimeoutMs,
          maxOutputBytes: maxProcessOutputBytes,
        }),
        fileDigest(path),
      ]);
      const version = Buffer.from(versionResult.stdout).toString("utf8").trim();
      assert(version.length > 0, "HyperFrames browser returned no version");
      return { path, version, digest };
    })();
    return browserIdentity;
  };

  return defineEndpointPackage({
    module: localHyperframesProviderModuleRef,
    facet: "render",
    instance: config.instance ?? "hyperframes.local",
    ...(config.lane === undefined ? {} : { lane: config.lane }),
    implementation: {
      locator: "@narratage/provider-hyperframes-local/render",
      digest: localHyperframesProviderImplementationDigest,
    },
    permissions: ["process:hyperframes"],
    configuration,
    defaultConcurrency: config.defaultConcurrency ?? 1,
    capabilities: [{
      lifecycle: "immediate" as const,
      capability: renderHyperframesCapabilities.renderVisual,
      returns: mediaTypes.renderedVisual,
      supports: (need) => need.constraints !== null && typeof need.constraints === "object"
        && !Array.isArray(need.constraints)
        && (need.constraints as { readonly contract?: unknown }).contract
          === "svml.hyperframes-visual-render-request@1",
      handler: async (context) => {
        const document = visualRequest(context.need.constraints);
        const browser = await identifyBrowser();
        const work = await mkdtemp(join(tmpdir(), "svml-hyperframes-local-"));
        try {
          const staged = await stageHyperframesProject({
            document,
            directory: work,
            read: (artifact) => artifactBytes(context, artifact),
            validateSurface: async (surface, bytes) => canonicalize(
              await verifyCompositableSurfaceBytes({
                surface,
                bytes,
                ffprobePath,
                processTimeoutMs,
                maxProbeOutputBytes: maxProcessOutputBytes,
              }),
            ),
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
          const artifact = await context.artifacts.put(await readFile(output), "video/mp4");
          const value: RenderedVisual = sealRenderedVisual({
            contract: "svml.rendered-visual@1",
            frameRate: document.frameRate,
            frameCount: document.frameCount,
            canvas: document.canvas,
            artifact,
            muted: true,
          });
          return result(canonicalize(value), canonicalize({
            contract: "svml.hyperframes-renderer-attestation@1",
            provider: "hyperframes.local",
            providerImplementationDigest: localHyperframesProviderImplementationDigest,
            documentDigest: digestOf(document),
            hyperframesVersion: HYPERFRAMES_VERSION,
            browser: {
              version: browser.version,
              digest: browser.digest,
            },
            surfaceValidations: staged.surfaceValidations,
            workers,
            quality,
            browserGpu,
          }));
        } finally {
          await rm(work, { recursive: true, force: true }).catch(() => {});
        }
      },
    }],
  });
}
