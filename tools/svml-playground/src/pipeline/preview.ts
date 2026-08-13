/**
 * Build the pictures a Source describes, with whatever it has been given.
 *
 * A preview asks for Tracks rather than for a film: a Track that cannot be
 * built costs only itself, so a Source waiting on one Provider still shows
 * everything else. Which Tracks exist is a question the packages answer - the
 * preview asks for every export that is a Track and knows nothing else about
 * them.
 */
import { createHash } from "node:crypto";

import { createProvidedCandidate } from "@narratage/run";
import { videoDomainClosure, videoDomainValidators } from "@narratage/video-domain";
import { validateValue } from "@narratage/validation";

import { compileSource } from "./compile.js";
import type { CompiledSource, ServedFile } from "./compile.js";
import type { Placement } from "./observe.js";
import { evenCaptionPlan, hasAtoms } from "./caption-plan.js";
import { estimateTiming } from "./estimate.js";
import { blackFrames, heldPicture } from "./placeholder.js";
import { execute, MemoryArtifactStore } from "./execute.js";
import type { Archive } from "./archive.js";
import { applyRunSource, emptyRun } from "./run-source.js";
import type { Refusal, RunPlan } from "./run-source.js";

/** Types the preview can play. Anything else is a value, not a picture. */
const PLAYABLE = new Set(["VisualTrack", "AudioTrack"]);
/** The timings every Track is placed against. */
const TIMING = "CompleteSemanticMap";
const SPACE = "ProgramSpace";
/** Material a Source names but nobody has supplied. */
const MATERIAL = "BlobArtifact";
/** Which words share a screen. A model decides this; a preview cannot. */
const PHRASING = "CaptionPlan";

export type BuiltTrack = {
  readonly name: string;
  readonly type: string;
  /** The Track value, or undefined when it could not be built. */
  readonly track?: unknown;
  /** Capabilities no Provider on this machine could answer. */
  readonly unserved: readonly string[];
  readonly errors: readonly string[];
};

export type Preview = {
  readonly source: CompiledSource;
  readonly tracks: readonly BuiltTrack[];
  readonly timing: "measured" | "estimated";
  readonly refused: readonly Refusal[];
  readonly served: ReadonlyMap<string, ServedFile>;
  /** Outputs that were shown as a black frame because no material was supplied. */
  readonly placeholders: readonly string[];
  /** Captions whose phrasing was cut mechanically because nobody planned it. */
  readonly phrasing: readonly string[];
  /** Shots shown as a picture the Source already points at, for want of the take. */
  readonly stoodIn: readonly string[];
  /** The Canvas and frame rate every Track was placed in. */
  readonly canvas: { readonly width: number; readonly height: number; readonly clearColor: string };
  readonly frameRate: { readonly numerator: number; readonly denominator: number };
  /** The Program Space the Tracks agree on, for the renderer. */
  readonly space: unknown;
  /** Anchor identity to frame, however the timings were arrived at. */
  readonly anchors: ReadonlyMap<string, number>;
  /** Token identity to the anchors that open and close it. */
  readonly tokens: readonly {
    readonly id: string;
    readonly startAnchorId: string;
    readonly endAnchorId: string;
  }[];
};

/**
 * The frame rate the Source declares, read off whatever compile-time Record
 * carries one. Every Track is placed in one Program Space, so the first is the
 * programme's.
 */
function authoredFrameRate(compiled: unknown): { numerator: number; denominator: number } {
  const records = (compiled as { module: { records: readonly { value: { kind: string; value?: unknown } }[] } })
    .module.records;
  for (const record of records) {
    if (record.value.kind !== "inline") continue;
    const rate = (record.value.value as { frameRate?: { numerator?: number; denominator?: number } }).frameRate;
    if (typeof rate?.numerator === "number" && typeof rate.denominator === "number") {
      return { numerator: rate.numerator, denominator: rate.denominator };
    }
  }
  // Nothing declared one, so the preview picks the rate a Source most often has.
  return { numerator: 30, denominator: 1 };
}

