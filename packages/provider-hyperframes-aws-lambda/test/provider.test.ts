import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fixtureDigest } from "../../../test/fixture-digest.js";

import { validateDistributedRenderConfig } from "@hyperframes/aws-lambda/sdk";
import { EndpointRegistry, MemoryArtifactStore } from "@narratage/driver-node";
import type { EndpointRegistration } from "@narratage/driver-node";
import type { AsyncEndpoint } from "@narratage/endpoint-kit";
import type { HyperframesDocument } from "@narratage/hyperframes";
import { mediaTypes, verifyRenderedVisual } from "@narratage/media";
import type { RenderedVisual } from "@narratage/media";
import {
  createAwsLambdaHyperframesProvider,
  supportsAwsLambdaHyperframes,
} from "@narratage/provider-hyperframes-aws-lambda";
import type {
  HyperframesAwsLambdaClient,
  HyperframesLambdaProgress,
  HyperframesLambdaRender,
  HyperframesLambdaRenderConfig,
  HyperframesLambdaSite,
} from "@narratage/provider-hyperframes-aws-lambda";
import { canonicalize } from "@narratage/protocol";
import type { CanonicalValue, Need } from "@narratage/protocol";
import type { RuntimeEndpointAdapterImplementation } from "@narratage/runtime-kit";
import {
  hyperframesVisualRequest,
  renderHyperframesCapabilities,
} from "@narratage/render-hyperframes";
import type { ArtifactStore, StreamingArtifactStore } from "@narratage/runtime";

import { narratagePackage as awsLambdaActivation } from "../src/activation.js";

const ACCOUNT = "123456789012";
const REGION = "us-east-1";
const BUCKET = "narratage-render-test";
const STATE_MACHINE = `arn:aws:states:${REGION}:${ACCOUNT}:stateMachine:narratage-hyperframes`;
const EXECUTION_PREFIX = `arn:aws:states:${REGION}:${ACCOUNT}:execution:narratage-hyperframes:`;
function documentFixture(fps = 30, denominator = 1): HyperframesDocument {
  return {
    visualIr: "narratage.visual-ir@1",
    frameRate: { numerator: fps, denominator },
    frameCount: 60,
    canvas: { width: 720, height: 1280 },
    artifacts: [],
    surfaces: [],
    html: "<!doctype html><html><body><div>SVML</div></body></html>",
  };
}

function requestNeed(document = documentFixture()): Need {
  const constraints = hyperframesVisualRequest(document);
  return {
    id: "need:hyperframes-lambda-test",
    capability: renderHyperframesCapabilities.renderVisual,
    returns: mediaTypes.renderedVisual,
    constraints,
    result: "record:hyperframes-lambda-test",
  };
}

function operation(request: Need) {
  return `operation:${request.id}`;
}

function successfulProgress(outputS3Uri: string, overrides: Partial<HyperframesLambdaProgress> = {}) {
  return {
    status: "SUCCEEDED",
    overallProgress: 1,
    framesRendered: 60,
    totalFrames: 60,
    lambdasInvoked: 4,
    costs: {
      accruedSoFarUsd: 0.0123,
      displayCost: "$0.0123",
      breakdown: {
        lambdaUsd: 0.01,
        stepFunctionsUsd: 0.0023,
        s3Estimate: "not-included",
        estimated: false,
      },
    },
    outputFile: { s3Uri: outputS3Uri, bytes: 5 },
    errors: [],
    fatalErrorEncountered: false,
    startedAt: "2026-08-08T00:00:00.000Z",
    endedAt: "2026-08-08T00:00:03.000Z",
    ...overrides,
  } as HyperframesLambdaProgress;
}

type FakeState = {
  deployCalls: number;
  renderInputs: Array<{
    readonly config: HyperframesLambdaRenderConfig;
    readonly executionName: string;
    readonly outputKey: string;
  }>;
  progressCalls: number;
  stopped: string[];
  opened: string[];
};

