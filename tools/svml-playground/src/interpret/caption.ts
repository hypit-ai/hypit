import { createHash } from "node:crypto";

import { resolveCaptionProgram } from "@narratage/caption";
import type { CaptionProgram, CaptionStyleIntent, TimedCaptionProjection } from "@narratage/caption";
import { captionTypes } from "@narratage/caption";
import { fineCaptionStyle, renderFineCaption } from "@narratage/caption-fine";
import type { VisualTrack } from "@narratage/composition";
import { decodeOpenFontStackSurface } from "@narratage/fonts-open";
import type { StructuredElement } from "@narratage/markup";
import type { FontStackRef } from "@narratage/media";
import type { CaptionCorrespondence, CaptionDisplaySequence } from "@narratage/narrative";
import type { Digest } from "@narratage/protocol";
import type { ProgramSpace } from "@narratage/program-space";
import type { CompleteSemanticMap } from "@narratage/semantic-map";
import type { SvsRecipe } from "@narratage/svs";

import { requireReferencePath, text } from "./attributes.js";
import { Scope } from "./scope.js";

/**
 * Something the Playground serves on the composition's behalf. Font faces
 * arrive as bytes the Surface already read; material stays a path so a long
 * video is never held in memory.
 */
export type ServedFile =
  | { readonly mediaType: string; readonly path: string; readonly bytes?: undefined }
  | { readonly mediaType: string; readonly bytes: Uint8Array; readonly path?: undefined };

/**
 * Decode `<fonts:Stack>` with the package's own Surface handler.
 *
 * The handler wants an asset resolver, which in a build hashes bytes into the
 * Artifact store. Here it registers the file for the preview to serve, so the
 * exact face an author chose is the face the picture uses.
 */
export async function interpretFontStack(
  element: StructuredElement,
  scope: Scope,
  served: Map<string, ServedFile>,
): Promise<void> {
  const output = await decodeOpenFontStackSurface({
    sourceName: "svml-playground",
    element,
    resolveReference: () => undefined,
    resolveAsset: (request) => {
      const bytes = request.bytes ?? new Uint8Array();
      const digest: Digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
      // `from` is `package:@narratage/fonts-open/<family>/<file>`; the bytes are
      // already in hand, so they are cached rather than read again.
      served.set(digest, { mediaType: request.mediaType ?? "font/woff2", bytes });
      return { artifact: { kind: "blob", digest, size: bytes.byteLength, mediaType: request.mediaType ?? "font/woff2" } };
    },
  });
  for (const record of output.records) {
    if (record.value.kind === "inline") scope.define(record.id, record.type, record.value.value, record.range);
  }
}

/**
 * Build the Caption Program a Track reads.
 *
 * `<caption:Program>` is where an author says which Style each run of words is
 * set in. Style Applications and Mutes are read but not applied — they change
 * which words are visible, and quietly dropping them would show a Caption the
 * Source does not describe, so they are reported instead.
 */
export function interpretCaptionProgram(
  element: StructuredElement,
  scope: Scope,
): { readonly program: CaptionProgram; readonly ignored: readonly string[] } {
  const id = text(element, "id");
  const display = scope.require(
    requireReferencePath(element, "display"), `${element.name}.display`,
  ).value as CaptionDisplaySequence;
  const style = scope.require(
    requireReferencePath(element, "default"), `${element.name}.default`,
  ).value as CaptionStyleIntent;
  const ignored = element.children
    .filter((child): child is StructuredElement => child.kind === "element")
    .map((child) => child.name);
  const program = resolveCaptionProgram(display, id, style, [], []);
  scope.define(id, captionTypes.program, program, element.range);
  return { program, ignored };
}

export function interpretCaptionStyle(element: StructuredElement, scope: Scope): CaptionStyleIntent {
  const id = text(element, "id");
  const recipe = scope.require(
    requireReferencePath(element, "recipe"), `${element.name}.recipe`,
  ).value as SvsRecipe;
  const stack = scope.require(
    requireReferencePath(element, "font"), `${element.name}.font`,
  ).value as FontStackRef;
  const style = fineCaptionStyle(id, recipe, stack.faces);
  scope.define(id, { module: { name: "@narratage/caption", version: "1" }, name: "CaptionStyle" }, style, element.range);
  return style;
}

