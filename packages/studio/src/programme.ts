import type { ArtifactAttachment } from "@hypit/workspace";
import type { BlobRef, ResourceId, StoredValue } from "@hypit/protocol";
import { sameType } from "@hypit/protocol";
import type { Composition } from "@hypit/composition";
import { compositionTypes } from "@hypit/composition";
import {
  projectSemanticProgramSpace,
  semanticAnchorFrames,
  semanticTrackSpans,
} from "@hypit/semantic-track";
import type { SemanticTrack } from "@hypit/semantic-track";
import { semanticTrackTypes } from "@hypit/semantic-track";
import type { ProgramSpace } from "@hypit/program-space";
import type { StudioResolvedTrack, StudioTemporalBinding } from "@hypit/studio-adapter";

import type { CompiledSource, ServedFile } from "./compile.js";
import type { StudioDomain } from "./domain.js";
import type { EndpointRegistry } from "@hypit/driver-node";

import { executeDeterministic, MemoryResourceStore } from "./execute.js";
import type { RunPlan } from "./run.js";
import type { StudioViewRequirement } from "./studio-preflight.js";
import { studioSurfacePreview } from "./surface-preview.js";
import { executedTemporalBindings } from "./temporal-graph.js";

function playable(type: import("@hypit/protocol").TypeRef): boolean {
  return sameType(type, compositionTypes.visualTrack) || sameType(type, compositionTypes.audioTrack);
}

export type BuiltTrack = StudioResolvedTrack;

export type Preview = {
  readonly source: CompiledSource;
  readonly tracks: readonly BuiltTrack[];
  /** Resolved Companion realizations keyed by exact graph output ref. */
  readonly values: ReadonlyMap<string, unknown>;
  readonly temporalBindings: ReadonlyMap<string, readonly StudioTemporalBinding[]>;
  readonly composition: Composition;
  readonly timing: "measured";
  readonly timingOutput?: { readonly name: string; readonly ref: string };
  readonly timingCandidateId?: string;
  readonly timingCandidateOrigin: "run" | "source" | "none";
  readonly served: ReadonlyMap<string, ServedFile>;
  readonly canvas: { readonly width: number; readonly height: number; readonly clearColor: string };
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
  readonly space: ProgramSpace;
  readonly anchors: ReadonlyMap<string, number>;
  readonly tokens: readonly {
    readonly id: string;
    readonly startAnchorId: string;
    readonly endAnchorId: string;
  }[];
};