/** The Canvas the Source declares, so a stand-in is the shape of the programme. */
function authoredCanvas(compiled: unknown): { width: number; height: number } {
  const records = (compiled as { module: { records: readonly { value: { kind: string; value?: unknown } }[] } })
    .module.records;
  for (const record of records) {
    if (record.value.kind !== "inline") continue;
    const canvas = record.value.value as { widthPx?: number; heightPx?: number; contract?: string };
    if (canvas.contract === "svml.canvas-space@1"
      && typeof canvas.widthPx === "number" && typeof canvas.heightPx === "number") {
      return { width: canvas.widthPx, height: canvas.heightPx };
    }
  }
  return { width: 1080, height: 1920 };
}

function inlineRecord(compiled: unknown, id: string): unknown {
  const records = (compiled as { module: { records: readonly { id: string; value: { kind: string; value?: unknown } }[] } })
    .module.records;
  const found = records.find((record) => record.id === id);
  return found?.value.kind === "inline" ? found.value.value : undefined;
}

/**
 * Read a Source, and every Track in it, as a build would.
 *
 * `runPath` names the Run Source that says which material and which timings to
 * read with. Without one, or where it leaves the timings unsaid, the Script's
 * own words are used to place them and the result is announced as an estimate.
 */
export async function preview(
  entryPath: string,
  runPath?: string,
  archive?: Archive,
): Promise<Preview> {
  const source = await compileSource(entryPath);

  let base: RunPlan;
  const unread: Refusal[] = [];
  if (runPath === undefined) base = await emptyRun(entryPath, source.compiled);
  else {
    try {
      base = await applyRunSource({
        runPath, compiled: source.compiled,
        served: source.served as Map<string, ServedFile>,
        ...(archive === undefined ? {} : { archive }),
      });
    } catch (error) {
      // A Run Source that names material this machine has never made is not a
      // broken Source. Read what it says, stand in for what it cannot reach,
      // and say which is which.
      unread.push({
        output: runPath,
        reason: (error as Error).message,
      });
      base = await emptyRun(entryPath, source.compiled);
    }
  }

  // What the author asked to build, when they asked for anything. That is how
  // a Source is taken only as far as one produced thing rather than all the
  // way to a film.
  // Only a target this preview can draw is worth honouring: nearly every Run
  // Source asks for the finished film, and a film is not something a timeline
  // can show. Asking for one produced Track, though, is exactly how a Source is
  // taken only as far as that Track.
  const asked = source.exports.filter((item) =>
    PLAYABLE.has(item.type) && base.targets.some((name) => name === item.ref || name === item.name));
  const targets = asked.length > 0
    ? asked
    : source.exports.filter((item) => PLAYABLE.has(item.type));

  // Timings a Run Source supplied are measurements. Where it said nothing, the
  // Script still has to be placed somewhere, so it is estimated and said so.
  const satisfied = new Set(base.run.graph.satisfactions.map((item) => item.output));
  const unsaid = source.exports.filter((item) =>
    (item.type === TIMING || item.type === SPACE) && !satisfied.has(item.ref));
  let timing: "measured" | "estimated" = unsaid.length === 0 ? "measured" : "estimated";

  let run = base.run;
  let anchors = new Map<string, number>();
  if (unsaid.length > 0) {
    const narrative = source.exports.find((item) => item.type === "Narrative");
    const value = narrative === undefined
      ? undefined
      : inlineRecord(source.compiled, narrative.ref);
    if (value === undefined) {
      // Nothing to estimate from either, so the Tracks that need timings will
      // report what they were waiting for rather than being invented.
      timing = "measured";
    } else {
      const estimated = estimateTiming(value as never, authoredFrameRate(source.compiled));
      anchors = new Map((estimated.map as { anchors: readonly { identity: string; frame: number }[] })
        .anchors.map((anchor) => [anchor.identity, anchor.frame]));
      const closure = await videoDomainClosure();
      const validators = await videoDomainValidators();
      const added: unknown[] = [];
      const satisfactions = [...base.run.graph.satisfactions];
      for (const output of unsaid) {
        const supplied = output.type === TIMING ? estimated.map : estimated.space;
        const type = outputType(source, output.ref);
        const stored = { kind: "inline" as const, value: supplied as never };
        const validation = await validateValue(closure, type as never, stored, validators);
        const candidate = createProvidedCandidate({
          type: type as never,
          value: stored,
          ...(validation === undefined ? {} : { validation }),
        } as never);
        added.push(candidate);
        satisfactions.push({ output: output.ref, candidate: candidate.id });
      }
      run = {
        ...base.run,
        graph: {
          ...base.run.graph,
          candidates: [...base.run.graph.candidates, ...added],
          satisfactions,
        },
      };
    }
  }

  // Material nobody supplied is stood in for, so the shape of the programme can
  // be seen before it has been shot.
  const placeholders: string[] = [];
  const stoodIn: string[] = [];
  // Only something the graph produces can be missing. A Record the Source read
  // at compile time already is its value, and standing in for it would replace
  // a picture the author supplied.
  const satisfiedNow = new Set(run.graph.satisfactions.map((item) => item.output));
  const consumed = new Set(source.observations.placements.flatMap((item) => item.references));
  const unsupplied = source.exports.filter((item) =>
    item.type === MATERIAL && isOutput(source, item.ref)
    && !satisfiedNow.has(item.ref) && consumed.has(item.name));
  if (unsupplied.length > 0) {
    // Measured timings arrive as a Candidate the Run Source supplied; either way
  // the anchors are what places every word.
  if (anchors.size === 0) {
    for (const candidate of run.graph.candidates) {
      const root = (candidate as { root?: { value?: { kind?: string; value?: unknown } } }).root;
      const held = root?.value?.kind === "inline" ? root.value.value : undefined;
      const listed = (held as { contract?: string; anchors?: readonly { identity: string; frame: number }[] })
        ?.anchors;
      if ((held as { contract?: string })?.contract !== "svml.complete-semantic-map@1") continue;
      anchors = new Map((listed ?? []).map((anchor) => [anchor.identity, anchor.frame]));
      break;
    }
  }
  const narrativeExport = source.exports.find((item) => item.type === "Narrative");
  const narrativeValue = narrativeExport === undefined
    ? undefined
    : inlineRecord(source.compiled, narrativeExport.ref) as
      { tokens?: readonly { id: string; startAnchorId: string; endAnchorId: string }[] } | undefined;

  const canvas = authoredCanvas(source.compiled);
    const rate = authoredFrameRate(source.compiled);
    const black = blackFrames(rate, canvas);
    if (black !== undefined) {
      const digest = `sha256:${createHash("sha256").update(black.bytes).digest("hex")}`;
      (source.served as Map<string, ServedFile>).set(digest, {
        mediaType: black.mediaType, bytes: black.bytes,
      });
      const added = new Map<string, unknown>(
        run.graph.candidates.map((item) => [(item as { id: string }).id, item]));
      const satisfactions = [...run.graph.satisfactions];
      for (const output of unsupplied) {
        // A shot that points at a picture already in hand stands in as that
        // picture. It is not the take, but it is the right subject held for the
        // right length, which is what makes a preview worth looking at.
        const held = standIn(source, output.name, rate, canvas);
        const shown = held ?? { bytes: black.bytes, mediaType: black.mediaType, digest };
        if (held !== undefined) {
          (source.served as Map<string, ServedFile>).set(held.digest, {
            mediaType: held.mediaType, bytes: held.bytes,
          });
        }
        // The same bytes are the same Candidate, however many shots they cover.
        const candidate = createProvidedCandidate({
          type: outputType(source, output.ref) as never,
          value: {
            kind: "blob", digest: shown.digest,
            size: shown.bytes.byteLength, mediaType: shown.mediaType,
          } as never,
        } as never);
        added.set(candidate.id, candidate);
        satisfactions.push({ output: output.ref, candidate: candidate.id });
        (held === undefined ? placeholders : stoodIn).push(output.name);
      }
      run = { ...run, graph: { ...run.graph, candidates: [...added.values()], satisfactions } };
    }
  }

  // Everything a build produces has to be servable too: a picture references
  // the normalized material, not the file it came from.
  const store = new MemoryArtifactStore();
  const served = source.served as Map<string, ServedFile>;
  // Phrasing nobody planned is cut mechanically, so captions read the Source's
  // own words even where no model has grouped them.
  const phrasing: string[] = [];
  const unplanned = source.exports.filter((item) =>
    item.type === PHRASING && !new Set(run.graph.satisfactions.map((s) => s.output)).has(item.ref));
  if (unplanned.length > 0) {
    const display = source.exports.find((item) => item.type === "CaptionDisplaySequence");
    const sequence = display === undefined ? undefined : inlineRecord(source.compiled, display.ref);
    const programExport = source.exports.find((item) => item.type === "CaptionProgram");
    const program = programExport === undefined
      ? undefined
      : inlineRecord(source.compiled, programExport.ref) as { runs?: readonly never[] } | undefined;
    if (hasAtoms(sequence) && Array.isArray(program?.runs) && program.runs.length > 0) {
      const closure = await videoDomainClosure();
      const validators = await videoDomainValidators();
      const added = new Map<string, unknown>(
        run.graph.candidates.map((item) => [(item as { id: string }).id, item]));
      const satisfactions = [...run.graph.satisfactions];
      for (const output of unplanned) {
        const plan = evenCaptionPlan(sequence, program as never);
        const type = outputType(source, output.ref);
        const stored = { kind: "inline" as const, value: plan as never };
        const validation = await validateValue(closure, type as never, stored, validators);
        const candidate = createProvidedCandidate({
          type: type as never, value: stored,
          ...(validation === undefined ? {} : { validation }),
        } as never);
        added.set(candidate.id, candidate);
        satisfactions.push({ output: output.ref, candidate: candidate.id });
        phrasing.push(output.name);
      }
      run = { ...run, graph: { ...run.graph, candidates: [...added.values()], satisfactions } };
    }
  }

  const artifacts = {
    // Material this Build produced is in the store; material an earlier Build
    // produced is in the archive. Both are addressed the same way.
    async get(digest: never) {
      const held = await store.get(digest);
      if (held !== undefined) return held;
      const kept = await archive?.read(digest as string);
      if (kept !== undefined) served.set(digest as string, { mediaType: "application/octet-stream", bytes: kept });
      return kept;
    },
    async put(bytes: Uint8Array, mediaType: string) {
      const ref = await store.put(bytes, mediaType);
      served.set((ref as { digest: string }).digest, { mediaType, bytes });
      return ref;
    },
  };
  const tracks: BuiltTrack[] = [];
  for (const target of targets) {
    const planned = base.plan(run, [target.ref]);
    for (const [, file] of [...served]) await artifacts.put(file.bytes, file.mediaType);
    const out = await execute(planned.state, artifacts as never);
    const selection = out.state.plan.selections.find((item) => item.output === target.ref);
    const record = out.state.records.find((item) => item.id === selection?.record);
    const stored = record?.value as { kind: string; value?: unknown } | undefined;
    tracks.push({
      name: target.name,
      type: target.type,
      ...(stored?.kind === "inline" ? { track: stored.value } : {}),
      unserved: out.unserved.map((item) => item.capability),
      errors: out.errors,
    });
  }

  // Measured timings arrive as a Candidate the Run Source supplied; either way
  // the anchors are what places every word.
  if (anchors.size === 0) {
    for (const candidate of run.graph.candidates) {
      const root = (candidate as { root?: { value?: { kind?: string; value?: unknown } } }).root;
      const held = root?.value?.kind === "inline" ? root.value.value : undefined;
      const listed = (held as { contract?: string; anchors?: readonly { identity: string; frame: number }[] })
        ?.anchors;
      if ((held as { contract?: string })?.contract !== "svml.complete-semantic-map@1") continue;
      anchors = new Map((listed ?? []).map((anchor) => [anchor.identity, anchor.frame]));
      break;
    }
  }
  const narrativeExport = source.exports.find((item) => item.type === "Narrative");
  const narrativeValue = narrativeExport === undefined
    ? undefined
    : inlineRecord(source.compiled, narrativeExport.ref) as
      { tokens?: readonly { id: string; startAnchorId: string; endAnchorId: string }[] } | undefined;

  const canvas = authoredCanvas(source.compiled);
  const frameRate = authoredFrameRate(source.compiled);
  const spaceExport = source.exports.find((item) => item.type === SPACE);
  const space = spaceExport === undefined ? undefined : builtSpace(tracks, spaceExport, frameRate);
  return {
    source, tracks, timing, refused: [...base.refused, ...unread], served: source.served, placeholders, phrasing, stoodIn,
    canvas: { ...canvas, clearColor: authoredClearColor(source.compiled) },
    frameRate,
    space,
    anchors,
    tokens: narrativeValue?.tokens ?? [],
  };
}

