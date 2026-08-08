import assert from "node:assert/strict";
import test from "node:test";

import { MemoryArtifactStore } from "@narratage/driver-node";
import { canonicalize, digestOf } from "@narratage/protocol";
import type { CanonicalValue } from "@narratage/protocol";
import type { ImmediateEndpointHandler } from "@narratage/endpoint-kit";
import type { JsonInvoker } from "@narratage/transport";

import {
  createAwsLambdaMediaProvider,
  parseMediaLambdaRequest,
  parseMediaLambdaResponse,
} from "@narratage/provider-media-aws-lambda";

const ARN = "arn:aws:lambda:us-east-1:123456789012:function:narratage-media:7";

function recordingInvoker(reply: (request: CanonicalValue) => CanonicalValue) {
  const seen: CanonicalValue[] = [];
  const invoker: JsonInvoker = {
    invoke: async (request) => {
      seen.push(request);
      return reply(request);
    },
  };
  return { invoker, seen };
}

const inspectNeed = {
  contract: "svml.inspect-media-request@1",
  source: { kind: "blob", digest: digestOf("source"), size: 4, mediaType: "video/mp4" },
} as unknown as CanonicalValue;

/** Installs the Provider into a registrar that keeps the handlers, as the Runtime does. */
async function endpointFor(invoker: JsonInvoker, options: { bucket?: string } = {}) {
  const provider = createAwsLambdaMediaProvider({
    functionArn: ARN,
    bucket: options.bucket ?? "team-artifacts",
    prefix: "svml",
    invoker,
  });
  const handlers = new Map<string, ImmediateEndpointHandler>();
  await provider.install({
    registerImmediateEndpoint: (
      _id: string,
      capability: { name: string },
      _returns: unknown,
      handler: ImmediateEndpointHandler,
    ) => {
      handlers.set(capability.name, handler);
    },
    registerRecoverableEndpoint: () => {
      throw new Error("the AWS media Provider registers no recoverable endpoint");
    },
  } as never);
  const handler = handlers.get("inspect-media");
  assert.ok(handler, "the Provider offers media inspection");
  return { handler };
}

test("an unqualified function ARN is refused, because two Builds could then run different code", () => {
  assert.throws(
    () => createAwsLambdaMediaProvider({
      functionArn: "arn:aws:lambda:us-east-1:123456789012:function:narratage-media",
      bucket: "team-artifacts",
    }),
    /must name a version or alias/u,
  );
  assert.throws(
    () => createAwsLambdaMediaProvider({ functionArn: ARN, bucket: "team-artifacts", region: "eu-west-1" }),
    /differs from the region in its ARN/u,
  );
});

test("the Provider sends the Need verbatim with the bucket the function should use", async () => {
  const store = new MemoryArtifactStore();
  const artifact = await store.put(new TextEncoder().encode("out!"), "video/mp4");
  const { invoker, seen } = recordingInvoker(() => canonicalize({
    contract: "svml.media-lambda-response@1",
    operation: "inspect",
    ok: true,
    value: { contract: "svml.media-inspection@1", artifact },
    metadata: { provider: "media.aws-lambda" },
  } as unknown as CanonicalValue));

  const capability = await endpointFor(invoker);
  const outcome = await capability.handler({
    need: { constraints: inspectNeed },
    artifacts: store,
    credentials: {},
  } as never);

  const request = parseMediaLambdaRequest(seen[0]);
  assert.equal(request.operation, "inspect");
  assert.deepEqual(request.artifacts, { bucket: "team-artifacts", prefix: "svml" });
  assert.deepEqual(request.constraints, canonicalize(inspectNeed));
  assert.equal((outcome as { conformance: string }).conformance, "exact");
});

test("a Provider aimed at another bucket fails naming the Artifact, not later with an unreadable Record", async () => {
  const store = new MemoryArtifactStore();
  const stranger = digestOf("an artifact this Build's store never received");
  const { invoker } = recordingInvoker(() => canonicalize({
    contract: "svml.media-lambda-response@1",
    operation: "inspect",
    ok: true,
    value: {
      contract: "svml.media-inspection@1",
      artifact: { kind: "blob", digest: stranger, size: 1, mediaType: "video/mp4" },
    },
    metadata: {},
  } as unknown as CanonicalValue));

  await assert.rejects(
    async () => await (await endpointFor(invoker)).handler({
      need: { constraints: inspectNeed }, artifacts: store, credentials: {},
    } as never),
    (error: Error) => {
      assert.match(error.message, new RegExp(stranger, "u"));
      assert.match(error.message, /bucket and the ArtifactStore's bucket are probably not the same/u);
      return true;
    },
  );
});

test("a typed failure reaches the Build with its code, since the transport withholds the payload", async () => {
  const { invoker } = recordingInvoker(() => canonicalize({
    contract: "svml.media-lambda-response@1",
    operation: "inspect",
    ok: false,
    code: "MEDIA_SOURCE_UNAVAILABLE",
    message: "source sha256:… is absent from bucket team-artifacts",
  } as unknown as CanonicalValue));

  await assert.rejects(
    async () => await (await endpointFor(invoker)).handler({
      need: { constraints: inspectNeed }, artifacts: new MemoryArtifactStore(), credentials: {},
    } as never),
    /MEDIA_SOURCE_UNAVAILABLE.*absent from bucket/su,
  );
});

test("a reply that is not this contract is refused rather than half-read", () => {
  assert.throws(() => parseMediaLambdaResponse({ contract: "svml.media-lambda-response@0", operation: "inspect" }),
    /contract must be svml\.media-lambda-response@1/u);
  assert.throws(() => parseMediaLambdaResponse({ contract: "svml.media-lambda-response@1", operation: "transcode" }),
    /operation must be one of/u);
  assert.throws(() => parseMediaLambdaRequest({
    contract: "svml.media-lambda-request@1", operation: "mux", artifacts: {}, constraints: {},
  }), /artifacts\.bucket must be a non-empty string/u);
});
