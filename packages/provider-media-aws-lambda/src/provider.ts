import { mediaTypes } from "@hypit/media";
import { artifactTypes } from "@hypit/artifact";
import { mediaPipelineCapabilities } from "@hypit/media-pipeline";
import { canonicalize } from "@hypit/protocol";
import type { BlobRef, CanonicalValue } from "@hypit/protocol";
import { speechTypes } from "@hypit/speech";
import { defineEndpointPackage } from "@hypit/endpoint-kit";
import type { EndpointFulfillment, EndpointInvocationContext } from "@hypit/endpoint-kit";
import { AwsLambdaJsonInvoker } from "@hypit/transport-aws-lambda";
import type { JsonInvoker } from "@hypit/transport-aws-lambda";

import {
  MEDIA_LAMBDA_REQUEST,
  parseMediaLambdaResponse,
  sealMediaLambdaRequest,
} from "./contract.js";
import type { MediaLambdaOperation } from "./contract.js";

export const awsLambdaMediaProviderModuleRef = {
  name: "@hypit/provider-media-aws-lambda",
  version: "1",
} as const;

/** `arn:aws:lambda:<region>:<account>:function:<name>:<version|alias>` */
const QUALIFIED_ARN =
  /^arn:aws:lambda:([a-z0-9-]+):\d{12}:function:[A-Za-z0-9-_]+:(\$LATEST|[A-Za-z0-9-_]+)$/u;

export type CreateAwsLambdaMediaProviderOptions = {
  readonly instance?: string;
  readonly pool?: string;
  /** Must name a version or alias. See the assertion below for why. */
  readonly functionArn: string;
  readonly bucket: string;
  readonly prefix?: string;
  readonly region?: string;
  readonly defaultConcurrency?: number;
  /** Injection point for tests and specially configured trusted AWS clients. */
  readonly invoker?: JsonInvoker;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isBlobRef(value: unknown): value is BlobRef {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && (value as Record<string, unknown>).kind === "blob"
    && typeof (value as Record<string, unknown>).digest === "string";
}

/** Every Artifact the function claims to have written, at any depth of the result. */
function producedArtifacts(value: unknown, found: BlobRef[] = []): readonly BlobRef[] {
  if (isBlobRef(value)) found.push(value);
  else if (Array.isArray(value)) for (const item of value) producedArtifacts(item, found);
  else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) producedArtifacts(item, found);
  }
  return found;
}

export function createAwsLambdaMediaProvider(config: CreateAwsLambdaMediaProviderOptions) {
  // A function name without a version is whatever was deployed most recently.
  // Two Builds of one Run Source could then be executed by different code while
  // recording the same Endpoint identity, which is the one thing a BuildPlan
  // must never allow.
  const arn = QUALIFIED_ARN.exec(config.functionArn);
  assert(arn !== null,
    `Lambda functionArn must name a version or alias, as arn:aws:lambda:<region>:<account>:function:<name>:<version>; got ${config.functionArn}`);
  const region = config.region ?? arn[1]!;
  assert(region === arn[1],
    `Lambda region ${region} differs from the region in its ARN (${arn[1]})`);
  assert(config.bucket.trim().length > 0, "Lambda media Provider requires the ArtifactStore bucket");

  const configuration = {
    functionArn: config.functionArn,
    region,
    bucket: config.bucket,
    ...(config.prefix === undefined || config.prefix.length === 0 ? {} : { prefix: config.prefix }),
  };
  const invoker = config.invoker ?? new AwsLambdaJsonInvoker({
    functionName: config.functionArn,
    region,
  });

  const operation = (name: MediaLambdaOperation) =>
    async (context: EndpointInvocationContext): Promise<EndpointFulfillment> => {
      const reply = parseMediaLambdaResponse(await invoker.invoke(sealMediaLambdaRequest({
        contract: MEDIA_LAMBDA_REQUEST,
        operation: name,
        artifacts: {
          bucket: config.bucket,
          ...(config.prefix === undefined || config.prefix.length === 0 ? {} : { prefix: config.prefix }),
        },
        constraints: context.need.constraints,
      })));
      if (!reply.ok) throw new Error(`AWS media ${name} failed (${reply.code}): ${reply.message}`);

      // The function wrote its results straight into the bucket, so nothing was
      // uploaded here. Reading each one back through this Build's own
      // ArtifactStore is what proves the two were ever pointed at the same
      // place: a Provider configured against a different bucket fails here,
      // naming the Artifact, instead of yielding a Record that cannot be read.
      for (const artifact of producedArtifacts(reply.value)) {
        assert(await context.artifacts.has(artifact.digest),
          `AWS media ${name} reported Artifact ${artifact.digest}, which this Build's ArtifactStore cannot read`
          + ` — the Provider's bucket and the ArtifactStore's bucket are probably not the same`);
      }
      return { value: reply.value };
    };

  return defineEndpointPackage({
    module: awsLambdaMediaProviderModuleRef,
    facet: "media",
    instance: config.instance ?? "media.aws-lambda",
    pool: config.pool ?? config.instance ?? "media.aws-lambda",
    defaultConcurrency: config.defaultConcurrency ?? 8,
    capabilities: [
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.inspect,
        returns: mediaTypes.inspection,
        handler: operation("inspect"),
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.normalize,
        returns: mediaTypes.synchronized,
        handler: operation("normalize"),
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.transform,
        returns: artifactTypes.blob,
        handler: operation("transform"),
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.extractAudio,
        returns: artifactTypes.blob,
        handler: operation("extract-audio"),
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.extractFrame,
        returns: artifactTypes.blob,
        handler: operation("extract-frame"),
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.projectSpeechEvidenceAudio,
        returns: speechTypes.evidenceAudio,
        handler: operation("project-speech-evidence-audio"),
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.renderAudio,
        returns: mediaTypes.timelineAudio,
        handler: operation("render-audio"),
      },
      {
        lifecycle: "immediate" as const,
        capability: mediaPipelineCapabilities.mux,
        returns: mediaTypes.muxed,
        handler: operation("mux"),
      },
    ],
  });
}