/**
 * Time the Caption cues against the same map the Tracks read.
 *
 * Cue boundaries are the Style's own word bounds, and each Atom is placed by the
 * Script tokens it corresponds to — so with a measured map the captions land on
 * measured speech, and with an estimated one they land on the estimate rather
 * than on a second, unrelated guess. Atoms with no corresponding token (display
 * text that is never spoken) divide their Cue evenly, which is the only honest
 * thing left to do with them.
 */
export function timeCaptionCues(
  display: CaptionDisplaySequence,
  correspondence: CaptionCorrespondence,
  program: CaptionProgram,
  map: CompleteSemanticMap,
  space: ProgramSpace,
): { readonly projection: TimedCaptionProjection; readonly evenlyDivided: number } {
  const tokens = new Map(map.tokens.map((token) => [token.tokenId, token]));
  const sources = new Map(correspondence.atoms.map((atom) => [atom.atomId, atom.sourceTokenIds]));
  const atomsById = new Map(display.atoms.map((atom) => [atom.id, atom]));
  const duration = space.durationSec;

  const window = (atomId: string): { start: number; end: number } | undefined => {
    const timed = (sources.get(atomId) ?? []).map((id) => tokens.get(id)).filter((item) => item !== undefined);
    if (timed.length === 0) return undefined;
    return { start: timed[0]!.startSec, end: timed.at(-1)!.endSec };
  };

  const cues: TimedCaptionProjection["cues"][number][] = [];
  let evenlyDivided = 0;

  for (const run of program.runs) {
    const style = program.styles.find((item) => item.id === run.styleId)!;
    const maximum = style.planning.cue.maximumWords;
    // One Atom is indivisible, so a Cue takes whole Atoms until it would exceed
    // the Style's word bound.
    const ordered: string[] = [];
    for (const wordId of run.wordIds) {
      const atom = display.atoms.find((item) => item.wordIds.includes(wordId));
      if (atom !== undefined && ordered.at(-1) !== atom.id) ordered.push(atom.id);
    }
    const groups: string[][] = [];
    for (const atomId of ordered) {
      const group = groups.at(-1);
      const words = group?.reduce((sum, id) => sum + (atomsById.get(id)?.wordIds.length ?? 0), 0) ?? 0;
      const next = atomsById.get(atomId)?.wordIds.length ?? 0;
      if (group === undefined || (words > 0 && words + next > maximum)) groups.push([atomId]);
      else group.push(atomId);
    }

    for (const group of groups) {
      const windows = group.map((atomId) => window(atomId));
      const known = windows.filter((item) => item !== undefined);
      const start = known[0]?.start ?? cues.at(-1)?.endSec ?? 0;
      const end = known.at(-1)?.end ?? Math.min(duration, start + group.length);
      if (known.length < group.length) evenlyDivided += group.length - known.length;
      const step = (end - start) / Math.max(1, group.length);
      cues.push({
        id: `caption:cue:${cues.length + 1}`,
        runId: run.id,
        styleId: run.styleId,
        segmentId: atomsById.get(group[0]!)!.segmentId,
        startSec: start,
        endSec: Math.max(end, start + 1 / (space.frameRate.numerator / space.frameRate.denominator)),
        atoms: group.map((atomId, index) => {
          const known_ = windows[index];
          return {
            atomId,
            startSec: known_?.start ?? start + step * index,
            endSec: known_?.end ?? start + step * (index + 1),
          };
        }),
        fields: [],
      });
    }
  }
  return {
    projection: { contract: "svml.timed-caption-projection@1", displaySequenceId: display.id, cues },
    evenlyDivided,
  };
}

export type CaptionTrack = {
  readonly visual: VisualTrack;
  readonly cues: number;
  readonly evenlyDivided: number;
};

export function interpretCaptionTrack(
  element: StructuredElement,
  scope: Scope,
  map: CompleteSemanticMap,
  space: ProgramSpace,
): CaptionTrack {
  const display = scope.require(
    requireReferencePath(element, "display"), `${element.name}.display`,
  ).value as CaptionDisplaySequence;
  const correspondence = scope.require(
    requireReferencePath(element, "correspondence"), `${element.name}.correspondence`,
  ).value as CaptionCorrespondence;
  // The Track names a Program, which a Style alone is not: the Program is where
  // the Source said which words are set in which Style.
  const program = scope.require(
    requireReferencePath(element, "program"), `${element.name}.program`,
  ).value as CaptionProgram;
  const { projection, evenlyDivided } = timeCaptionCues(display, correspondence, program, map, space);
  return {
    visual: renderFineCaption(projection, program, display, space),
    cues: projection.cues.length,
    evenlyDivided,
  };
}