function fakeClient(options: {
  readonly render?: (input: {
    readonly site: HyperframesLambdaSite;
    readonly config: HyperframesLambdaRenderConfig;
    readonly executionName: string;
    readonly outputKey: string;
  }) => Promise<HyperframesLambdaRender>;
  readonly progress?: (executionArn: string, call: number) => Promise<HyperframesLambdaProgress>;
  readonly output?: Uint8Array;
} = {}): { readonly client: HyperframesAwsLambdaClient; readonly state: FakeState } {
  const state: FakeState = { deployCalls: 0, renderInputs: [], progressCalls: 0, stopped: [], opened: [] };
  const client: HyperframesAwsLambdaClient = {
    async deploySite(input) {
      state.deployCalls += 1;
      const html = await readFile(`${input.projectDir}/index.html`, "utf8");
      assert.match(html, /SVML/u);
      assert.equal(input.bucketName, BUCKET);
      assert.equal(input.region, REGION);
      return {
        siteId: "site-test-content",
        bucketName: BUCKET,
        projectS3Uri: `s3://${BUCKET}/sites/site-test-content/project.tar.gz`,
        bytes: 123,
        uploadedAt: "2026-08-08T00:00:00.000Z",
        uploaded: true,
      };
    },
    async render(input) {
      state.renderInputs.push({
        config: input.config,
        executionName: input.executionName,
        outputKey: input.outputKey,
      });
      if (options.render !== undefined) {
        return await options.render({
          site: input.siteHandle,
          config: input.config,
          executionName: input.executionName,
          outputKey: input.outputKey,
        });
      }
      return {
        renderId: input.executionName,
        executionArn: `${EXECUTION_PREFIX}${input.executionName}`,
        bucketName: input.bucketName,
        stateMachineArn: input.stateMachineArn,
        outputS3Uri: `s3://${input.bucketName}/${input.outputKey}`,
        projectS3Uri: input.siteHandle.projectS3Uri,
        startedAt: "2026-08-08T00:00:00.000Z",
      };
    },
    async progress(input) {
      state.progressCalls += 1;
      if (options.progress !== undefined) return await options.progress(input.executionArn, state.progressCalls);
      return successfulProgress(`s3://${BUCKET}/${state.renderInputs.at(-1)!.outputKey}`);
    },
    async stop(input) {
      state.stopped.push(input.executionArn);
      assert.equal(input.region, REGION);
      assert.match(input.reason, /Narratage cancelled Operation/u);
    },
    async openOutput(input) {
      state.opened.push(input.s3Uri);
      const bytes = options.output ?? new Uint8Array([1, 2, 3, 4, 5]);
      return {
        contentLength: bytes.byteLength,
        chunks: (async function* () {
          yield bytes.slice(0, 2);
          yield bytes.slice(2);
        })(),
      };
    },
  };
  return { client, state };
}

async function endpointFor(
  request: Need,
  client: HyperframesAwsLambdaClient,
): Promise<{ readonly endpoint: AsyncEndpoint; readonly registration: EndpointRegistration }> {
  const registry = new EndpointRegistry();
  const provider = createAwsLambdaHyperframesProvider({
    instance: "hyperframes.aws-lambda.test",
    stateMachineArn: STATE_MACHINE,
    bucketName: BUCKET,
    client,
    pollIntervalMs: 1,
    maxOperationMs: 60_000,
    now: () => 1_000,
  });
  await provider.install(registry);
  const resolution = registry.resolve(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "asynchronous");
  return { endpoint: resolution.registration.endpoint, registration: resolution.registration };
}

function context(request: Need, artifacts: ArtifactStore) {
  return {
    command: { kind: "fulfill-need", id: "command:hyperframes-lambda-test", need: request } as const,
    need: request,
    artifacts,
    credentials: {},
    operation: operation(request),
  };
}

test("the Lambda Endpoint declines frame domains and requirements it cannot preserve", () => {
  assert.equal(supportsAwsLambdaHyperframes(hyperframesVisualRequest(documentFixture(24))), true);
  assert.equal(supportsAwsLambdaHyperframes(hyperframesVisualRequest(documentFixture(30))), true);
  assert.equal(supportsAwsLambdaHyperframes(hyperframesVisualRequest(documentFixture(60))), true);
  assert.equal(supportsAwsLambdaHyperframes(hyperframesVisualRequest(documentFixture(12))), false);
  assert.equal(supportsAwsLambdaHyperframes(hyperframesVisualRequest(documentFixture(30_000, 1_001))), false);
  assert.equal(supportsAwsLambdaHyperframes(canonicalize({
    document: documentFixture(),
    browserGpu: "hardware",
  })), false, "an unsupported hardware requirement must fall through to another Endpoint");
  const artifact = {
    kind: "blob" as const,
    digest: fixtureDigest("lambda-surface-without-verifier"),
    size: 100,
    mediaType: "image/png",
  };
  const withSurface: HyperframesDocument = {
    ...documentFixture(30),
    artifacts: [artifact],
    surfaces: [{
      artifact,
      width: 1,
      height: 1,
      colorSpace: "srgb",
      alphaMode: "straight",
      timing: { kind: "still" },
    }],
    html: `<!doctype html><img data-narratage-surface-artifact="${artifact.digest}" src="narratage-artifact://sha256/${artifact.digest.slice("sha256:".length)}"/>`,
  };
  assert.equal(supportsAwsLambdaHyperframes(hyperframesVisualRequest(withSurface)), false,
    "a deployment without a Surface verifier must fail closed");
});

