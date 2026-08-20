import type { ArtifactAttachment } from "@hypit/workspace";
import type { Digest, StoredValue } from "@hypit/protocol";

import type { StudioArchive } from "./archive.js";
import type { CompiledSource, ServedFile } from "./compile.js";
import type { StudioDomain } from "./domain.js";
import { executeDeterministic, MemoryArtifactStore } from "./execute.js";
import type { RunPlan } from "./run.js";

const PLAYABLE = new Set(["VisualTrack", "AudioTrack"]);
const TIMING = "CompleteSemanticMap";

export type BuiltTrack = {
  readonly name: string;
  readonly type: string;
  readonly outputRef: string;
  readonly candidateId?: string;
  readonly candidateOrigin: "run" | "source" | "none";
  readonly track: unknown;
};

export type Preview = {
  readonly source: CompiledSource;
  readonly tracks: readonly BuiltTrack[];
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

function inlineRecord(compiled: unknown, id: string): unknown {
  const records = (compiled as {
    readonly program: {
      readonly records: readonly { readonly id: string; readonly value: StoredValue }[];
    };
  }).program.records;
  const found = records.find((record) => record.id === id);
  return found?.value.kind === "inline" ? found.value.value : undefined;
}

function canvasOf(compiled: unknown): { width: number; height: number; clearColor: string } {
  const records = (compiled as {
    readonly program: { readonly records: readonly { readonly value: StoredValue }[] };
  }).program.records;
  let clearColor = "#000000";
  let size: { width: number; height: number } | undefined;
  for (const record of records) {
    if (record.value.kind !== "inline") continue;
    const held = record.value.value as {
      readonly contract?: string;
      readonly widthPx?: number;
      readonly heightPx?: number;
      readonly clearColor?: string;
      readonly canvas?: { readonly clearColor?: string };
    };
    clearColor = held.clearColor ?? held.canvas?.clearColor ?? clearColor;
    if (held.contract === "hypit.canvas-space@1"
      && typeof held.widthPx === "number" && typeof held.heightPx === "number") {
      size = { width: held.widthPx, height: held.heightPx };
    }
  }
  return { ...(size ?? { width: 1080, height: 1920 }), clearColor };
}

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

function selectedValue(state: ExecutionState, output: string): StoredValue | undefined {
  const selection = state.plan.selections.find((item) => item.output === output);
  if (selection === undefined) return undefined;
  return state.records.find((item) => item.id === selection.record)?.value
    ?? state.program.records.find((item) => item.id === selection.record)?.value;
}

function programSpace(values: readonly StoredValue[]): unknown {
  for (const stored of values) {
    if (stored.kind !== "inline") continue;
    const value = stored.value as {
      readonly durationSec?: unknown;
      readonly frameRate?: { readonly numerator?: unknown; readonly denominator?: unknown };
    };
    if (typeof value.durationSec === "number"
      && typeof value.frameRate?.numerator === "number"
      && typeof value.frameRate.denominator === "number") return value;
  }
  throw new Error("Studio projection produced no ProgramSpace.");
}

/** Build only the Studio-approved deterministic projection of one explicit Run. */
export async function preview(input: {
  readonly source: CompiledSource;
  readonly run: RunPlan;
  readonly domain: StudioDomain;
  readonly outputRefs: readonly string[];
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
  const values = targets
    .map((target) => selectedValue(executed.state, target.ref))
    .filter((value): value is StoredValue => value !== undefined);
  const timingOutput = targets.find((target) => target.type === TIMING);
  const timingValue = timingOutput === undefined
    ? undefined
    : selectedValue(executed.state, timingOutput.ref);
  if (timingOutput === undefined || timingValue?.kind !== "inline") {
    throw new Error("Studio requires a resolved CompleteSemanticMap projection.");
  }
  const map = timingValue.value as {
    readonly anchors?: readonly { readonly identity: string; readonly frame: number }[];
  };
  const anchors = new Map((map.anchors ?? []).map((anchor) => [anchor.identity, anchor.frame]));
  const narrative = input.source.exports.find((item) => item.type === "Narrative");
  const narrativeValue = narrative === undefined ? undefined : inlineRecord(
    input.source.compiled,
    narrative.ref,
  ) as {
    readonly tokens?: readonly {
      readonly id: string;
      readonly startAnchorId: string;
      readonly endAnchorId: string;
    }[];
  } | undefined;
  const space = programSpace([
    ...values,
    ...executed.state.records.map((item) => item.value),
    ...executed.state.program.records.map((item) => item.value),
  ]);
  const rate = (space as {
    readonly frameRate: { readonly numerator: number; readonly denominator: number };
  }).frameRate;
  const tracks: BuiltTrack[] = targets.flatMap((target) => {
    if (!PLAYABLE.has(target.type)) return [];
    const stored = selectedValue(executed.state, target.ref);
    const candidateId = satisfactions.get(target.ref);
    if (stored?.kind !== "inline") {
      throw new Error(`Studio projection ${target.name} did not produce an inline Track.`);
    }
    return [{
      name: target.name,
      type: target.type,
      outputRef: target.ref,
      ...(candidateId === undefined ? {} : { candidateId }),
      candidateOrigin: candidateId === undefined ? "source" as const : "run" as const,
      track: stored.value,
    }];
  });
  const timingCandidateId = satisfactions.get(timingOutput.ref);
  return {
    source: input.source,
    tracks,
    timing: "measured",
    timingOutput: { name: timingOutput.name, ref: timingOutput.ref },
    ...(timingCandidateId === undefined ? {} : { timingCandidateId }),
    timingCandidateOrigin: timingCandidateId === undefined ? "source" : "run",
    served,
    canvas: canvasOf(input.source.compiled),
    frameRate: rate,
    space,
    anchors,
    tokens: narrativeValue?.tokens ?? [],
  };
}
