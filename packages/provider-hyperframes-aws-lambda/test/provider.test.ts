import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { validateDistributedRenderConfig } from "@hyperframes/aws-lambda/sdk";
import { EndpointRegistry, MemoryArtifactStore } from "@narratage/driver-node";
import type { EndpointRegistration } from "@narratage/driver-node";
import type { RecoverableEndpoint } from "@narratage/endpoint-kit";
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
import { canonicalize, digestOf } from "@narratage/protocol";
import type { CanonicalValue, Need } from "@narratage/protocol";
import type { RuntimeEndpointAdapterImplementation } from "@narratage/runtime-adapter";
import {
  hyperframesVisualRequest,
  renderHyperframesCapabilities,
} from "@narratage/render-hyperframes";
import type { ArtifactStore, StreamingArtifactStore } from "@narratage/runtime";
import { sealOperationIdentity } from "@narratage/runtime";

import { svmlPackage as awsLambdaActivation } from "../src/activation.js";

const ACCOUNT = "123456789012";
const REGION = "us-east-1";
const BUCKET = "narratage-render-test";
const STATE_MACHINE = `arn:aws:states:${REGION}:${ACCOUNT}:stateMachine:narratage-hyperframes`;
const EXECUTION_PREFIX = `arn:aws:states:${REGION}:${ACCOUNT}:execution:narratage-hyperframes:`;
const RENDERER_IMPLEMENTATION = digestOf("hyperframes-lambda:test-renderer-deployment");

function documentFixture(fps = 30, denominator = 1): HyperframesDocument {
  return {
    contract: "svml.hyperframes-document@1",
    visualIr: "svml.visual-ir@1",
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
    requestedBy: "derivation:hyperframes-lambda-test",
    result: "record:hyperframes-lambda-test",
    requestDigest: digestOf({
      capability: renderHyperframesCapabilities.renderVisual,
      returns: mediaTypes.renderedVisual,
      constraints,
    }),
  };
}

function operation(request: Need) {
  return sealOperationIdentity({
    build: "build:hyperframes-lambda-test",
    command: "command:hyperframes-lambda-test",
    endpoint: "hyperframes.aws-lambda.test",
    authority: "hyperframes.aws-lambda.test",
    route: "fixture.render",
    runtimeClosure: digestOf("hyperframes-lambda:test-runtime"),
    attempt: 1,
  });
}

function outputKey(operationId: string): string {
  return `renders/narratage/${operationId.slice("sha256:".length)}/visual.mp4`;
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
      const name = input.executionArn.slice(EXECUTION_PREFIX.length);
      return successfulProgress(`s3://${BUCKET}/${outputKey(`sha256:${name.slice("narratage-".length)}`)}`);
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
): Promise<{ readonly endpoint: RecoverableEndpoint; readonly registration: EndpointRegistration }> {
  const registry = new EndpointRegistry();
  const provider = createAwsLambdaHyperframesProvider({
    instance: "hyperframes.aws-lambda.test",
    stateMachineArn: STATE_MACHINE,
    bucketName: BUCKET,
    rendererImplementationDigest: RENDERER_IMPLEMENTATION,
    client,
    clientImplementationDigest: digestOf("hyperframes-lambda:test-client"),
    pollIntervalMs: 1,
    maxOperationMs: 60_000,
    maxPollFailures: 2,
    now: () => 1_000,
  });
  await provider.install(registry);
  const resolution = registry.resolve(request);
  assert.equal(resolution.status, "resolved");
  assert.equal(resolution.registration.kind, "recoverable");
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
    contract: "svml.hyperframes-visual-render-request@1",
    document: documentFixture(),
    browserGpu: "hardware",
  })), false, "an unsupported hardware requirement must fall through to another Endpoint");
  const artifact = {
    kind: "blob" as const,
    digest: digestOf("lambda-surface-without-verifier"),
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
    html: `<!doctype html><img data-svml-surface-artifact="${artifact.digest}" src="svml-artifact://sha256/${artifact.digest.slice("sha256:".length)}"/>`,
  };
  assert.equal(supportsAwsLambdaHyperframes(hyperframesVisualRequest(withSurface)), false,
    "a deployment without a Surface verifier must fail closed");
});

