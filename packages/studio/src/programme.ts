import type { ArtifactAttachment } from "@hypit/workspace";
import type { BlobRef, Digest, StoredValue } from "@hypit/protocol";
import type { Composition } from "@hypit/composition";
import {
  projectSemanticProgramSpace,
  semanticTrackSpans,
} from "@hypit/semantic-track";
import type { SemanticTrack } from "@hypit/semantic-track";

import type { StudioArchive } from "./archive.js";
import type { CompiledSource, ServedFile } from "./compile.js";
import type { StudioDomain } from "./domain.js";
import { executeDeterministic, MemoryArtifactStore } from "./execute.js";
import type { RunPlan } from "./run.js";
import type { StudioProjection } from "./studio-preflight.js";
import type { StudioProjectionRole } from "./studio-registry.js";

const PLAYABLE = new Set(["VisualTrack", "AudioTrack"]);
const TIMING = "SemanticTrack";

export type BuiltTrack = {
  readonly name: string;
  readonly type: string;
  readonly outputRef: string;
  readonly candidateId?: string;
  readonly candidateOrigin: "run" | "source" | "none";
  readonly role: StudioProjectionRole;
  readonly trace: StudioProjection["trace"];
  readonly track: unknown;
};

export type Preview = {
  readonly source: CompiledSource;
  readonly tracks: readonly BuiltTrack[];
  /** Resolved adapter realizations keyed by exact graph output ref. */
  readonly values: ReadonlyMap<string, unknown>;
  readonly composition: Composition;
  readonly timing: "measured";
  readonly timingOutput?: { readonly name: string; readonly ref: string };
  readonly timingCandidateId?: string;
  readonly timingCandidateOrigin: "run" | "source" | "none";
  readonly served: ReadonlyMap<string, ServedFile>;
  readonly canvas: { readonly width: number; readonly height: number; readonly clearColor: string };
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
  readonly space: unknown;
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
  const selection = state.plan.selections.find((item) => item.output === output);
  if (selection === undefined) return undefined;
  const executed = state.records.find((item) => item.id === selection.record)?.value;
  if (executed !== undefined) return executed;
  // Inline Source and Run candidates both belong to this freshly recompiled
  // revision. There is no stale-plan distinction to reconstruct here.
  return state.program.records.find((item) => item.id === selection.record)?.value;
}

function compositionArtifacts(composition: Composition): readonly BlobRef[] {
  const found = new Map<Digest, BlobRef>();
  const visit = (value: unknown): void => {
    if (value === null || typeof value !== "object") return;
    if ((value as { readonly kind?: unknown }).kind === "blob") {
      const artifact = value as BlobRef;
      found.set(artifact.digest, artifact);
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
  readonly projections: readonly StudioProjection[];
  readonly archive?: StudioArchive;
}): Promise<Preview> {
  const targets = input.source.exports.filter((item) => input.outputRefs.includes(item.ref));
  const store = new MemoryArtifactStore();
  const served = new Map(input.source.served);
  for (const attachment of input.run.attachments) {
    const bytes = await bytesOf(attachment);
    await store.put(bytes, attachment.artifact.mediaType);
    served.set(attachment.artifact.digest, {
      mediaType: attachment.artifact.mediaType,
      bytes,
    });
  }
  for (const [, file] of input.source.served) await store.put(file.bytes, file.mediaType);
  const artifacts = {
    async get(digest: Digest) {
      const local = await store.get(digest);
      if (local !== undefined) return local;
      const archived = await input.archive?.read(digest);
      if (archived !== undefined) {
        served.set(digest, { mediaType: "application/octet-stream", bytes: archived });
      }
      return archived;
    },
    async put(bytes: Uint8Array, mediaType: string) {
      const ref = await store.put(bytes, mediaType);
      served.set(ref.digest, { mediaType, bytes });
      return ref;
    },
    async has(digest: Digest) {
      return await store.has(digest) || await input.archive?.read(digest) !== undefined;
    },
  };
  const planned = input.run.plan(input.run.run, targets.map((target) => target.ref));
  const executed = await executeDeterministic(input.domain, planned.state, artifacts);
  if (executed.unserved.length > 0) {
    throw new Error(
      `Studio projection is unresolved: ${executed.unserved.map((item) => item.capability).join(", ")}`,
    );
  }
  if (executed.errors.length > 0) throw new Error(executed.errors.join("\n"));

  const satisfactions = new Map(
    input.run.run.graph.satisfactions.map((item) => [item.output, item.candidate]),
  );
  const timingOutput = targets.find((target) => target.type === TIMING);
  const timingValue = timingOutput === undefined
    ? undefined
    : selectedValue(executed.state, timingOutput.ref);
  if (timingOutput === undefined || timingValue?.kind !== "inline") {
    throw new Error("Studio requires a resolved SemanticTrack projection.");
  }
  const semantic = timingValue.value as unknown as SemanticTrack;
  const spans = semanticTrackSpans(semantic);
  const anchors = new Map(spans.flatMap(({ item, startFrame }) =>
    item.take.anchors.map((anchor) => [anchor.identity, startFrame + anchor.frame] as const)));
  const space = projectSemanticProgramSpace(semantic);
  const rate = space.frameRate;
  const compositionValue = selectedValue(executed.state, input.compositionRef);
  if (compositionValue?.kind !== "inline") {
    throw new Error("Studio Film composition did not produce an inline Composition.");
  }
  const composition = compositionValue.value as unknown as Composition;
  for (const artifact of compositionArtifacts(composition)) {
    if (served.has(artifact.digest)) continue;
    const bytes = await input.archive?.read(artifact.digest);
    if (bytes !== undefined) served.set(artifact.digest, { mediaType: artifact.mediaType, bytes });
  }
  const projectionByRef = new Map(input.projections.map((projection) => [projection.ref, projection]));
  const tracks: BuiltTrack[] = targets.flatMap((target) => {
    if (!PLAYABLE.has(target.type)) return [];
    const stored = selectedValue(executed.state, target.ref);
    const candidateId = satisfactions.get(target.ref);
    if (stored?.kind !== "inline") {
      throw new Error(`Studio projection ${target.name} did not produce an inline Track.`);
    }
    const projection = projectionByRef.get(target.ref);
    if (projection === undefined) {
      throw new Error(`Studio projection ${target.name} has no Studio trace.`);
    }
    return [{
      name: target.name,
      type: target.type,
      outputRef: target.ref,
      ...(candidateId === undefined ? {} : { candidateId }),
      candidateOrigin: candidateId === undefined ? "source" as const : "run" as const,
      role: projection.role,
      trace: projection.trace,
      track: stored.value,
    }];
  });
  const values = new Map<string, unknown>();
  for (const target of targets) {
    const stored = selectedValue(executed.state, target.ref);
    if (stored?.kind === "inline") values.set(target.ref, stored.value);
  }
  // Author Records are already deterministic inline values from this exact
  // compilation. Studio adapters may need them to name a resolved projection
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
