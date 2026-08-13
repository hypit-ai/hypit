import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { relative } from "node:path";

import {
  closeDocument,
  discoverMarkup,
  parseOpeningTag,
  parseStructuredElement,
  skipTextTrivia,
} from "@narratage/markup";
import type { MarkupImportRequest, SourceUnit, StructuredElement } from "@narratage/markup";
import type { VisualTrack } from "@narratage/composition";
import { filmAppearanceFromRecipe } from "@narratage/film";
import type { ProgramSpace } from "@narratage/program-space";
import type { CompleteSemanticMap } from "@narratage/semantic-map";
import type { CanvasSpace } from "@narratage/spatial";
import type { SvsRecipe } from "@narratage/svs";

import { artifactPath } from "../build/artifacts.js";
import { readBuild } from "../build/state.js";
import { renderPreview } from "../preview/render.js";

import type { PlaygroundSnapshot, Range, SourceElement, Track } from "../shared.js";
import { optionalText, referencePath, text } from "./attributes.js";
import { interpretMediaTrack } from "./media.js";
import { Scope } from "./scope.js";
import {
  interpretCaptionProgram,
  interpretCaptionStyle,
  interpretCaptionTrack,
  interpretFontStack,
} from "./caption.js";
import type { ServedFile } from "./caption.js";
import { collectMaterial } from "./material.js";
import { readRunSource } from "./run.js";
import { interpretScript, markerRanges } from "./script.js";
import type { ScriptResult } from "./script.js";
import {
  interpretAnchoredFrame,
  interpretAspectFrame,
  interpretCanvas,
  interpretFrame,
} from "./spatial.js";
import { interpretSpine, spineFrameRate } from "./speech.js";
import { loadSourceImports, maskedSourceHeader } from "./svs.js";
import { estimateTiming } from "./timing.js";

/**
 * Tags this preview interprets, keyed by the module that declares them. Anything
 * else an author imports is skipped and reported rather than failing the read:
 * a Source is worth previewing even when most of it is produced by Providers.
 */
const INTERPRETED: Readonly<Record<string, readonly string[]>> = {
  "@narratage/script": ["script"],
  "@narratage/spatial": ["Canvas", "Frame", "AnchoredFrame", "AspectFrame"],
  "@narratage/speech-spine": ["Spine"],
  "@narratage/media-track": ["Track"],
  "@narratage/film": ["Film"],
  "@narratage/fonts-open": ["Stack"],
  "@narratage/caption-fine": ["Style", "Track"],
  "@narratage/caption": ["Program"],
};

/** Script is the only Raw Surface in the language, so it is the only special case. */
const RAW_TAGS = new Set(["script"]);

type Bound = { readonly module: string; readonly tag: string; readonly raw: boolean };

function moduleName(specifier: string): string {
  const at = specifier.lastIndexOf("@");
  return at > 0 ? specifier.slice(0, at) : specifier;
}

/** Derive the tag table from the Import Prologue, exactly as the frontend does. */
function tagTable(imports: readonly MarkupImportRequest[]): ReadonlyMap<string, Bound> {
  const table = new Map<string, Bound>();
  for (const request of imports) {
    if (request.kind !== "module") continue;
    const module = moduleName(request.from);
    for (const tag of INTERPRETED[module] ?? []) {
      const qualified = request.alias === undefined ? tag : `${request.alias}:${tag}`;
      table.set(qualified, { module, tag, raw: RAW_TAGS.has(tag) });
    }
  }
  return table;
}

type Classified = {
  readonly bound: Bound | undefined;
  readonly element: StructuredElement;
};

export type InterpretOptions = {
  readonly source: string;
  readonly revision: number;
  /** Base the displayed path is shown relative to. Defaults to the process cwd. */
  readonly root?: string;
  /** A Run Source, read for material it already names. */
  readonly run?: string;
};

/** Where the picture's bytes come from, resolved alongside the snapshot. */
export type PreviewSource = { readonly path: string; readonly mediaType: string };

export type { ServedFile } from "./caption.js";