test("the Runtime adapter refuses a hardware-GPU deployment wish instead of ignoring it", () => {
  const facet = awsLambdaActivation.hostFacets[0]!;
  const implementation = facet.implementation as RuntimeEndpointAdapterImplementation;
  assert.throws(() => implementation.activate({
    root: "/tmp",
    instance: "hyperframes.lambda.test",
    authority: "hyperframes.lambda.test",
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
  assert.equal(registration.retry?.maxAttempts, 1);
  assert.equal(registration.scheduling?.resources.find((item) =>
    item.id.startsWith("authority:"))?.maxActive, 2);

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
  assert.equal(state.deployCalls, 1);
  assert.equal(state.renderInputs.length, 1);
  assert.equal(state.renderInputs[0]!.config.fps, 30);
  assert.equal(state.renderInputs[0]!.config.runtimeCap, "lambda");
  assert.equal(state.renderInputs[0]!.config.maxParallelChunks, 16);
  assert.doesNotThrow(() => validateDistributedRenderConfig(state.renderInputs[0]!.config),
    "the locked SDK must accept the exact configuration sent by the Endpoint");
  assert.equal(state.renderInputs[0]!.executionName,
    `narratage-${common.operation.id.slice("sha256:".length)}`);

  const completed = await endpoint.resume({
    ...common,
    checkpoint: started.status === "pending" ? started.checkpoint : undefined,
  });
  assert.equal(completed.status, "completed");
  assert.equal(streamed, 2, "the remote object should use the streaming ArtifactStore facet");
  assert.equal(state.opened.length, 1);
  if (completed.status !== "completed" || completed.result.value.kind !== "inline") return;
  verifyRenderedVisual(completed.result.value.value);
  const visual = completed.result.value.value as unknown as RenderedVisual;
  assert.equal(visual.frameCount, 60);
  assert.equal(await artifacts.has(visual.artifact.digest), true);
  assert.deepEqual(await artifacts.get(visual.artifact.digest), new Uint8Array([1, 2, 3, 4, 5]));
});

test("an ambiguous StartExecution is recovered by the same name without redeploying the site", async () => {
  let renderCalls = 0;
  const request = requestNeed();
  const { client, state } = fakeClient({
    async render() {
      renderCalls += 1;
      if (renderCalls === 1) throw new TypeError("socket closed after request write");
      const error = new Error("execution already exists");
      error.name = "ExecutionAlreadyExists";
      throw error;
    },
    async progress(_executionArn, call) {
      if (call === 1) {
        const error = new Error("not visible yet");
        error.name = "ExecutionDoesNotExist";
        throw error;
      }
      throw new Error("test should stop after the duplicate is confirmed");
    },
  });
  const { endpoint } = await endpointFor(request, client);
  const common = context(request, new MemoryArtifactStore());
  const uncertain = await endpoint.start(common);
  assert.equal(uncertain.status, "pending");
  const confirmed = await endpoint.resume({
    ...common,
    checkpoint: uncertain.status === "pending" ? uncertain.checkpoint : undefined,
  });
  assert.equal(confirmed.status, "pending");
  assert.equal(state.deployCalls, 1, "the immutable staged site belongs in the checkpoint");
  assert.equal(state.renderInputs.length, 2);
  assert.equal(state.renderInputs[0]!.executionName, state.renderInputs[1]!.executionName);
  assert.deepEqual(state.renderInputs[0]!.config, state.renderInputs[1]!.config);
  if (confirmed.status === "pending") {
    assert.equal((confirmed.checkpoint as Record<string, unknown>).submission, "confirmed");
  }
});

test("running render progress is projected without exposing the recovery checkpoint", async () => {
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
  const running = await endpoint.resume({
    ...common,
    checkpoint: started.status === "pending" ? started.checkpoint : undefined,
  });
  assert.equal(running.status, "pending");
  if (running.status === "pending") {
    assert.deepEqual(running.progress,
      { phase: "rendering", completed: 24, total: 60, unit: "frames" });
  }
});

test("a successful execution with another frame domain is refused before its bytes are opened", async () => {
  const request = requestNeed();
  let outputUri = "";
  const { client, state } = fakeClient({
    async render(input) {
      outputUri = `s3://${BUCKET}/${input.outputKey}`;
      return {
        renderId: input.executionName,
        executionArn: `${EXECUTION_PREFIX}${input.executionName}`,
        bucketName: BUCKET,
        stateMachineArn: STATE_MACHINE,
        outputS3Uri: outputUri,
        projectS3Uri: input.site.projectS3Uri,
        startedAt: "2026-08-08T00:00:00.000Z",
      };
    },
    async progress() {
      return successfulProgress(outputUri, { totalFrames: 61, framesRendered: 61 });
    },
  });
  const { endpoint } = await endpointFor(request, client);
  const common = context(request, new MemoryArtifactStore());
  const started = await endpoint.start(common);
  const failed = await endpoint.resume({
    ...common,
    checkpoint: started.status === "pending" ? started.checkpoint : undefined,
  });
  assert.equal(failed.status, "failed");
  if (failed.status === "failed") {
    assert.equal(failed.failure.code, "HYPERFRAMES_PROGRESS_INVALID");
    assert.equal(failed.failure.retryable, false);
  }
  assert.equal(state.opened.length, 0);
});

test("a handle that names another execution is not downgraded to an ambiguous submission", async () => {
  const request = requestNeed();
  const { client } = fakeClient({
    async render(input) {
      return {
        renderId: "another-render",
        executionArn: `${EXECUTION_PREFIX}another-render`,
        bucketName: BUCKET,
        stateMachineArn: STATE_MACHINE,
        outputS3Uri: `s3://${BUCKET}/${input.outputKey}`,
        projectS3Uri: input.site.projectS3Uri,
        startedAt: "2026-08-08T00:00:00.000Z",
      };
    },
  });
  const { endpoint } = await endpointFor(request, client);
  const failed = await endpoint.start(context(request, new MemoryArtifactStore()));
  assert.equal(failed.status, "failed");
  if (failed.status === "failed") {
    assert.equal(failed.failure.code, "HYPERFRAMES_SUBMISSION_IDENTITY_MISMATCH");
    assert.equal(failed.failure.retryable, false);
  }
});

test("a client-side config rejection is terminal, not an ambiguous remote submission", async () => {
  const request = requestNeed();
  const { client } = fakeClient({
    async render() {
      const error = new Error("invalid distributed config");
      error.name = "InvalidConfigError";
      throw error;
    },
  });
  const { endpoint } = await endpointFor(request, client);
  const failed = await endpoint.start(context(request, new MemoryArtifactStore()));
  assert.equal(failed.status, "failed");
  if (failed.status === "failed") {
    assert.equal(failed.failure.code, "HYPERFRAMES_SUBMISSION_REJECTED");
    assert.equal(failed.failure.retryable, false);
  }
});

test("cancellation stops the deterministic execution even before a checkpoint exists", async () => {
  const request = requestNeed();
  const { client, state } = fakeClient();
  const { endpoint } = await endpointFor(request, client);
  assert.ok(endpoint.cancel);
  const common = context(request, new MemoryArtifactStore());
  await endpoint.cancel({ ...common, checkpoint: undefined });
  assert.deepEqual(state.stopped, [
    `${EXECUTION_PREFIX}narratage-${common.operation.id.slice("sha256:".length)}`,
  ]);
  const started = await endpoint.start(common);
  assert.equal(started.status, "pending");
  if (started.status !== "pending") return;
  await assert.rejects(async () => await endpoint.cancel!({
    ...common,
    checkpoint: canonicalize({
      ...(started.checkpoint as Record<string, CanonicalValue>),
      executionArn: `${EXECUTION_PREFIX}someone-elses-render`,
    }),
  }), /checkpoint execution ARN differs/u);
  assert.equal(state.stopped.length, 1, "an untrusted checkpoint cannot redirect StopExecution");
});

test("the deployment identity is validated before any AWS client is constructed", () => {
  assert.throws(() => createAwsLambdaHyperframesProvider({
    stateMachineArn: `${STATE_MACHINE}:mutable-alias`,
    bucketName: BUCKET,
    rendererImplementationDigest: RENDERER_IMPLEMENTATION,
  }), /unqualified AWS Step Functions state-machine ARN/u);
  assert.throws(() => createAwsLambdaHyperframesProvider({
    stateMachineArn: STATE_MACHINE,
    bucketName: BUCKET,
    rendererImplementationDigest: RENDERER_IMPLEMENTATION,
    region: "eu-west-1",
  }), /differs from state machine region/u);
  assert.throws(() => createAwsLambdaHyperframesProvider({
    stateMachineArn: STATE_MACHINE,
    bucketName: BUCKET,
    rendererImplementationDigest: RENDERER_IMPLEMENTATION,
    client: fakeClient().client,
  }), /requires clientImplementationDigest/u);
  assert.throws(() => createAwsLambdaHyperframesProvider({
    stateMachineArn: STATE_MACHINE,
    bucketName: "192.168.0.1",
    rendererImplementationDigest: RENDERER_IMPLEMENTATION,
  }), /bucketName is invalid/u);
  assert.doesNotThrow(() => createAwsLambdaHyperframesProvider({
    stateMachineArn: "arn:aws-us-gov:states:us-gov-west-1:123456789012:stateMachine:narratage-hyperframes",
    bucketName: BUCKET,
    rendererImplementationDigest: RENDERER_IMPLEMENTATION,
    client: fakeClient().client,
    clientImplementationDigest: digestOf("hyperframes-lambda:test-gov-client"),
  }));
});
