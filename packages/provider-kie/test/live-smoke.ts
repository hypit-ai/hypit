import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { FileArtifactStore, createFileArtifactStorePackage } from "@narratage/artifact-store-fs";
import { createEnvironmentCredentialStorePackage } from "@narratage/credential-store-env";
import { registerTypeValidatorFacets } from "@narratage/component-kit";
import {
  createResolvedClosure,
  digestOf,
  link,
  sealBuildRequest,
  sealCompiledGraph,
  sealRecord,
  start,
} from "@narratage/core";
import { narrativeManifest } from "@narratage/narrative";
import { mediaManifest } from "@narratage/media";
import {
  geminiOmniComponent,
  geminiOmniEndpoints,
  geminiOmniManifest,
  sealGeminiOmniRequest,
} from "@narratage/gemini-omni";
import {
  generationComponent,
  generationManifest,
  verifyGeneratedImageSet,
  verifyGeneratedVideoSet,
} from "@narratage/generation";
import {
  gptImageComponent,
  gptImageEndpoints,
  gptImageManifest,
  sealGptImage2Request,
} from "@narratage/gpt-image";
import {
  grokImagineComponent,
  grokImagineEndpoints,
  grokImagineManifest,
  sealGrokImagineRequest,
} from "@narratage/grok-imagine";
import { createLocalExecutionPackage, createProjectLocalRuntime } from "@narratage/runtime-local";
import type { LocalBuildSubmission } from "@narratage/runtime-local";
import {
  minimaxH3Component,
  minimaxH3Endpoints,
  minimaxH3Manifest,
  sealMinimaxH3Request,
} from "@narratage/minimax-h3";
import type { ExactModelEndpoint, ExactModelModule } from "@narratage/model-kit";
import {
  nanoBananaComponent,
  nanoBananaEndpoints,
  nanoBananaManifest,
  sealNanoBananaRequest,
} from "@narratage/nano-banana";
import { createKieProvider } from "@narratage/provider-kie";
import type {
  BlobRef,
  CanonicalValue,
  ModuleManifest,
  TypedRecord,
} from "@narratage/protocol";
import { credentialRef } from "@narratage/runtime";
import { createSqliteRuntimeInfrastructurePackage } from "@narratage/store-sqlite";
import {
  sealSeedanceRequest,
  seedanceComponent,
  seedanceEndpoints,
  seedanceManifest,
} from "@narratage/seedance";
import {
  sealSeedreamRequest,
  seedreamComponent,
  seedreamEndpoints,
  seedreamManifest,
} from "@narratage/seedream";
import { admitRecord, TypeValidatorRegistry } from "@narratage/validation";

type SmokeCase = {
  readonly key: string;
  readonly media: "image" | "video";
  readonly endpoint: ExactModelEndpoint;
  readonly manifest: ModuleManifest;
  readonly component: ExactModelModule["component"];
  readonly request: CanonicalValue;
  readonly ids: {
    readonly request: string;
    readonly source: string;
    readonly output: string;
    readonly candidate: string;
    readonly operation: string;
    readonly need: string;
    readonly result: string;
  };
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function object(value: unknown, subject: string): Record<string, unknown> {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), `${subject} is not an object`);
  return value as Record<string, unknown>;
}

function endpoint(value: ExactModelEndpoint | undefined, subject: string): ExactModelEndpoint {
  assert(value !== undefined, `${subject} endpoint is unavailable`);
  return value;
}

function apiBaseUrl(value: string): string {
  const url = new URL(value);
  assert(url.protocol === "https:" || url.hostname === "localhost", "KIE_BASE_URL must use HTTPS or localhost");
  return url.href.replace(/\/$/u, "");
}