export type Interpretation = {
  readonly snapshot: PlaygroundSnapshot;
  /** Present when the picture is a real file rather than a synthetic document. */
  readonly video?: PreviewSource;
  /** Material the composition references, by digest, for the artifact route. */
  readonly material: ReadonlyMap<string, ServedFile>;
};

/**
 * A value a Run Source satisfied an Output with, when it is the contract the
 * caller expects. A file that is unreadable or the wrong shape is ignored: a
 * wrong measured timeline is worse than an openly estimated one.
 */
function suppliedValue(
  run: { readonly values: readonly { readonly output: string; readonly path: string }[] } | undefined,
  output: string,
  contract: string,
): unknown {
  const supplied = run?.values.find((item) => item.output === output);
  if (supplied === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(readFileSync(supplied.path, "utf8"));
    return typeof value === "object" && value !== null
      && (value as { contract?: unknown }).contract === contract
      ? value
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * A value an earlier build accepted, when a Run Source names it with
 * `<build-record>`. Reusing a prior alignment is the ordinary way to read a
 * measured timeline while the Source itself is still being edited.
 */
function reusedValue(
  source: string,
  run: { readonly reused: readonly { readonly output: string; readonly build: string; readonly from: string }[] } | undefined,
  output: string,
  contract: string,
): unknown {
  const named = run?.reused.find((item) => item.output === output);
  if (named === undefined) return undefined;
  const value = readBuild(source, named.build)?.named(named.from);
  return typeof value === "object" && value !== null
    && (value as { contract?: unknown }).contract === contract
    ? value
    : undefined;
}

/**
 * Run one element's interpretation, naming the element if it fails.
 *
 * A domain error says what is wrong — a Frame with no width, a Recipe missing a
 * property — but not which of a dozen elements said it. The range is what lets
 * the code pane point at the line instead of leaving an author to search.
 */
function attributed<T>(element: StructuredElement, run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (typeof error === "object" && error !== null && "range" in error) throw error;
    throw Object.assign(
      new Error(`<${element.name}> ${error instanceof Error ? error.message : String(error)}`),
      { range: element.range },
    );
  }
}

function digestOfText(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function summarize(element: StructuredElement, ordinal: number): SourceElement {
  return {
    id: optionalText(element, "id") ?? `#${ordinal}`,
    tag: element.name,
    range: element.range,
    children: element.children.filter((child) => child.kind === "element").map((child) => {
      const item = child as StructuredElement;
      const id = optionalText(item, "id");
      return { tag: item.name, range: item.range, ...(id === undefined ? {} : { id }) };
    }),
  };
}

/**
 * Read one `.svml` file as a timeline.
 *
 * This is a shallow interpreter, not the compiler: it walks the authored markup
 * and calls each package's own pure projection functions with a timing map it
 * either read from a completed build or estimated from the Script text. It never
 * elaborates the graph, never resolves a package lock and never runs a Provider,
 * so it works on a directory holding nothing but a Source and its style sheet.
 */
export async function interpretSource(options: InterpretOptions): Promise<Interpretation> {
  const original = readFileSync(options.source, "utf8");
  // Blank the Source Header in place so every reported offset still indexes the
  // file the author is reading.
  const masked = maskedSourceHeader(original);
  const unit: SourceUnit = { name: options.source, text: masked };

  const discovery = discoverMarkup(unit);
  const table = tagTable(discovery.imports);
  const scope = new Scope();
  loadSourceImports(options.source, discovery.imports, scope);

  const elements: SourceElement[] = [];
  const unsupported: PlaygroundSnapshot["unsupported"][number][] = [];
  const deferred: Classified[] = [];
  let script: ScriptResult | undefined;
  let clearColor = "#000000";
  let canvas: CanvasSpace | undefined;
  const fontStacks: StructuredElement[] = [];
  const captionStyles: StructuredElement[] = [];
  const captionPrograms: StructuredElement[] = [];
  const served = new Map<string, ServedFile>();

  // Pass one: everything whose meaning does not depend on the timeline. Spatial
  // Frames resolve against earlier Frames, so document order is preserved.
  let cursor = discovery.bodyStart;
  let ordinal = 0;
  while (cursor < masked.length) {
    cursor = skipTextTrivia(unit, cursor);
    if (masked.startsWith("</", cursor)) {
      closeDocument(unit, cursor);
      break;
    }
    if (masked[cursor] !== "<") {
      throw Object.assign(new Error("Natural-language text is not allowed directly under <svml>."), {
        range: { start: cursor, end: cursor + 1 } satisfies Range,
      });
    }
    const opening = parseOpeningTag(unit, cursor);
    const bound = table.get(opening.name);
    ordinal += 1;

    if (bound?.raw === true) {
      if (script !== undefined) {
        throw Object.assign(new Error("The preview interprets one <script> per Source."), {
          range: { start: opening.start, end: opening.end } satisfies Range,
        });
      }
      script = attributed(
        { ...opening, kind: "element", children: [], range: { start: opening.start, end: opening.end } },
        () => interpretScript(
          options.source, masked, opening.name, opening.start, opening.end, opening.attributes, scope,
        ),
      );
      elements.push({
        id: script.map.recordId,
        tag: opening.name,
        range: script.map.range,
        children: [],
      });
      cursor = script.nextOffset;
      continue;
    }

    // Unknown structured tags are still parsed rather than scanned for, so
    // same-named nested children cannot desynchronize the walk.
    const parsed = parseStructuredElement(unit, cursor);
    cursor = parsed.nextOffset;
    elements.push(summarize(parsed.element, ordinal));

    if (bound === undefined) {
      unsupported.push({ tag: parsed.element.name, range: parsed.element.range });
      continue;
    }
    if (bound.tag === "Canvas") {
      // The first authored Canvas is the preview's viewport; later ones are
      // still bound so Frames can resolve against them.
      const resolved = attributed(parsed.element, () => interpretCanvas(parsed.element, scope));
      canvas ??= resolved;
      continue;
    }
    if (bound.tag === "Frame") {
      attributed(parsed.element, () => interpretFrame(parsed.element, scope));
      continue;
    }
    if (bound.tag === "Stack") { fontStacks.push(parsed.element); continue; }
    if (bound.tag === "Style") { captionStyles.push(parsed.element); continue; }
    if (bound.tag === "Program") { captionPrograms.push(parsed.element); continue; }
    if (bound.tag === "AnchoredFrame") {
      attributed(parsed.element, () => interpretAnchoredFrame(parsed.element, scope));
      continue;
    }
    if (bound.tag === "AspectFrame") {
      attributed(parsed.element, () => interpretAspectFrame(parsed.element, scope));
      continue;
    }
    if (bound.tag === "Film") {
      const path = referencePath(parsed.element, "appearance");
      if (path !== undefined) {
        const recipe = scope.require(path, `${parsed.element.name}.appearance`).value as SvsRecipe;
        clearColor = filmAppearanceFromRecipe(recipe.properties).clearColor;
      }
      continue;
    }
    deferred.push({ bound, element: parsed.element });
  }

  if (script === undefined) throw new Error("The preview requires a <script> to derive a timeline from.");

  // Fonts first: a Caption Style names a Stack, and the Stack owns the exact
  // faces the picture has to draw with.
  for (const element of fontStacks) {
    await attributed(element, async () => interpretFontStack(element, scope, served));
  }
  for (const element of captionStyles) attributed(element, () => interpretCaptionStyle(element, scope));
  for (const element of captionPrograms) {
    const { ignored } = attributed(element, () => interpretCaptionProgram(element, scope));
    // A Style Application changes which words are visible, so dropping one
    // silently would draw a Caption the Source does not describe.
    for (const child of ignored) unsupported.push({ tag: child, range: element.range });
  }

  // A Source with no Speech Spine has no frame domain of its own, and a Source
  // with no Canvas has nowhere to draw. Neither is a reason to refuse to read
  // it: the Script, its markers and the code are still worth seeing, and an
  // empty timeline is a true statement about a Source that declares no Tracks.
  const spine = deferred.find((item) => item.bound?.tag === "Spine");
  const missing: string[] = [];
  if (spine === undefined) missing.push("no Speech Spine, so the frame rate is assumed");
  if (canvas === undefined) missing.push("no Canvas, so there is nothing to draw");

  // Pass two: the timeline. Both Track families read the same map, so the base
  // track and the overlays can never disagree about where a Segment sits.
  // A completed build has already measured what the estimator can only guess.
  // Both are needed together: a measured map against an estimated frame domain
  // would place every span against the wrong ruler.
  const build = readBuild(options.source);
  const run = options.run === undefined ? undefined : readRunSource(options.run);
  if (options.run !== undefined && existsSync(options.run) && run === undefined) {
    missing.push("a Run Source that could not be read, so nothing it names was used");
  }
  // A Run Source can name the timing itself, which is the only way to read a
  // measured timeline without a build of this Source having run.
  const givenMap = suppliedValue(run, "timing.map", "svml.complete-semantic-map@1");
  const givenSpace = suppliedValue(run, "speech.space", "svml.program-space@1");
  const suppliedMap = givenMap
    ?? reusedValue(options.source, run, "timing.map", "svml.complete-semantic-map@1");
  const suppliedSpace = givenSpace
    ?? reusedValue(options.source, run, "speech.space", "svml.program-space@1");
  // Where a measured timeline came from is worth saying precisely: a value on
  // disk and a prior build's record are different claims about the same number.
  const reusedBuild = run?.reused.find((item) => item.output === "timing.map")?.build;
  const measured = (build?.map !== undefined && build.space !== undefined)
    || (suppliedMap !== undefined && suppliedSpace !== undefined);
  const { map, space } = build?.map !== undefined && build.space !== undefined
    ? { map: build.map, space: build.space }
    : suppliedMap !== undefined && suppliedSpace !== undefined
      ? { map: suppliedMap as CompleteSemanticMap, space: suppliedSpace as ProgramSpace }
      : estimateTiming(
        script.parsed,
        spine === undefined
          ? { numerator: 30, denominator: 1 }
          : attributed(spine.element, () => spineFrameRate(spine.element)),
      );
  const markers = markerRanges(script.map);
  const timedTokens = new Map(map.tokens.map((token) => [token.tokenId, token]));
  // Material an author already has, resolved against the program's frame
  // domain so each Item can show real frames or a box, one at a time.
  const material = collectMaterial(run?.files ?? [], space);
  const appearancePath = spine === undefined
    ? undefined
    : referencePath(spine.element, "visual-appearance");
  const spineAppearance = appearancePath === undefined
    ? undefined
    : scope.require(appearancePath, "speech Spine visual-appearance").value as SvsRecipe;
  const tracks: Track[] = [];
  const base: VisualTrack[] = [];
  const overlays: VisualTrack[] = [];
  let captions: { readonly cues: number; readonly evenlyDivided: number } | undefined;
  // The Spine carries the speech, so it is the Track a preview lets sound.
  let spineId: string | undefined;

  for (const item of deferred) {
    if (item.bound!.tag === "Spine") {
      if (canvas === undefined) {
        throw Object.assign(
          new Error("A Speech Spine needs a <space:Canvas> to place its Takes in."),
          { range: item.element.range },
        );
      }
      const realized = attributed(item.element, () => interpretSpine(
        item.element, scope, canvas!, map, space, markers.segment, material, spineAppearance,
      ));
      spineId = realized.id;
      tracks.push({ id: realized.id, label: "file", kind: "speech", row: 1, clips: realized.clips });
      base.push(realized.visual);
      continue;
    }
    if (item.bound!.module === "@narratage/caption-fine") {
      const realized = attributed(item.element, () => interpretCaptionTrack(item.element, scope, map, space));
      captions = realized;
      overlays.push(realized.visual);
      continue;
    }
    const realized = attributed(item.element, () =>
      interpretMediaTrack(item.element, scope, map, space, markers, material));
    tracks.push({ id: realized.id, label: text(item.element, "id"), kind: "media", row: 0, clips: realized.clips });
    overlays.push(realized.visual);
  }

  const frameCount = Math.round(space.durationSec * space.frameRate.numerator / space.frameRate.denominator);
  // The picture is as real as its elements are, which is rarely all or nothing.
  const placeable = tracks.flatMap((track) => track.clips);
  const shown = placeable.filter((clip) => !clip.placeholder).length;

  // The picture, best available first: a render this build produced, then a file
  // the Run Source already names, then the synthetic composition.
  const provided = run?.files.find((file) =>
    file.mediaType.startsWith("video/") && run.targets.includes(file.output));
  const rendered = build?.video === undefined
    ? undefined
    : artifactPath(build.artifactRoot, build.video.digest);
  const video: PreviewSource | undefined = rendered !== undefined && existsSync(rendered)
    ? { path: rendered, mediaType: build!.video!.mediaType }
    : provided === undefined ? undefined : { path: provided.path, mediaType: provided.mediaType };

  const snapshot: PlaygroundSnapshot = {
    revision: options.revision,
    mode: video === undefined ? "synthetic" : "real",
    source: {
      path: relative(options.root ?? process.cwd(), options.source),
      // The unmasked text, so the code pane shows the Source Header the author wrote.
      text: original,
      digest: digestOfText(original),
    },
    elements,
    script: {
      ...script.map,
      // Join where each token is written to where it lands on the timeline.
      // A token the map does not time is dropped rather than placed at zero.
      tokens: script.map.tokens.flatMap((token) => {
        const timed = timedTokens.get(token.id);
        return timed === undefined
          ? []
          : [{ ...token, startFrame: timed.startFrame, endFrame: timed.endFrame }];
      }),
    },
    space: {
      canvasWidth: canvas?.widthPx ?? 1080,
      canvasHeight: canvas?.heightPx ?? 1920,
      clearColor,
      frameRate: { ...space.frameRate },
      frameCount,
      durationSec: space.durationSec,
    },
    tracks: tracks.sort((left, right) => left.row - right.row),
    preview: video === undefined
      ? {
        kind: "hyperframes",
        srcdoc: renderPreview({
          id: "svml-playground",
          // With no authored Canvas there is no shape to honour, so the frame is
          // the common vertical one and visibly empty.
          canvas: { width: canvas?.widthPx ?? 1080, height: canvas?.heightPx ?? 1920, clearColor },
          space,
          tracks: [...base, ...overlays],
          ...(spineId === undefined ? {} : { audibleTrack: spineId }),
          served: new Set([...material.files.keys(), ...served.keys()]),
        }),
      }
      : {
        kind: "video",
        url: "/__svml/video",
        mediaType: video.mediaType,
        // Real material stands in for the base track only. The Tracks above it
        // were never rendered into that file, so they are composited over it on
        // a transparent canvas rather than silently dropped.
        overlay: renderPreview({
          id: "svml-playground-overlay",
          canvas: { width: canvas?.widthPx ?? 1, height: canvas?.heightPx ?? 1, clearColor: "#00000000" },
          space,
          tracks: overlays,
          served: new Set([...material.files.keys(), ...served.keys()]),
        }),
      },
    provenance: {
      timing: measured ? "measured" : "estimated",
      picture: shown === 0 ? "estimated" : shown === placeable.length ? "measured" : "partial",
      note: [
        measured
          ? build?.map !== undefined && build.space !== undefined
            ? `Timings read from build ${build.buildId}.`
            : givenMap !== undefined
              ? "Timings read from a value the Run Source supplied."
              : `Timings reused from build ${reusedBuild ?? "an earlier run"}.`
          : "No build found: timings estimated from Script text at normal delivery pace.",
        video !== undefined
          ? "The picture is a rendered programme."
          : `${shown} of ${placeable.length} elements show real material.`,
        // Cue times come from the same map as everything else, so they are as
        // good as the timing above. Only Atoms with no spoken token left to
        // place fall back to dividing their Cue evenly.
        missing.length === 0 ? undefined : `This Source has ${missing.join(" and ")}.`,
        captions === undefined
          ? undefined
          : `${captions.cues} Caption Cues timed from the same map`
            + (captions.evenlyDivided === 0
              ? "."
              : `, except ${captions.evenlyDivided} Atoms with no spoken token, which divide their Cue evenly.`),
      ].filter(Boolean).join(" "),
    },
    refused: material.refusals,
    unsupported,
  };
  const bytes = new Map<string, ServedFile>([...material.files, ...served]);
  return { snapshot, material: bytes, ...(video === undefined ? {} : { video }) };
}