test("the Runtime adapter refuses a hardware-GPU deployment wish instead of ignoring it", () => {
  const facet = awsLambdaActivation.hostFacets[0]!;
  const implementation = facet.implementation as RuntimeEndpointAdapterImplementation;
  assert.throws(() => implementation.activate({
    dataRoot: "/tmp",
    instance: "hyperframes.lambda.test",
    pool: "hyperframes.lambda.test",
    config: canonicalize({
      stateMachineArn: STATE_MACHINE,
      bucketName: BUCKET,
      browserGpu: "hardware",
    }),
  }), /does not accept browserGpu/u);
});

test("one deterministic submission resumes and streams the exact output into the ArtifactStore", async () => {
  const request = requestNeed();
  const { client, state } = fakeClient();
  const { endpoint, registration } = await endpointFor(request, client);
  assert.equal(registration.scheduling?.resources.find((item) =>
    item.id.startsWith("pool:"))?.maxActive, 2);

  const memory = new MemoryArtifactStore();
  let streamed = 0;
  const artifacts: StreamingArtifactStore = {
    put: (bytes, mediaType) => memory.put(bytes, mediaType),
    get: (digest) => memory.get(digest),
    has: (digest) => memory.has(digest),
    async putStream(chunks, mediaType) {
      const values: number[] = [];
      for await (const chunk of chunks) {
        streamed += 1;
        values.push(...chunk);
      }
      return await memory.put(Uint8Array.from(values), mediaType);
    },
    async open(digest) {
      const bytes = await memory.get(digest);
      if (bytes === undefined) return undefined;
      return (async function* () { yield bytes; })();
    },
  };
  const common = context(request, artifacts);
  const started = await endpoint.start(common);
  assert.equal(started.status, "pending");
  if (started.status !== "pending") return;
  assert.equal(state.deployCalls, 1);
  assert.equal(state.renderInputs.length, 1);
  assert.equal(state.renderInputs[0]!.config.fps, 30);
  assert.equal(state.renderInputs[0]!.config.runtimeCap, "lambda");
  assert.equal(state.renderInputs[0]!.config.maxParallelChunks, 16);
  assert.doesNotThrow(() => validateDistributedRenderConfig(state.renderInputs[0]!.config),
    "the locked SDK must accept the exact configuration sent by the Endpoint");
  assert.equal(state.renderInputs[0]!.executionName,
    `narratage-${common.operation.replace(/[^A-Za-z0-9_-]/gu, "-")}`);

  const completed = await endpoint.poll({
    ...common,
    handle: started.handle,
  });
  assert.equal(completed.status, "completed", JSON.stringify(completed));
  assert.equal(streamed, 2, "the remote object should use the streaming ArtifactStore facet");
  assert.equal(state.opened.length, 1);
  if (completed.status !== "completed" || completed.result.value.kind !== "inline") return;
  verifyRenderedVisual(completed.result.value.value);
  const visual = completed.result.value.value as unknown as RenderedVisual;
  assert.equal(visual.frameCount, 60);
  assert.equal(await artifacts.has(visual.artifact.digest), true);
  assert.deepEqual(await artifacts.get(visual.artifact.digest), new Uint8Array([1, 2, 3, 4, 5]));
});

test("running render progress is projected without exposing the private handle", async () => {
  const request = requestNeed();
  const { client } = fakeClient({
    async progress() {
      return successfulProgress("s3://unused/while-running", {
        status: "RUNNING",
        overallProgress: 0.4,
        framesRendered: 24,
        totalFrames: 60,
        outputFile: null,
        endedAt: null,
      });
    },
  });
  const { endpoint } = await endpointFor(request, client);
  const common = context(request, new MemoryArtifactStore());
  const started = await endpoint.start(common);
  if (started.status !== "pending") return;
  const running = await endpoint.poll({
    ...common,
    handle: started.handle,
  });
  assert.equal(running.status, "pending");
  if (running.status === "pending") {
    assert.deepEqual(running.progress,
      { phase: "rendering", completed: 24, total: 60, unit: "frames" });
  }
});

test("cancellation stops the submitted execution", async () => {
  const request = requestNeed();
  const { client, state } = fakeClient();
  const { endpoint } = await endpointFor(request, client);
  assert.ok(endpoint.cancel);
  const common = context(request, new MemoryArtifactStore());
  const started = await endpoint.start(common);
  assert.equal(started.status, "pending");
  if (started.status !== "pending") return;
  await endpoint.cancel({
    ...common,
    handle: started.handle,
  });
  assert.equal(state.stopped.length, 1);
});