async function accountCredits(baseUrl: string, key: string): Promise<number> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/v1/chat/credit`, {
        method: "GET",
        headers: { authorization: `Bearer ${key}` },
      });
    } catch (error) {
      lastError = error;
      if (attempt < 4) await new Promise((done) => setTimeout(done, attempt * 1_000));
      continue;
    }
    const text = await response.text();
    if (response.ok) {
      const body = object(JSON.parse(text), "KIE credit response");
      assert(body.code === 200 && typeof body.data === "number" && Number.isFinite(body.data),
        `KIE credit response is invalid: ${text.slice(0, 300)}`);
      return body.data;
    }
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable) throw new Error(`KIE credit check returned HTTP ${response.status}: ${text.slice(0, 300)}`);
    lastError = new Error(`KIE credit check returned retryable HTTP ${response.status}`);
    if (attempt < 4) await new Promise((done) => setTimeout(done, attempt * 1_000));
  }
  throw lastError instanceof Error ? lastError : new Error("KIE credit check failed");
}

function resultExtension(mediaType: string): string {
  const known: Readonly<Record<string, string>> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
  };
  return known[mediaType] ?? ".bin";
}

function caseIds(key: string, media: "image" | "video"): SmokeCase["ids"] {
  if (key === "gpt-image-2") {
    return {
      request: "request:gpt-image-2-live",
      source: "@narratage/provider-kie/live-smoke/gpt-image-2@1",
      output: "result:image",
      candidate: "candidate:gpt-image-2",
      operation: "operation:gpt-image-2",
      need: "need:gpt-image-2",
      result: "result:gpt-image-2",
    };
  }
  return {
    request: `request:${key}-live`,
    source: `@narratage/provider-kie/live-smoke/${key}@1`,
    output: `result:${key}`,
    candidate: `candidate:${key}`,
    operation: `operation:${key}`,
    need: `need:${key}`,
    result: `result:${key}:${media}`,
  };
}

function referenceMediaType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".png")) return "image/png";
  throw new Error("NARRATAGE_KIE_SMOKE_REFERENCE must be a PNG, JPEG or WebP image");
}

async function smokeCases(root: string): Promise<readonly SmokeCase[]> {
  const productPrompt = "A single translucent glass sphere on a matte cobalt blue background, centered studio product photograph, soft shadow, no text.";
  const motionPrompt = "A translucent glass sphere slowly rolls across a matte cobalt blue studio floor, locked camera, soft shadow, no text.";
  const cases: Array<Omit<SmokeCase, "ids">> = [
    {
      key: "gpt-image-2",
      media: "image",
      endpoint: endpoint(gptImageEndpoints.image, "GPT Image 2"),
      manifest: gptImageManifest,
      component: gptImageComponent,
      request: sealGptImage2Request({
        prompt: [productPrompt],
        aspectRatio: ["1:1"],
      }) as unknown as CanonicalValue,
    },
    {
      key: "nano-banana-2",
      media: "image",
      endpoint: endpoint(nanoBananaEndpoints.v2, "Nano Banana 2"),
      manifest: nanoBananaManifest,
      component: nanoBananaComponent,
      request: sealNanoBananaRequest("nano-banana-2", {
        prompt: [productPrompt],
        aspectRatio: ["1:1"],
        resolution: ["1K"],
        outputFormat: ["png"],
      }) as unknown as CanonicalValue,
    },
    {
      key: "seedream-5-lite",
      media: "image",
      endpoint: endpoint(seedreamEndpoints.image, "Seedream 5 Lite"),
      manifest: seedreamManifest,
      component: seedreamComponent,
      request: sealSeedreamRequest({
        prompt: [productPrompt],
        aspectRatio: ["1:1"],
        quality: ["basic"],
        outputFormat: ["png"],
        nsfwCheck: [true],
      }) as unknown as CanonicalValue,
    },
    {
      key: "seedance-2-mini",
      media: "video",
      endpoint: endpoint(seedanceEndpoints.mini, "Seedance 2 Mini"),
      manifest: seedanceManifest,
      component: seedanceComponent,
      request: sealSeedanceRequest("seedance-2-mini", {
        prompt: [motionPrompt],
        resolution: ["480p"],
        aspectRatio: ["1:1"],
        duration: [4],
        generateAudio: [false],
        webSearch: [false],
      }) as unknown as CanonicalValue,
    },
    {
      key: "minimax-h3",
      media: "video",
      endpoint: endpoint(minimaxH3Endpoints.video, "MiniMax H3"),
      manifest: minimaxH3Manifest,
      component: minimaxH3Component,
      request: sealMinimaxH3Request({
        prompt: [motionPrompt],
        duration: [6],
        aspectRatio: ["16:9"],
      }) as unknown as CanonicalValue,
    },
    {
      key: "gemini-omni",
      media: "video",
      endpoint: endpoint(geminiOmniEndpoints.video, "Gemini Omni video"),
      manifest: geminiOmniManifest,
      component: geminiOmniComponent,
      request: sealGeminiOmniRequest({
        prompt: [motionPrompt],
        duration: [4],
        aspectRatio: ["16:9"],
        resolution: ["720p"],
      }) as unknown as CanonicalValue,
    },
    {
      key: "grok-imagine",
      media: "video",
      endpoint: endpoint(grokImagineEndpoints.video, "Grok Imagine"),
      manifest: grokImagineManifest,
      component: grokImagineComponent,
      request: sealGrokImagineRequest("grok-imagine-video", {
        prompt: [motionPrompt],
        aspectRatio: ["2:3"],
        resolution: ["480p"],
        duration: [6],
      }) as unknown as CanonicalValue,
    },
  ];
  const referencePath = process.env.NARRATAGE_KIE_SMOKE_REFERENCE;
  if (referencePath !== undefined) {
    const absolute = resolve(referencePath);
    const store = new FileArtifactStore(join(root, ".svml", "artifacts"));
    const reference = await store.put(await readFile(absolute), referenceMediaType(absolute));
    cases.push({
      key: "gpt-image-2-edit",
      media: "image",
      endpoint: endpoint(gptImageEndpoints.image, "GPT Image 2 edit"),
      manifest: gptImageManifest,
      component: gptImageComponent,
      request: sealGptImage2Request({
        prompt: ["Keep the glass sphere unchanged and replace the blue background with a matte warm orange studio background, no text."],
        aspectRatio: ["1:1"],
        images: [{ role: "image", artifact: reference }],
      }) as unknown as CanonicalValue,
    });
  }
  return cases.map((item) => ({ ...item, ids: caseIds(item.key, item.media) }));
}

function selectCases(cases: readonly SmokeCase[]): readonly SmokeCase[] {
  const requested = process.env.NARRATAGE_KIE_SMOKE_CASES ?? "gpt-image-2";
  if (requested === "all") return cases;
  const keys = requested.split(",").map((item) => item.trim()).filter((item) => item.length > 0);
  assert(keys.length > 0, "NARRATAGE_KIE_SMOKE_CASES selected no cases");
  const available = new Map(cases.map((item) => [item.key, item]));
  return keys.map((key) => {
    const item = available.get(key);
    assert(item !== undefined, `unknown KIE smoke case ${key}; choose ${[...available.keys()].join(", ")}, or all`);
    return item;
  });
}

async function createBuild(item: SmokeCase): Promise<ReturnType<typeof start>> {
  const closure = createResolvedClosure([mediaManifest, narrativeManifest, generationManifest, item.manifest]);
  const validators = new TypeValidatorRegistry();
  registerTypeValidatorFacets(validators, generationComponent.validators);
  registerTypeValidatorFacets(validators, item.component.validators);
  const draft = sealRecord({
    id: item.ids.request,
    type: item.endpoint.requestType,
    value: { kind: "inline", value: item.request },
    origin: { kind: "authored" },
  });
  const authored = await admitRecord(closure, draft, validators);
  const program = link(closure, [authored]);
  const graph = sealCompiledGraph({
    program: program.semanticDigest,
    outputs: [{
      id: item.ids.output,
      type: item.endpoint.returns,
      primary: item.ids.candidate,
    }],
    candidates: [{
      id: item.ids.candidate,
      type: item.endpoint.returns,
      root: { kind: "operation", result: { kind: "operation-result", operation: item.ids.operation } },
    }],
    operations: [{
      id: item.ids.operation,
      producer: item.endpoint.producer,
      inputs: { request: { kind: "record", id: authored.id } },
      result: {
        kind: "need",
        name: "generation",
        id: item.ids.need,
        record: item.ids.result,
      },
    }],
  });
  return start(program, graph, sealBuildRequest({
    graph: graph.id,
    targets: [{ output: item.ids.output }],
  }));
}

function generatedArtifact(item: SmokeCase, records: readonly TypedRecord[]): BlobRef {
  const record = records.find((candidate) => candidate.id === item.ids.result);
  assert(record !== undefined, `completed ${item.key} Build has no generated Record`);
  assert(record.value.kind === "inline", `${item.key} generated Record is not inline`);
  if (item.media === "image") verifyGeneratedImageSet(record.value.value);
  else verifyGeneratedVideoSet(record.value.value);
  const product = object(record.value.value, item.media === "image" ? "GeneratedImageSet" : "GeneratedVideoSet");
  const artifacts = product[item.media === "image" ? "images" : "videos"];
  assert(Array.isArray(artifacts) && artifacts.length > 0, `${item.key} generated Product has no artifacts`);
  const first = object(artifacts[0], `${item.key} generated artifact`);
  assert(first.kind === "blob" && typeof first.digest === "string"
    && typeof first.size === "number" && typeof first.mediaType === "string", `${item.key} BlobRef is invalid`);
  return first as unknown as BlobRef;
}

async function inspectArtifact(root: string, item: SmokeCase, artifact: BlobRef): Promise<string> {
  const artifactHex = artifact.digest.slice("sha256:".length);
  const artifactPath = join(root, ".svml", "artifacts", "sha256", artifactHex.slice(0, 2), artifactHex);
  const inspectPath = join(root, `${item.key}-live${resultExtension(artifact.mediaType)}`);
  await writeFile(inspectPath, await readFile(artifactPath), { flag: "w" });
  return inspectPath;
}

function failureMessage(item: SmokeCase, build: LocalBuildSubmission): string {
  const diagnostic = build.state.diagnostics.map((entry) => `${entry.code}: ${entry.message}`).join("; ");
  return `${item.key} KIE smoke Build ${build.status}: ${diagnostic || build.dispatch.reason || "no diagnostic"}`;
}

async function main(): Promise<void> {
  assert(process.env.NARRATAGE_KIE_LIVE === "1",
    "KIE live smoke is paid and opt-in; set NARRATAGE_KIE_LIVE=1 explicitly");
  const key = process.env.KIE_API_KEY;
  assert(key !== undefined && key.length > 0, "KIE_API_KEY is required");
  const baseUrl = apiBaseUrl(process.env.KIE_BASE_URL ?? "https://api.kie.ai");
  const root = resolve(process.env.NARRATAGE_KIE_SMOKE_ROOT ?? join(tmpdir(), "narratage-kie-live"));
  await mkdir(root, { recursive: true });
  const selected = selectCases(await smokeCases(root));
  console.log(`KIE smoke cases: ${selected.map((item) => item.key).join(", ")}`);
  console.log(`KIE smoke Runtime root: ${root}`);

  const provider = createKieProvider({
    instance: "kie.live-smoke",
    apiBaseUrl: baseUrl,
    apiKey: credentialRef("env", "KIE_API_KEY"),
    defaultConcurrency: 1,
    pollIntervalMs: 3_000,
  });
  const execution = createLocalExecutionPackage("execution");
  const state = createSqliteRuntimeInfrastructurePackage({
    path: join(root, ".narratage", "runtime.sqlite"),
    instance: "state",
  });
  const artifacts = createFileArtifactStorePackage({ root: join(root, ".narratage", "artifacts"), instance: "artifacts" });
  const credentials = createEnvironmentCredentialStorePackage({ instance: "credentials" });
  const runtime = await createProjectLocalRuntime({
    dataRoot: root,
    infrastructure: [execution, state, artifacts, credentials],
    roles: {
      scheduler: { from: "execution", part: "scheduler" },
      worker: { from: "execution", part: "worker" },
      buildStore: { from: "state", part: "builds" },
      operationStore: { from: "state", part: "operations" },
      dispatchStore: { from: "state", part: "dispatch" },
      artifactStore: { from: "artifacts", part: "store" },
      credentialStores: [{ from: "credentials", part: "store" }],
    },
    components: [
      generationComponent,
      ...[...new Map(selected.map((item) => [item.manifest.name, item.component])).values()],
    ],
    endpoints: [provider],
    scheduling: { maxConcurrency: 1 },
  });
  const failures: string[] = [];
  const workerAbort = new AbortController();
  const workerRun = runtime.work({
    owner: `kie-smoke-${process.pid}`,
    leaseMs: 30_000,
    idlePollMs: 100,
    signal: workerAbort.signal,
  });
  try {
    for (const item of selected) {
      const before = await accountCredits(baseUrl, key);
      console.log(`[${item.key}] credits before: ${before}`);
      try {
        const state = await createBuild(item);
        const build = await runtime.build(
          { id: `bld_${randomUUID()}`, state },
          { follow: true, pollIntervalMs: 1_000, maxWaitMs: 20 * 60_000 },
        );
        if (build.status !== "complete") throw new Error(failureMessage(item, build));
        const artifact = generatedArtifact(item, build.state.records);
        const inspectPath = await inspectArtifact(root, item, artifact);
        console.log(`[${item.key}] artifact: ${artifact.digest}`);
        console.log(`[${item.key}] inspection copy: ${inspectPath}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${item.key}: ${message}`);
        console.error(`[${item.key}] FAILED: ${message}`);
      }
      const after = await accountCredits(baseUrl, key);
      console.log(`[${item.key}] credits after: ${after}; consumed: ${before - after}`);
    }
  } finally {
    workerAbort.abort();
    await workerRun;
    await runtime.close();
  }
  if (failures.length > 0) throw new Error(`KIE live smoke failures:\n${failures.join("\n")}`);
}

await main();
