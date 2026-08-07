import { createS3ArtifactStorePackage } from "@svml/artifact-store-s3";
import {
  RuntimeConfigRegistry,
  createRuntimeFromConfig,
} from "@svml/local";
import type { RuntimeConfigFactoryContext } from "@svml/local";
import { createGoogleVertexCaptionProvider } from "@svml/provider-google-vertex";
import { createLocalHyperframesProvider } from "@svml/provider-hyperframes-local";
import { createKieProvider } from "@svml/provider-kie";
import { createLocalMediaProvider } from "@svml/provider-media-local";
import { createLocalWhisperXProvider } from "@svml/provider-whisperx-local";
import type { CanonicalValue } from "@svml/protocol";
import { credentialRef } from "@svml/runtime";

function object(value: CanonicalValue, subject: string): Record<string, CanonicalValue> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${subject} config must be an object`);
  return value as Record<string, CanonicalValue>;
}

function exact(value: Record<string, CanonicalValue>, allowed: readonly string[], subject: string): void {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${subject} config does not accept ${unknown[0]}`);
}

function string(value: CanonicalValue | undefined, subject: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${subject} must be a non-empty string`);
  return value;
}

function number(value: CanonicalValue | undefined, subject: string): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error(`${subject} must be a positive integer`);
  return value;
}

function boolean(value: CanonicalValue | undefined, subject: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new Error(`${subject} must be a boolean`);
  return value;
}

function common(context: RuntimeConfigFactoryContext): { readonly instance: string; readonly lane?: string } {
  return { instance: context.instance, ...(context.lane === undefined ? {} : { lane: context.lane }) };
}

export function createVideoRuntimeConfigRegistry(): RuntimeConfigRegistry {
  const registry = new RuntimeConfigRegistry();
  registry.registerEndpoint("@svml/provider-kie", (context) => {
    const config = object(context.config, "KIE");
    exact(config, [
      "apiBaseUrl", "uploadBaseUrl", "apiKeyEnv", "defaultConcurrency", "pollIntervalMs",
      "submissionIntervalMs", "requestTimeoutMs", "maxOperationMs", "maxArtifactBytes",
    ], "KIE");
    const apiKeyEnv = string(config.apiKeyEnv, "KIE apiKeyEnv");
    return createKieProvider({
      ...common(context),
      ...(string(config.apiBaseUrl, "KIE apiBaseUrl") === undefined ? {} : { apiBaseUrl: config.apiBaseUrl as string }),
      ...(string(config.uploadBaseUrl, "KIE uploadBaseUrl") === undefined ? {} : { uploadBaseUrl: config.uploadBaseUrl as string }),
      ...(apiKeyEnv === undefined ? {} : { apiKey: credentialRef("env", apiKeyEnv) }),
      ...(number(config.defaultConcurrency, "KIE defaultConcurrency") === undefined ? {} : { defaultConcurrency: config.defaultConcurrency as number }),
      ...(number(config.pollIntervalMs, "KIE pollIntervalMs") === undefined ? {} : { pollIntervalMs: config.pollIntervalMs as number }),
      ...(number(config.submissionIntervalMs, "KIE submissionIntervalMs") === undefined ? {} : { submissionIntervalMs: config.submissionIntervalMs as number }),
      ...(number(config.requestTimeoutMs, "KIE requestTimeoutMs") === undefined ? {} : { requestTimeoutMs: config.requestTimeoutMs as number }),
      ...(number(config.maxOperationMs, "KIE maxOperationMs") === undefined ? {} : { maxOperationMs: config.maxOperationMs as number }),
      ...(number(config.maxArtifactBytes, "KIE maxArtifactBytes") === undefined ? {} : { maxArtifactBytes: config.maxArtifactBytes as number }),
    });
  });
  registry.registerEndpoint("@svml/provider-media-local", (context) => {
    const config = object(context.config, "local media");
    exact(config, ["ffmpegPath", "ffprobePath", "defaultConcurrency", "processTimeoutMs", "maxProbeOutputBytes"], "local media");
    return createLocalMediaProvider({
      ...common(context),
      ...(string(config.ffmpegPath, "media ffmpegPath") === undefined ? {} : { ffmpegPath: config.ffmpegPath as string }),
      ...(string(config.ffprobePath, "media ffprobePath") === undefined ? {} : { ffprobePath: config.ffprobePath as string }),
      ...(number(config.defaultConcurrency, "media defaultConcurrency") === undefined ? {} : { defaultConcurrency: config.defaultConcurrency as number }),
      ...(number(config.processTimeoutMs, "media processTimeoutMs") === undefined ? {} : { processTimeoutMs: config.processTimeoutMs as number }),
      ...(number(config.maxProbeOutputBytes, "media maxProbeOutputBytes") === undefined ? {} : { maxProbeOutputBytes: config.maxProbeOutputBytes as number }),
    });
  });
  registry.registerEndpoint("@svml/provider-whisperx-local", (context) => {
    const config = object(context.config, "local WhisperX");
    exact(config, [
      "baseUrl", "expectedModel", "expectedDevice", "expectedCompute", "expectedBatchSize",
      "expectedServiceVersion", "expectedWhisperXVersion", "expectedPunktTabDigest",
      "defaultConcurrency", "requestTimeoutMs", "maxResponseBytes",
    ], "local WhisperX");
    return createLocalWhisperXProvider({
      ...common(context),
      ...(string(config.baseUrl, "WhisperX baseUrl") === undefined ? {} : { baseUrl: config.baseUrl as string }),
      ...(string(config.expectedModel, "WhisperX expectedModel") === undefined ? {} : { expectedModel: config.expectedModel as string }),
      ...(string(config.expectedDevice, "WhisperX expectedDevice") === undefined ? {} : { expectedDevice: config.expectedDevice as string }),
      ...(string(config.expectedCompute, "WhisperX expectedCompute") === undefined ? {} : { expectedCompute: config.expectedCompute as string }),
      ...(number(config.expectedBatchSize, "WhisperX expectedBatchSize") === undefined ? {} : { expectedBatchSize: config.expectedBatchSize as number }),
      ...(string(config.expectedServiceVersion, "WhisperX expectedServiceVersion") === undefined ? {} : { expectedServiceVersion: config.expectedServiceVersion as string }),
      ...(string(config.expectedWhisperXVersion, "WhisperX expectedWhisperXVersion") === undefined ? {} : { expectedWhisperXVersion: config.expectedWhisperXVersion as string }),
      ...(string(config.expectedPunktTabDigest, "WhisperX expectedPunktTabDigest") === undefined ? {} : { expectedPunktTabDigest: config.expectedPunktTabDigest as string }),
      ...(number(config.defaultConcurrency, "WhisperX defaultConcurrency") === undefined ? {} : { defaultConcurrency: config.defaultConcurrency as number }),
      ...(number(config.requestTimeoutMs, "WhisperX requestTimeoutMs") === undefined ? {} : { requestTimeoutMs: config.requestTimeoutMs as number }),
      ...(number(config.maxResponseBytes, "WhisperX maxResponseBytes") === undefined ? {} : { maxResponseBytes: config.maxResponseBytes as number }),
    });
  });
  registry.registerEndpoint("@svml/provider-hyperframes-local", (context) => {
    const config = object(context.config, "local HyperFrames");
    exact(config, [
      "nodePath", "hyperframesCliPath", "ffprobePath", "workers", "quality", "browserGpu",
      "defaultConcurrency", "processTimeoutMs", "maxProcessOutputBytes", "maxRenderedBytes",
    ], "local HyperFrames");
    const workers = config.workers;
    if (workers !== undefined && workers !== "auto") number(workers, "HyperFrames workers");
    const quality = string(config.quality, "HyperFrames quality");
    if (quality !== undefined && quality !== "draft" && quality !== "standard" && quality !== "high") throw new Error("HyperFrames quality is invalid");
    const browserGpu = string(config.browserGpu, "HyperFrames browserGpu");
    if (browserGpu !== undefined && browserGpu !== "auto" && browserGpu !== "software" && browserGpu !== "hardware") throw new Error("HyperFrames browserGpu is invalid");
    return createLocalHyperframesProvider({
      ...common(context),
      ...(string(config.nodePath, "HyperFrames nodePath") === undefined ? {} : { nodePath: config.nodePath as string }),
      ...(string(config.hyperframesCliPath, "HyperFrames hyperframesCliPath") === undefined ? {} : { hyperframesCliPath: config.hyperframesCliPath as string }),
      ...(string(config.ffprobePath, "HyperFrames ffprobePath") === undefined ? {} : { ffprobePath: config.ffprobePath as string }),
      ...(workers === undefined ? {} : { workers: workers as number | "auto" }),
      ...(quality === undefined ? {} : { quality }),
      ...(browserGpu === undefined ? {} : { browserGpu }),
      ...(number(config.defaultConcurrency, "HyperFrames defaultConcurrency") === undefined ? {} : { defaultConcurrency: config.defaultConcurrency as number }),
      ...(number(config.processTimeoutMs, "HyperFrames processTimeoutMs") === undefined ? {} : { processTimeoutMs: config.processTimeoutMs as number }),
      ...(number(config.maxProcessOutputBytes, "HyperFrames maxProcessOutputBytes") === undefined ? {} : { maxProcessOutputBytes: config.maxProcessOutputBytes as number }),
      ...(number(config.maxRenderedBytes, "HyperFrames maxRenderedBytes") === undefined ? {} : { maxRenderedBytes: config.maxRenderedBytes as number }),
    });
  });
  registry.registerEndpoint("@svml/provider-google-vertex", (context) => {
    const config = object(context.config, "Google Vertex");
    exact(config, ["project", "projectEnv", "location", "credentialsEnv", "defaultConcurrency", "requestTimeoutMs", "maxResponseBytes"], "Google Vertex");
    const projectValue = string(config.project, "Google Vertex project");
    const projectEnv = string(config.projectEnv, "Google Vertex projectEnv");
    if (projectValue !== undefined && projectEnv !== undefined) throw new Error("Google Vertex accepts project or projectEnv, not both");
    const project = projectValue ?? (projectEnv === undefined ? undefined : process.env[projectEnv]?.trim());
    if (project === undefined || project.length === 0) throw new Error("Google Vertex project is required");
    const credentialsEnv = string(config.credentialsEnv, "Google Vertex credentialsEnv");
    return createGoogleVertexCaptionProvider({
      project,
      ...common(context),
      ...(string(config.location, "Google Vertex location") === undefined ? {} : { location: config.location as string }),
      ...(credentialsEnv === undefined ? {} : { credentialsJson: credentialRef("env", credentialsEnv) }),
      ...(number(config.defaultConcurrency, "Google Vertex defaultConcurrency") === undefined ? {} : { defaultConcurrency: config.defaultConcurrency as number }),
      ...(number(config.requestTimeoutMs, "Google Vertex requestTimeoutMs") === undefined ? {} : { requestTimeoutMs: config.requestTimeoutMs as number }),
      ...(number(config.maxResponseBytes, "Google Vertex maxResponseBytes") === undefined ? {} : { maxResponseBytes: config.maxResponseBytes as number }),
    });
  });
  registry.registerService("@svml/artifact-store-s3", (context) => {
    const config = object(context.config, "S3 ArtifactStore");
    exact(config, ["bucket", "prefix", "expectedBucketOwner", "region", "endpoint", "forcePathStyle"], "S3 ArtifactStore");
    const bucket = string(config.bucket, "S3 bucket");
    if (bucket === undefined) throw new Error("S3 bucket is required");
    return createS3ArtifactStorePackage({
      instance: context.instance,
      bucket,
      ...(string(config.prefix, "S3 prefix") === undefined ? {} : { prefix: config.prefix as string }),
      ...(string(config.expectedBucketOwner, "S3 expectedBucketOwner") === undefined ? {} : { expectedBucketOwner: config.expectedBucketOwner as string }),
      ...(string(config.region, "S3 region") === undefined ? {} : { region: config.region as string }),
      ...(string(config.endpoint, "S3 endpoint") === undefined ? {} : { endpoint: config.endpoint as string }),
      ...(boolean(config.forcePathStyle, "S3 forcePathStyle") === undefined ? {} : { forcePathStyle: config.forcePathStyle as boolean }),
    });
  });
  return registry;
}

export async function createVideoRuntimeFromConfig(path: string) {
  return await createRuntimeFromConfig(path, {
    registry: createVideoRuntimeConfigRegistry(),
  });
}
