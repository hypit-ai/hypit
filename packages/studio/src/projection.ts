import type { BlobRef, ResourceId, Value } from "@hypit/hypit/protocol";
import { normalizeValue, sameType, valueBlobRefs } from "@hypit/hypit/protocol";
import type { BuildCandidateSelection } from "@hypit/hypit/kernel";
import type { Composition } from "@hypit/composition";
import { compositionTypes } from "@hypit/composition";
import { timelineTypes, assertTimelineIdentity } from "@hypit/timeline";
import type { Timeline } from "@hypit/timeline";
import type { StudioObservedValue, StudioResolvedTrack, StudioTemporalBinding } from "@hypit/studio-companion";
import type { CliTransientExecution as RuntimeHostTransientExecution } from "@hypit/hypit/cli";

import type { CompiledSource, ServedFile } from "./compile.js";
import type { StudioDomain } from "./domain.js";
import { executeStudioProjection, MemoryResourceStore } from "./execute.js";
import type { RunPlan } from "./run.js";
import type { StudioTrackRequirement } from "./studio-preflight.js";
import { studioDeclarationPreview } from "./declaration-preview.js";
import { executedTemporalBindings } from "./temporal-graph.js";
import type { StudioCompanionRegistry } from "./studio-registry.js";
import { resolveStudioDeclarations } from "./temporal-declarations.js";
import { attachmentFile, bytesFile, materialBytes } from "./material.js";

function playable(type: import("@hypit/hypit/protocol").TypeRef): boolean {
  return sameType(type, compositionTypes.visualTrack) || sameType(type, compositionTypes.audioTrack);
}

export type BuiltTrack = StudioResolvedTrack & {
  /** Every Film occurrence of a visual Track; empty for AudioTrack. */
  readonly visualOccurrences: readonly (readonly string[])[];
};

export type StudioProjection = {
  /** Server-only executed graph retained for exact Studio inverse traversal. */
  readonly state: ExecutionState;
  readonly source: CompiledSource;
  readonly tracks: readonly BuiltTrack[];
  /** Resolved Companion realizations keyed by exact graph output ref. */
  readonly values: ReadonlyMap<string, unknown>;
  readonly temporalDomainValues: readonly StudioObservedValue[];
  readonly temporalValues: readonly StudioObservedValue[];
  readonly declarationIssues: readonly string[];
  readonly temporalBindings: ReadonlyMap<string, readonly StudioTemporalBinding[]>;
  readonly composition: Composition;
  readonly served: ReadonlyMap<string, ServedFile>;
  readonly canvas: { readonly width: number; readonly height: number; readonly clearColor: string };
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
  readonly timeline: Timeline;
};

type ExecutionState = Awaited<ReturnType<typeof executeStudioProjection>>["state"];

function selectedValue(
  state: ExecutionState,
  selections: readonly Pick<BuildCandidateSelection, "output" | "record">[],
  output: string,
): Value | undefined {
  const selection = selections.find((item) => item.output === output);
  if (selection === undefined) return state.program.records.find((item) => item.id === output)?.value;
  const executed = state.records.find((item) => item.id === selection.record)?.value;
  if (executed !== undefined) return executed;
  // Materialized Source and Run candidates both belong to this freshly recompiled
  // revision. There is no stale-plan distinction to reconstruct here.
  return state.program.records.find((item) => item.id === selection.record)?.value;
}

function compositionArtifacts(composition: Composition): readonly BlobRef[] {
  return valueBlobRefs(normalizeValue(composition)).map((item) => item.blob);
}