/** The clear colour the Film declares, or black when it declares none. */
function authoredClearColor(compiled: unknown): string {
  const records = (compiled as { module: { records: readonly { value: { kind: string; value?: unknown } }[] } })
    .module.records;
  for (const record of records) {
    if (record.value.kind !== "inline") continue;
    const held = record.value.value as { clearColor?: unknown; canvas?: { clearColor?: unknown } };
    const colour = held.clearColor ?? held.canvas?.clearColor;
    if (typeof colour === "string") return colour;
  }
  return "#000000";
}

/** The Program Space every Track was placed in, derived from what was built. */
function builtSpace(
  tracks: readonly BuiltTrack[],
  _space: { readonly ref: string },
  frameRate: { readonly numerator: number; readonly denominator: number },
): unknown {
  const frames = tracks.flatMap((track) =>
    ((track.track as { presents?: readonly { span: { endFrameExclusive: number } }[] } | undefined)?.presents ?? [])
      .map((present) => present.span.endFrameExclusive));
  const frameCount = Math.max(1, ...frames);
  return {
    contract: "svml.program-space@1",
    durationSec: frameCount * frameRate.denominator / frameRate.numerator,
    frameRate: { ...frameRate },
  };
}

/**
 * A picture this output already points at.
 *
 * An element that names another value the Source can already produce - a
 * reference frame, a first frame - names something worth showing while the
 * shot itself does not exist. How long to hold it is what the element itself
 * declared, so the stand-in occupies the span the take would have.
 */
