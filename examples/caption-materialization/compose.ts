import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  appendCaptionHiddenOverride,
  appendCaptionStyleOverride,
  assertCaptionNlePayload,
  createCaptionNleMaterializationForMediaItem,
  createCaptionPresentation,
  type CaptionDocument,
  type CaptionPresentation,
  type CaptionStyle,
} from "@hypit/caption";
import type { Narrative, NarrativeSegmentRef } from "@hypit/narrative";
import { projectNarrativeCaptionTiming, type NarrativeCaptionBinding } from "@hypit/narrative-caption";
import { alignNarrative } from "@hypit/narrative-speech-alignment";
import { createNarrativeLocalTiming } from "@hypit/narrative-temporal";
import {
  applyNleTransaction,
  createNleProject,
  nleLinearSourceTime,
  serializeNleProject,
  type NleProject,
} from "@hypit/nle";
import { parseScript, projectScript } from "@hypit/script";
import { timedTranscript } from "@hypit/timed-transcript";
import {
  addExactTemporalValues,
  exactTemporalValue,
  sealLocalTemporalDomain,
  type ExactTemporalValue,
} from "@hypit/temporal/algebra";

const at = (seconds: number): ExactTemporalValue => exactTemporalValue({
  numerator: BigInt(seconds), denominator: 1n,
});

const baseStyle: CaptionStyle = { id: "base", family: "basic", parameters: {
  color: "#ffffff", background: "#000000cc", fontSize: 44,
  karaoke: { mode: "trail", transition: "wipe", activeColor: "#ffd54a" },
} };
const aliceStyle: CaptionStyle = { id: "alice", family: "basic", parameters: {
  color: "#7dd3fc", background: "#082f49dd", fontSize: 46,
  karaoke: { mode: "trail", transition: "wipe", activeColor: "#fef08a" },
} };
const bobStyle: CaptionStyle = { id: "bob", family: "basic", parameters: {
  color: "#f0abfc", background: "#4a044edd", fontSize: 46,
  karaoke: { mode: "current", transition: "step", activeColor: "#86efac" },
} };
const warningStyle: CaptionStyle = { id: "warning", family: "basic", parameters: {
  color: "#ffffff", background: "#b91c1c", fontSize: 54, fontWeight: 800,
  karaoke: { mode: "trail", transition: "wipe", activeColor: "#fde047" },
} };

function cueText(document: CaptionDocument, cueId: string): string {
  const cue = document.cues.find((candidate) => candidate.id === cueId)!;
  const selected = new Set(cue.unitIds);
  return document.words.filter((word) => selected.has(word.unitId))
    .map((word) => `${word.separatorBefore}${word.text}`).join("");
}

function cueContaining(document: CaptionDocument, text: string): string {
  const cue = document.cues.find((candidate) => cueText(document, candidate.id).includes(text));
  if (cue === undefined) throw new Error(`Example Script has no Cue containing ${text}.`);
  return cue.id;
}

function presentation(document: CaptionDocument): CaptionPresentation {
  const roles = appendCaptionStyleOverride(appendCaptionStyleOverride(
    createCaptionPresentation(baseStyle),
    { id: "alice-role", selector: { roles: ["ALICE"] } }, aliceStyle,
  ), { id: "bob-role", selector: { roles: ["BOB"] } }, bobStyle);
  const special = appendCaptionStyleOverride(roles, {
    id: "warning-cue", selector: { cues: [cueContaining(document, "警告")] },
  }, warningStyle);
  return appendCaptionHiddenOverride(special, {
    id: "hidden-cue", selector: { cues: [cueContaining(document, "默认不显示")] },
  });
}

function transcriptForSegment(narrative: Narrative, excerpt: NarrativeSegmentRef) {
  const tokens = narrative.tokens.slice(excerpt.tokenStart, excerpt.tokenEndExclusive);
  const words = tokens.map((token, index) => ({
    word: token.text,
    start: index,
    end: index + 0.8,
  }));
  return {
    duration: at(tokens.length),
    transcript: timedTranscript("zh", [{
      start: 0,
      end: tokens.length,
      text: tokens.map((token) => token.text).join(""),
      words,
    }]),
  };
}