/** Build only the Studio-approved deterministic projection of one explicit Run. */
export async function resolveStudioProjection(input: {
  readonly source: CompiledSource;
  readonly registry: StudioCompanionRegistry;
  readonly run: RunPlan;
  readonly domain: StudioDomain;
  readonly outputRefs: readonly string[];
  readonly compositionRef: string;
  readonly timeRef: string;
  readonly tracks: readonly StudioTrackRequirement[];
  /** Runtime-owned execution for capabilities explicitly safe outside a Build. */
  readonly transientExecution?: RuntimeHostTransientExecution;
}): Promise<StudioProjection> {
  const exportsByRef = new Map(input.source.exports.map((item) => [item.ref, item] as const));
  const targets = input.outputRefs.flatMap((ref) => {
    const found = exportsByRef.get(ref);
    return found === undefined ? [] : [found];
  });
  const store = new MemoryResourceStore();
  const served = new Map(input.source.served);
  for (const attachment of input.run.attachments) {
    if (!served.has(attachment.blob.resource)) {
      served.set(attachment.blob.resource, attachmentFile(attachment));
    }
  }
  const resources = {
    async get(resource: ResourceId) {
      const file = served.get(resource);
      if (file !== undefined) return materialBytes(file);
      return await store.get(resource);
    },
    async put(bytes: Uint8Array, mediaType: string) {
      const ref = await store.put(bytes, mediaType);
      served.set(ref.resource, bytesFile(mediaType, bytes));
      return ref;
    },
    async write(resource: BlobRef, bytes: Uint8Array) {
      await store.write(resource, bytes);
      served.set(resource.resource, bytesFile(resource.mediaType, bytes));
    },
    async has(resource: ResourceId) {
      return served.has(resource) || await store.has(resource);
    },
  };
  const prepared = input.run.prepare(input.run.run, targets.map((target) => target.ref));
  const executed = await executeStudioProjection(
    input.domain,
    prepared.state,
    resources,
    input.transientExecution,
  );
  if (executed.unserved.length > 0) {
    throw new Error(
      `Studio projection is unresolved: ${executed.unserved.map((item) => item.capability).join(", ")}`,
    );
  }
  if (executed.errors.length > 0) throw new Error(executed.errors.join("\n"));

  const timingOutput = input.source.exports.find((target) => target.ref === input.timeRef);
  const timingRecord = executed.state.program.records.find((record) => record.id === input.timeRef);
  const timingType = timingOutput?.typeRef ?? timingRecord?.type;
  const timingValue = selectedValue(executed.state, prepared.selections, input.timeRef);
  if (timingValue === undefined || timingType === undefined) throw new Error("Studio requires a resolved film time source.");
  if (!sameType(timingType, timelineTypes.timeline)) throw new Error("Studio requires the declared Timeline.");
  const timeline = timingValue as unknown as Timeline;
  assertTimelineIdentity(timeline);
  const rate = timeline.frameRate;
  const compositionValue = selectedValue(executed.state, prepared.selections, input.compositionRef);
  if (compositionValue === undefined) {
    throw new Error("Studio Film composition did not produce a Composition.");
  }
  const composition = compositionValue as unknown as Composition;
  for (const artifact of compositionArtifacts(composition)) {
    if (!served.has(artifact.resource)) {
      throw new Error(`Studio composition Resource ${artifact.resource} has no Run attachment.`);
    }
  }
  const trackByRef = new Map(input.tracks.map((track) => [track.ref, track]));
  const tracks: BuiltTrack[] = targets.flatMap((target) => {
    if (!playable(target.typeRef)) return [];
    const stored = selectedValue(executed.state, prepared.selections, target.ref);
    if (stored === undefined) {
      throw new Error(`Studio projection ${target.name} did not produce a Track.`);
    }
    const track = trackByRef.get(target.ref);
    if (track === undefined) {
      throw new Error(`Studio projection ${target.name} has no Studio trace.`);
    }
    const declarationPreview = track.trace.module === undefined || track.trace.declaration === undefined
      ? undefined
      : studioDeclarationPreview(input.registry, track.trace.module, track.trace.declaration);
    return [{
      name: target.name,
      type: target.type,
      typeRef: target.typeRef,
      outputRef: target.ref,
      trace: track.trace,
      visualOccurrences: track.visualOccurrences ?? [],
      ...(declarationPreview === undefined ? {} : { declarationPreview }),
      value: stored,
    }];
  });
  const temporalBindings = new Map(tracks.map((track) => [
    track.outputRef,
    executedTemporalBindings(
      executed.state,
      prepared.selections,
      track.outputRef,
      (type, value) => input.registry.identifyTemporalSource(type, value),
      (producer, output) => input.registry.temporalRelationFor(producer, output),
    ),
  ] as const));
  const values = new Map<string, unknown>();
  for (const target of targets) {
    const stored = selectedValue(executed.state, prepared.selections, target.ref);
    if (stored !== undefined) values.set(target.ref, stored);
  }
  // Companion traces carry exact qualified references. Resolve those references from
  // the executed projection so deterministic upstream Producers are visible too.
  for (const track of input.tracks) {
    for (const reference of track.trace.references) {
      const stored = selectedValue(executed.state, prepared.selections, reference.ref);
      if (stored !== undefined) values.set(reference.ref, stored);
    }
  }
  const temporalValueTypes = input.registry.temporalDomainValueTypes();
  const temporalDomainValues: StudioObservedValue[] = [];
  const declarations = await resolveStudioDeclarations({
    run: input.run, registry: input.registry, domain: input.domain,
    resolved: executed.state, selections: prepared.selections, resources,
    ...(input.transientExecution === undefined ? {} : { transientExecution: input.transientExecution }),
  });
  const temporalDomainValueIds = new Set<string>();
  for (const record of [...executed.state.program.records, ...executed.state.records]) {
    if (!temporalValueTypes.some((type) => sameType(type, record.type))) continue;
    values.set(record.id, record.value);
    if (!temporalDomainValueIds.has(record.id)) {
      temporalDomainValues.push({ id: record.id, type: record.type, value: record.value });
      temporalDomainValueIds.add(record.id);
    }
  }
  return {
    state: executed.state,
    source: input.source,
    tracks,
    values,
    temporalDomainValues,
    temporalValues: declarations.values,
    declarationIssues: declarations.issues,
    temporalBindings,
    composition,
    served,
    canvas: composition.canvas,
    frameRate: rate,
    timeline,
  };
}