async function bytesOf(attachment: ArtifactAttachment): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of await attachment.open()) {
    const copy = Uint8Array.from(chunk);
    chunks.push(copy);
    size += copy.byteLength;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

type ExecutionState = Awaited<ReturnType<typeof executeDeterministic>>["state"];

function selectedValue(
  state: ExecutionState,
  output: string,
): StoredValue | undefined {
  const selection = state.plan.outputBindings.find((item) => item.output === output);
  if (selection === undefined) return undefined;
  const executed = state.records.find((item) => item.id === selection.record)?.value;
  if (executed !== undefined) return executed;
  // Inline Source and Run candidates both belong to this freshly recompiled
  // revision. There is no stale-plan distinction to reconstruct here.
  return state.program.records.find((item) => item.id === selection.record)?.value;
}

function compositionArtifacts(composition: Composition): readonly BlobRef[] {
  const found = new Map<ResourceId, BlobRef>();
  const visit = (value: unknown): void => {
    if (value === null || typeof value !== "object") return;
    if ((value as { readonly kind?: unknown }).kind === "blob") {
      const artifact = value as BlobRef;
      found.set(artifact.resource, artifact);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    for (const item of Object.values(value)) visit(item);
  };
  visit(composition);
  return [...found.values()];
}

/** Build only the Studio-approved deterministic projection of one explicit Run. */
export async function preview(input: {
  readonly source: CompiledSource;
  readonly run: RunPlan;
  readonly domain: StudioDomain;
  readonly outputRefs: readonly string[];
  readonly compositionRef: string;
  readonly projections: readonly StudioViewRequirement[];
  /** The Profile's local Endpoints, when a Runtime Profile is selected. */
  readonly endpoints?: EndpointRegistry;
}): Promise<Preview> {
  const exportsByRef = new Map(input.source.exports.map((item) => [item.ref, item] as const));
  const targets = input.outputRefs.flatMap((ref) => {
    const found = exportsByRef.get(ref);
    return found === undefined ? [] : [found];
  });
  const store = new MemoryResourceStore();
  const served = new Map(input.source.served);
  for (const attachment of input.run.attachments) {
    const bytes = await bytesOf(attachment);
    await store.write(attachment.artifact, bytes);
    served.set(attachment.artifact.resource, {
      mediaType: attachment.artifact.mediaType,
      bytes,
    });
  }
  for (const [resource, file] of input.source.served) {
    await store.write({ kind: "blob", resource: resource as ResourceId, size: file.bytes.byteLength, mediaType: file.mediaType }, file.bytes);
  }
  const resources = {
    async get(resource: ResourceId) {
      return await store.get(resource);
    },
    async put(bytes: Uint8Array, mediaType: string) {
      const ref = await store.put(bytes, mediaType);
      served.set(ref.resource, { mediaType, bytes });
      return ref;
    },
    async write(resource: BlobRef, bytes: Uint8Array) {
      await store.write(resource, bytes);
      served.set(resource.resource, { mediaType: resource.mediaType, bytes });
    },
    async has(resource: ResourceId) {
      return await store.has(resource);
    },
  };
  const planned = input.run.plan(input.run.run, targets.map((target) => target.ref));
  const executed = await executeDeterministic(input.domain, planned.state, resources, input.endpoints);
  if (executed.unserved.length > 0) {
    throw new Error(
      `Studio projection is unresolved: ${executed.unserved.map((item) => item.capability).join(", ")}`,
    );
  }
  if (executed.errors.length > 0) throw new Error(executed.errors.join("\n"));

  const satisfactions = new Map(
    input.run.run.graph.satisfactions.map((item) => [item.output, item.candidate]),
  );
  const timingOutput = targets.find((target) => sameType(target.typeRef, semanticTrackTypes.track));
  const timingValue = timingOutput === undefined
    ? undefined
    : selectedValue(executed.state, timingOutput.ref);
  if (timingOutput === undefined || timingValue?.kind !== "inline") {
    throw new Error("Studio requires a resolved SemanticTrack projection.");
  }
  const semantic = timingValue.value as unknown as SemanticTrack;
  const spans = semanticTrackSpans(semantic);
  const anchors = semanticAnchorFrames(semantic);
  const space = projectSemanticProgramSpace(semantic);
  const rate = space.frameRate;
  const compositionValue = selectedValue(executed.state, input.compositionRef);
  if (compositionValue?.kind !== "inline") {
    throw new Error("Studio Film composition did not produce an inline Composition.");
  }
  const composition = compositionValue.value as unknown as Composition;
  for (const artifact of compositionArtifacts(composition)) {
    if (!served.has(artifact.resource)) {
      throw new Error(`Studio composition Resource ${artifact.resource} has no Run attachment.`);
    }
  }
  const projectionByRef = new Map(input.projections.map((projection) => [projection.ref, projection]));
  const tracks: BuiltTrack[] = targets.flatMap((target) => {
    if (!playable(target.typeRef)) return [];
    const stored = selectedValue(executed.state, target.ref);
    const candidateId = satisfactions.get(target.ref);
    if (stored?.kind !== "inline") {
      throw new Error(`Studio projection ${target.name} did not produce an inline Track.`);
    }
    const projection = projectionByRef.get(target.ref);
    if (projection === undefined) {
      throw new Error(`Studio projection ${target.name} has no Studio trace.`);
    }
    const surfacePreview = projection.trace.module === undefined || projection.trace.surface === undefined
      ? undefined
      : studioSurfacePreview(input.domain, projection.trace.module, projection.trace.surface);
    return [{
      name: target.name,
      type: target.type,
      typeRef: target.typeRef,
      outputRef: target.ref,
      ...(candidateId === undefined ? {} : { candidateId }),
      candidateOrigin: candidateId === undefined ? "source" as const : "run" as const,
      role: projection.role,
      trace: projection.trace,
      ...(surfacePreview === undefined ? {} : { surfacePreview }),
      value: stored.value,
    }];
  });
  const temporalBindings = new Map(tracks.map((track) => [
    track.outputRef,
    executedTemporalBindings(executed.state, track.outputRef),
  ] as const));
  const values = new Map<string, unknown>();
  for (const target of targets) {
    const stored = selectedValue(executed.state, target.ref);
    if (stored?.kind === "inline") values.set(target.ref, stored.value);
  }
  // Author Records are already deterministic inline values from this exact
  // compilation. Studio Track Companions may need them to name a resolved projection
  // (for example Caption cue text); exposing them here avoids recomputing the
  // domain value or turning a Record into a fake graph target.
  for (const placement of input.source.observations.placements) {
    for (const value of placement.values) {
      const suffixes = [`::record::${value.id}`, `::output::${value.id}`];
      for (const reference of input.projections.flatMap((projection) => projection.trace.references)) {
        if (suffixes.some((suffix) => reference.ref.endsWith(suffix))) values.set(reference.ref, value.value);
      }
    }
  }
  // Script is a raw Surface, so its inline Records are not among the structured
  // element observations above. They are still ordinary Author values from
  // the same compilation and are needed to turn Caption atom ids back into the
  // text the author actually sees.
  for (const record of input.source.compiled.program.records) {
    if (record.value.kind !== "inline") continue;
    if (input.projections.some((projection) => projection.trace.references
      .some((reference) => reference.ref === record.id))) {
      values.set(record.id, record.value.value);
    }
  }
  const timingCandidateId = satisfactions.get(timingOutput.ref);
  return {
    source: input.source,
    tracks,
    values,
    temporalBindings,
    composition,
    timing: "measured",
    timingOutput: { name: timingOutput.name, ref: timingOutput.ref },
    ...(timingCandidateId === undefined ? {} : { timingCandidateId }),
    timingCandidateOrigin: timingCandidateId === undefined ? "source" : "run",
    served,
    canvas: composition.canvas,
    frameRate: rate,
    space,
    anchors,
    tokens: spans.flatMap(({ item }) => item.take.tokens.map((token) => ({
      id: token.tokenId,
      startAnchorId: token.startAnchorId,
      endAnchorId: token.endAnchorId,
    }))),
  };
}