function addTracks(project: NleProject): NleProject {
  return applyNleTransaction(project, { revision: project.revision, commands: [{
    kind: "track.add",
    track: { id: "picture", name: "A-roll", kind: "picture", locked: false, muted: false, items: [] },
  }, {
    kind: "track.add",
    track: { id: "captions", name: "Captions", kind: "picture", locked: false, muted: false, items: [] },
  }] });
}

/**
 * One ordinary project program holds every transient name. The returned NLE contains only direct
 * media, Caption Components, exact programme times and Item-local Unit timing.
 */
export async function buildCaptionMaterializationExample(): Promise<{
  readonly project: NleProject;
  readonly document: CaptionDocument;
  readonly presentation: CaptionPresentation;
}> {
  const scriptUrl = new URL("./story.script", import.meta.url);
  const parsed = parseScript(scriptUrl.pathname, await readFile(scriptUrl, "utf8"));
  const narrativeId = "story";
  const script = projectScript(parsed, narrativeId);
  const narrative: Narrative = script.narrative;
  const document = script.caption.document;
  const binding: NarrativeCaptionBinding = script.caption.binding;
  const resolvedPresentation = presentation(document);

  let project = addTracks(createNleProject({
    id: "caption-materialization-example",
    name: "Complete Caption materialization",
    editRate: { numerator: 30, denominator: 1 },
    canvas: { width: 1920, height: 1080, clearColor: "#111827" },
  }));
  let programmeAt = at(0);

  for (const parsedSegment of parsed.segments) {
    const excerpt: NarrativeSegmentRef = script.segments.find((segment) => segment.id === parsedSegment.id)!;
    const { duration, transcript } = transcriptForSegment(narrative, excerpt);
    const domain = sealLocalTemporalDomain({ id: `${parsedSegment.id}:media-time`, duration });
    const mediaId = `media:${parsedSegment.id}`;
    const itemId = `aroll:${parsedSegment.id}`;
    project = applyNleTransaction(project, { revision: project.revision, commands: [{
      kind: "media.add",
      media: { id: mediaId, name: `${parsedSegment.id} A-roll`, asset: {
        path: `media/${parsedSegment.id}.media.json`,
      } },
    }, {
      kind: "item.add",
      track: "picture",
      item: {
        id: itemId,
        kind: "media",
        media: mediaId,
        start: programmeAt,
        duration,
        sourceTime: nleLinearSourceTime(duration),
        enabled: true,
        picture: { layout: { x: 0, y: 0, width: 1920, height: 1080, fit: "cover" }, effects: [] },
      },
    }] });

    const alignment = alignNarrative(narrative, excerpt, domain, transcript);
    const localTiming = createNarrativeLocalTiming(
      `${parsedSegment.id}:narrative-time`, narrativeId, domain, [alignment],
    );
    const segmentTokens = new Set(narrative.tokens
      .slice(excerpt.tokenStart, excerpt.tokenEndExclusive).map((token) => token.id));
    const unitIds = binding.units.filter((unit) =>
      unit.sourceTokenIds.every((tokenId) => segmentTokens.has(tokenId))).map((unit) => unit.unitId);
    const captionTiming = projectNarrativeCaptionTiming(document, binding, localTiming, {
      documentId: document.id,
      unitIds,
    });
    const captionTransaction = createCaptionNleMaterializationForMediaItem(project, {
      id: `captions:${parsedSegment.id}`,
      mediaItem: itemId,
      track: "captions",
      document,
      timing: captionTiming,
      presentation: resolvedPresentation,
      selection: { kind: "units", ids: unitIds },
      itemId: (cueId, occurrence) => `caption:${cueId}:${occurrence + 1}`,
      picture: { layout: { x: 120, y: 760, width: 1680, height: 250, fit: "fill" }, effects: [] },
    });
    project = applyNleTransaction(project, captionTransaction);
    programmeAt = addExactTemporalValues(programmeAt, duration);
  }

  for (const item of project.tracks.find((track) => track.id === "captions")!.items) {
    if (item.kind !== "component") throw new Error(`Caption Track contains non-Component Item ${item.id}.`);
    const parameters = item.parameters as Record<string, unknown>;
    assertCaptionNlePayload(parameters.caption, item.duration);
  }
  return { project, document, presentation: resolvedPresentation };
}

export async function serializeCaptionMaterializationExample(): Promise<string> {
  return serializeNleProject((await buildCaptionMaterializationExample()).project);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(await serializeCaptionMaterializationExample());
}