function standIn(
  source: CompiledSource,
  name: string,
  frameRate: { readonly numerator: number; readonly denominator: number },
  canvas: { readonly width: number; readonly height: number },
): { readonly bytes: Uint8Array; readonly mediaType: string; readonly digest: string } | undefined {
  const owner = name.includes(".") ? name.slice(0, name.indexOf(".")) : name;
  const placement = source.observations.placements.find((item) => item.id === owner);
  if (placement === undefined) return undefined;
  for (const path of placement.references) {
    const referenced = source.exports.find((item) => item.name === path);
    if (referenced?.type !== MATERIAL) continue;
    const bytes = pictureFor(source, referenced.ref);
    if (bytes === undefined) continue;
    const made = heldPicture(bytes, declaredSeconds(source, placement) ?? 2, frameRate, canvas);
    if (made === undefined) return undefined;
    return {
      ...made,
      digest: `sha256:${createHash("sha256").update(made.bytes).digest("hex")}`,
    };
  }
  return undefined;
}

/**
 * How long the shot was declared to run.
 *
 * An element may say so itself, or point at something that does - a Source that
 * estimates its own speech names that estimate rather than repeating a number.
 */
function declaredSeconds(source: CompiledSource, placement: Placement): number | undefined {
  const own = Number(placement.attributes.duration);
  if (Number.isFinite(own) && own > 0) return own;
  for (const path of placement.references) {
    const referenced = source.exports.find((item) => item.name === path);
    if (referenced === undefined) continue;
    const value = inlineRecord(source.compiled, referenced.ref) as Record<string, unknown> | undefined;
    for (const key of ["seconds", "durationSec", "secondsExact"]) {
      const held = Number(value?.[key]);
      if (Number.isFinite(held) && held > 0) return held;
    }
  }
  return undefined;
}

/** Bytes already in hand for an output, if the Source read them at compile time. */
function pictureFor(source: CompiledSource, ref: string): Uint8Array | undefined {
  const value = inlineRecord(source.compiled, ref) as { digest?: string } | undefined;
  const digest = value?.digest ?? blobDigest(source.compiled, ref);
  return digest === undefined ? undefined : source.served.get(digest)?.bytes;
}

/** A Record stored as the blob it is, rather than wrapped. */
function blobDigest(compiled: unknown, id: string): string | undefined {
  const records = (compiled as { module: { records: readonly { id: string; value: { kind: string; digest?: string } }[] } })
    .module.records;
  const found = records.find((record) => record.id === id);
  return found?.value.kind === "blob" ? found.value.digest : undefined;
}

/** Whether an export is something the graph produces rather than a Record read from the Source. */
function isOutput(source: CompiledSource, ref: string): boolean {
  const compiled = source.compiled as unknown as {
    exports: readonly { ref: { kind: string; id: string } }[];
  };
  return compiled.exports.find((item) => item.ref.id === ref)?.ref.kind === "logical-output";
}

/** The declared Type of an export, as the compiler recorded it. */
function outputType(source: CompiledSource, ref: string): unknown {
  const compiled = source.compiled as unknown as {
    exports: readonly { ref: { id: string }; type: unknown }[];
  };
  return compiled.exports.find((item) => item.ref.id === ref)?.type;
}
