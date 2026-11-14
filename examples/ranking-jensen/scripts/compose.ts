import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { CaptionSelection } from "@hypit/caption";
import { audioGainNleSymbol } from "@hypit/audio-gain";
import {
  createCaptionFineNleMaterializationForMediaItem,
  createCaptionPresentation,
  type CaptionStyle,
} from "@hypit/caption-fine";
import {
  parseMediaAssetDocument,
  serializeMediaAssetDocument,
  type MediaAssetDocument,
} from "@hypit/media-asset";
import {
  captionUnitsForNarrativeSelection,
  projectNarrativeCaptionTiming,
} from "@hypit/narrative-caption";
import { alignNarrative, correctTimedTranscript } from "@hypit/narrative-speech-alignment";
import { createNarrativeLocalTiming } from "@hypit/narrative-temporal";
import { selectionTemporalRange } from "@hypit/narrative-temporal";
import {
  IDENTITY_PICTURE_FILTER,
  pictureFilterNleSymbol,
  type PictureFilterState,
} from "@hypit/picture-filter";
import { pictureFrameNleSymbol, type PictureFrameTreatment } from "@hypit/picture-frame";
import {
  IDENTITY_PICTURE_TRANSFORM,
  pictureTransformNleSymbol,
  type PictureTransformState,
} from "@hypit/picture-transform";
import { pictureTransitionNleSymbol } from "@hypit/picture-transition";
import {
  applyNleTransaction,
  createNleProject,
  nleLinearTimeMapping,
  serializeNleProject,
} from "@hypit/nle";
import { createNleTimelineView, serializeNleTimelineView } from "@hypit/nle-view";
import { parseScript, projectScript, scriptSegmentSpeech } from "@hypit/script";
import {
  addExactTemporalValues,
  compareExactTemporalValues,
  exactTemporalZero,
  identityTemporalMap,
  subtractExactTemporalValues,
  type ExactTemporalValue,
  type LocalTemporalDomain,
} from "@hypit/temporal";
import {
  decodeTimedTranscript,
  encodeTimedTranscript,
  timedTranscriptTypes,
} from "@hypit/timed-transcript";
import {
  footballRevealFlashComponentSymbol,
  footballTierBoardComponentSymbol,
  footballTitleComponentSymbol,
} from "@hypit-example/ranking-football-components";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const transcriptTimeBase = 1_000_000;

type Subject = {
  readonly segment: string;
  readonly media: string;
  readonly icon: string;
  readonly label: string;
  readonly tier: "s" | "a" | "b" | "c" | "d";
};

type BrollLayout = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fit: "contain" | "cover" | "fill";
};

type BrollMotion = "pop" | "rise" | "wide";

type BrollSequence = {
  readonly format: "hypit.ranking-jensen-broll-sequence@1";
  readonly behavior: {
    readonly motion: {
      readonly alternating: readonly BrollMotion[];
      readonly wideAspectRatio: number;
      readonly wide: BrollMotion;
    };
  };
  readonly groups: readonly {
    readonly id: string;
    readonly segment: string;
    readonly mode: "accumulate" | "replace";
    readonly transition?: { readonly kind: "crossfade"; readonly frames: number };
    readonly items: readonly {
      readonly id: string;
      readonly selection: string;
      readonly asset: string;
      readonly playback: "hold" | "loop";
      readonly layout: BrollLayout;
      readonly motion?: BrollMotion;
    }[];
  }[];
};

const subjects: readonly Subject[] = [
  { segment: "wife", media: "aroll-wife", icon: "icon-wife", label: "My wife", tier: "d" },
  { segment: "trump", media: "aroll-trump", icon: "icon-trump", label: "Trump", tier: "b" },
  { segment: "kimberly", media: "aroll-kimberly", icon: "icon-kimberly", label: "Kimberly", tier: "c" },
  { segment: "alice", media: "aroll-alice", icon: "icon-alice", label: "Alice", tier: "a" },
  { segment: "jacket", media: "aroll-jacket", icon: "icon-jacket", label: "My jacket", tier: "s" },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assetPath(id: string): string {
  return resolve(projectRoot, "media", id, `${id}.media.json`);
}

function transcriptPath(id: string): string {
  return resolve(projectRoot, "media", id, `${id}.transcript.json`);
}

function portableAssetPath(id: string): string {
  return `media/${id}/${id}.media.json`;
}

function readBrollSequence(value: unknown): BrollSequence {
  assert(value !== null && typeof value === "object" && !Array.isArray(value),
    "B-roll sequence must be an object.");
  const sequence = value as Partial<BrollSequence>;
  assert(sequence.format === "hypit.ranking-jensen-broll-sequence@1"
    && Array.isArray(sequence.groups), "B-roll sequence format is invalid.");
  assert(sequence.behavior?.motion !== undefined
    && Array.isArray(sequence.behavior.motion.alternating)
    && sequence.behavior.motion.alternating.length > 0
    && Number.isFinite(sequence.behavior.motion.wideAspectRatio),
  "B-roll sequence motion behavior is invalid.");
  return sequence as BrollSequence;
}

function exactSeconds(value: number): ExactTemporalValue {
  assert(Number.isFinite(value) && value >= 0, "Time must be a non-negative number.");
  return {
    ticks: String(Math.round(value * transcriptTimeBase)),
    timeBase: { numerator: 1, denominator: transcriptTimeBase },
  };
}

function exactFrames(value: number): ExactTemporalValue {
  assert(Number.isSafeInteger(value) && value >= 0, "Frames must be a non-negative integer.");
  return { ticks: String(value), timeBase: { numerator: 1, denominator: 24 } };
}

function segmentCaptionSelection(
  projection: ReturnType<typeof projectScript>,
  segmentId: string,
): CaptionSelection {
  const segment = projection.narrative.segments.find((candidate) => candidate.id === segmentId);
  assert(segment !== undefined, `Script has no Segment ${segmentId}.`);
  const subset = captionUnitsForNarrativeSelection(
    projection.caption.document,
    projection.caption.binding,
    projection.narrative,
    {
      id: `${segmentId}.all`,
      startAnchorId: segment.startAnchorId,
      endAnchorId: segment.endAnchorId,
    },
  );
  return { kind: "units", ids: subset.unitIds };
}

function attachTranscript(
  asset: MediaAssetDocument,
  id: string,
  domain: LocalTemporalDomain,
): MediaAssetDocument {
  const representation = {
    id: "speech.en",
    type: timedTranscriptTypes.transcript,
    document: { path: `${id}.transcript.json`, mediaType: "application/json" },
    resources: {},
    binding: {
      temporal: { mapToMedia: identityTemporalMap(domain) },
      audio: { member: "audio" as const },
    },
  };
  return {
    ...asset,
    representations: [
      ...asset.representations.filter((candidate) => candidate.id !== representation.id),
      representation,
    ],
  };
}

const captionStyle: CaptionStyle = {
  id: "nvidia",
  family: "fine",
  visibility: {
    lead: { ticks: "1", timeBase: { numerator: 1, denominator: 12 } },
    tail: { ticks: "1", timeBase: { numerator: 1, denominator: 12 } },
    handoff: "cut",
  },
  parameters: {
    color: "#ffffff",
    fontFamily: "Montserrat, Arial Black, Arial, sans-serif",
    fonts: {
      faces: [{
        weight: 900,
        style: "normal",
        sources: [{
          artifact: {
            kind: "blob",
            resource: "res_ranking_football_montserrat_latin",
            size: 37956,
            mediaType: "font/woff2",
          },
          unicodeRange: "U+0000-024F",
        }],
      }],
    },
    fontSize: 44,
    fontWeight: 900,
    lineHeight: 1.25,
    letterSpacing: -0.8,
    textAlign: "center",
    blockAlign: "center",
    inlineSize: "hug",
    maxLines: 2,
    maxWordsPerLine: 5,
    wrap: "word",
    overflow: "visible",
    outlineColor: "#090a0f",
    outlineWidth: 2.8,
    shadowColor: "#000000b8",
    shadowBlur: 7,
    shadowOffsetX: 0,
    shadowOffsetY: 3,
    cueBox: {
      background: "#00000000",
      borderColor: "#00000000",
      borderWidth: 0,
      borderRadius: 0,
      paddingX: 0,
      paddingY: 0,
      continuity: "isolated",
    },
    activePaint: {
      color: "#ffffff",
      outlineColor: "#090a0f",
      outlineWidth: 2.6,
      shadowColor: "#0000008f",
      shadowBlur: 3,
      shadowOffsetX: 0,
      shadowOffsetY: 1,
    },
    activeBox: {
      mode: "current",
      background: "#83e21b",
      borderColor: "#00000000",
      borderWidth: 0,
      borderRadius: 6,
      paddingX: 10,
      paddingY: 4,
      continuity: "isolated",
      transitionFrames: 2,
      shadow: {
        color: "#70d812",
        opacity: 0.36,
        offsetX: 0,
        offsetY: 0,
        blur: 10,
        spread: 0,
      },
    },
    karaoke: { mode: "current", transition: "step", activeColor: "#ffffff" },
    activeResponse: { kind: "pop", frames: 3, scale: 1.04 },
    entry: { kind: "fade", frames: 2 },
    exit: { kind: "fade", frames: 2 },
  },
};

const brollFrameTreatment: PictureFrameTreatment = {
  clip: { kind: "frame" },
  padding: { topPx: 0, rightPx: 0, bottomPx: 0, leftPx: 0 },
  shadows: [{
    offsetX: 0,
    offsetY: 18,
    blurPx: 34,
    spreadPx: -8,
    color: "#000000D9",
  }],
};

function transformState(input: Partial<PictureTransformState> = {}): PictureTransformState {
  return { ...IDENTITY_PICTURE_TRANSFORM, ...input };
}

function filterState(opacity: number): PictureFilterState {
  return { ...IDENTITY_PICTURE_FILTER, opacity };
}

function brollMotionFor(
  sequence: BrollSequence,
  item: BrollSequence["groups"][number]["items"][number],
  index: number,
): BrollMotion {
  if (item.motion !== undefined) return item.motion;
  const behavior = sequence.behavior.motion;
  return item.layout.width / item.layout.height >= behavior.wideAspectRatio
    ? behavior.wide
    : behavior.alternating[index % behavior.alternating.length]!;
}

function brollMotionOperators(id: string, duration: ExactTemporalValue, motion: BrollMotion) {
  const entryEnd = exactFrames(motion === "rise" ? 7 : 6);
  const exitStart = subtractExactTemporalValues(duration, exactFrames(4));
  const finalPose = subtractExactTemporalValues(duration, exactFrames(1));
  assert(compareExactTemporalValues(entryEnd, exitStart) < 0,
    `B-roll ${id} is too short for its entry and exit motion.`);
  const controlTime = nleLinearTimeMapping(duration);
  const operators = [];

  operators.push({
    id: `${id}-entry-transform`,
    operator: pictureTransformNleSymbol,
    parameters: {
      kind: "keyframes",
      keyframes: [
        { at: exactTemporalZero(), state: motion === "pop"
          ? transformState({ scaleX: 0.7, scaleY: 0.7 })
          : motion === "rise"
            ? transformState({ translateY: 80, scaleX: 0.92, scaleY: 0.92 })
            : transformState({ scaleX: 0.9, scaleY: 0.9 }) },
        { at: entryEnd, state: transformState() },
      ],
      interpolation: { kind: "ease-out" },
    },
    controlTime,
  });

  if (motion !== "wide") {
    operators.push({
      id: `${id}-entry-opacity`,
      operator: pictureFilterNleSymbol,
      parameters: {
        kind: "keyframes",
        keyframes: [
          { at: exactTemporalZero(), state: filterState(0) },
          { at: entryEnd, state: filterState(1) },
        ],
        interpolation: { kind: "ease-out" },
      },
      controlTime,
    });
  }

  if (motion === "rise") {
    operators.push({
      id: `${id}-exit-transform`,
      operator: pictureTransformNleSymbol,
      parameters: {
        kind: "keyframes",
        keyframes: [
          { at: exactTemporalZero(), state: transformState() },
          { at: exitStart, state: transformState() },
          { at: finalPose, state: transformState({ scaleX: 0.94, scaleY: 0.94 }) },
        ],
        interpolation: { kind: "ease-in" },
      },
      controlTime,
    });
  } else {
    operators.push({
      id: `${id}-exit-opacity`,
      operator: pictureFilterNleSymbol,
      parameters: {
        kind: "keyframes",
        keyframes: [
          { at: exactTemporalZero(), state: filterState(1) },
          { at: exitStart, state: filterState(1) },
          { at: finalPose, state: filterState(0) },
        ],
        interpolation: { kind: "ease-in" },
      },
      controlTime,
    });
  }
  return operators;
}

async function main(): Promise<void> {
  const source = await readFile(resolve(projectRoot, "documents/jensen.script"), "utf8");
  const parsed = parseScript("documents/jensen.script", source);
  const projection = projectScript(parsed, "ranking-jensen");
  const broll = readBrollSequence(JSON.parse(
    await readFile(resolve(projectRoot, "broll.sequence.json"), "utf8"),
  ));
  const presentation = createCaptionPresentation(captionStyle);

  const domains = new Map<string, LocalTemporalDomain>();
  const timings = new Map<string, ReturnType<typeof createNarrativeLocalTiming>>();
  const tierRevealOffsets = new Map<string, ExactTemporalValue>();
  for (const subject of subjects) {
    const assetFile = assetPath(subject.media);
    const asset = parseMediaAssetDocument(await readFile(assetFile, "utf8"));
    const domain = asset.media.interpretation.domain;
    assert(domain !== undefined && asset.media.interpretation.audio !== undefined,
      `Media ${subject.media} must contain time-bearing audio.`);
    const segment = projection.segments.find((candidate) => candidate.id === subject.segment);
    assert(segment !== undefined, `Script has no Segment ${subject.segment}.`);
    const transcriptFile = transcriptPath(subject.media);
    const raw = decodeTimedTranscript(await readFile(transcriptFile, "utf8"), transcriptFile);
    const alignment = alignNarrative(projection.narrative, segment, domain, raw);
    const corrected = correctTimedTranscript(projection.narrative, segment, domain, raw, {
      segmentText: scriptSegmentSpeech(parsed, subject.segment),
    });
    const tierWord = corrected.word_segments.find((word) =>
      word.word.normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase() === "tier");
    assert(tierWord?.start !== undefined, `Transcript ${subject.media} has no timed tier word.`);
    tierRevealOffsets.set(subject.media, exactSeconds(tierWord.start));
    await writeFile(transcriptFile, encodeTimedTranscript(corrected), "utf8");
    await writeFile(assetFile, serializeMediaAssetDocument(
      attachTranscript(asset, subject.media, domain),
    ), "utf8");
    domains.set(subject.media, domain);
    timings.set(subject.segment,
      createNarrativeLocalTiming(`${subject.segment}.timing`, projection.narrative.id, domain, [alignment]));
  }

  let project = createNleProject({
    id: "ranking-jensen",
    name: "Ranking the best person Jensen ever dated",
    canvas: { width: 720, height: 1280, clearColor: "#090a0f" },
  });
  project = applyNleTransaction(project, { revision: project.revision, commands: [
    { kind: "picture-layout.add", value: {
      id: "caption-bottom",
      name: "Caption bottom",
      layout: { x: 43, y: 653, width: 634, height: 230, fit: "fill" },
    } },
    { kind: "track.add", track: { id: "performance", name: "Jensen A-roll", kind: "picture", muted: false, items: [] } },
    { kind: "track.add", track: { id: "music", name: "Music bed", kind: "audio", muted: false, items: [] } },
    { kind: "track.add", track: { id: "reveal-sfx", name: "Tier reveal sound", kind: "audio", muted: false, items: [] } },
    { kind: "track.add", track: { id: "ranking", name: "Date ranking board", kind: "picture", muted: false, items: [] } },
    { kind: "track.add", track: { id: "broll", name: "B-roll groups", kind: "picture", muted: false, items: [] } },
    { kind: "track.add", track: { id: "title", name: "Title", kind: "picture", muted: false, items: [] } },
    { kind: "track.add", track: { id: "captions", name: "Captions", kind: "picture", muted: false, items: [] } },
    { kind: "track.add", track: { id: "reveal-flash", name: "Tier reveal flash", kind: "picture", muted: false, items: [] } },
  ] });

  const starts = new Map<string, ExactTemporalValue>();
  let cursor = exactTemporalZero();
  const mediaCommands: Parameters<typeof applyNleTransaction>[1]["commands"][number][] = [];
  for (const subject of subjects) {
    const domain = domains.get(subject.media)!;
    starts.set(subject.media, cursor);
    mediaCommands.push({ kind: "item.add", track: "performance", item: {
      id: `${subject.media}-use`,
      name: `${subject.label} A-roll`,
      kind: "present",
      source: "media",
      asset: { path: portableAssetPath(subject.media) },
      start: cursor,
      duration: domain.duration,
      sourceTime: nleLinearTimeMapping(domain.duration),
      enabled: true,
      picture: { layout: { x: 0, y: 0, width: 720, height: 1280, fit: "cover" } },
      audio: {},
    } });
    cursor = addExactTemporalValues(cursor, domain.duration);
  }
  project = applyNleTransaction(project, { revision: project.revision, commands: mediaCommands });

  const brollGroupStarts = broll.groups.map((group) => {
    const subject = subjects.find((candidate) => candidate.segment === group.segment);
    assert(subject !== undefined, `B-roll group ${group.id} has unknown Segment ${group.segment}.`);
    const first = group.items[0];
    assert(first !== undefined, `B-roll group ${group.id} has no Items.`);
    const selection = projection.selections.find((candidate) => candidate.id === first.selection);
    assert(selection !== undefined,
      `B-roll group ${group.id} first Item references missing Selection ${first.selection}.`);
    const range = selectionTemporalRange(timings.get(group.segment)!, selection);
    return addExactTemporalValues(starts.get(subject.media)!, range.start);
  });

  const brollCommands: Parameters<typeof applyNleTransaction>[1]["commands"][number][] = [];
  for (const [groupIndex, group] of broll.groups.entries()) {
    const subject = subjects.find((candidate) => candidate.segment === group.segment);
    assert(subject !== undefined, `B-roll group ${group.id} has unknown Segment ${group.segment}.`);
    const segmentStart = starts.get(subject.media)!;
    const timing = timings.get(group.segment)!;
    const nextGroup = broll.groups[groupIndex + 1];
    const groupEnd = nextGroup === undefined
      ? cursor
      : nextGroup.segment === group.segment
        ? brollGroupStarts[groupIndex + 1]!
        : starts.get(subjects.find((candidate) => candidate.segment === nextGroup.segment)!.media)!;
    const itemIds: string[] = [];
    for (const [index, item] of group.items.entries()) {
      const selection = projection.selections.find((candidate) => candidate.id === item.selection);
      assert(selection !== undefined,
        `B-roll group ${group.id} Item ${item.id} references missing Selection ${item.selection}.`);
      const range = selectionTemporalRange(timing, selection);
      const itemStart = addExactTemporalValues(segmentStart, range.start);
      let itemEnd = groupEnd;
      if (group.mode === "replace" && group.transition !== undefined && index < group.items.length - 1) {
        const incoming = group.items[index + 1]!;
        const incomingSelection = projection.selections.find((candidate) => candidate.id === incoming.selection);
        assert(incomingSelection !== undefined,
          `B-roll group ${group.id} incoming Item references missing Selection ${incoming.selection}.`);
        const incomingRange = selectionTemporalRange(timing, incomingSelection);
        itemEnd = addExactTemporalValues(
          addExactTemporalValues(segmentStart, incomingRange.start),
          exactFrames(group.transition.frames),
        );
      }
      const duration = subtractExactTemporalValues(itemEnd, itemStart);
      assert(compareExactTemporalValues(duration, exactTemporalZero()) > 0,
        `B-roll group ${group.id} Item ${item.id} has no visible duration.`);

      const asset = parseMediaAssetDocument(await readFile(resolve(projectRoot, item.asset), "utf8"));
      assert(asset.media.interpretation.picture !== undefined,
        `B-roll group ${group.id} Item ${item.id} has no picture.`);
      const sourceTime = item.playback === "loop"
        ? (() => {
          const domain = asset.media.interpretation.domain;
          assert(domain !== undefined,
            `B-roll group ${group.id} Item ${item.id} cannot loop a constant picture.`);
          return nleLinearTimeMapping(duration, exactTemporalZero(),
            { numerator: 1, denominator: 1 },
            { start: exactTemporalZero(), end: domain.duration });
        })()
        : nleLinearTimeMapping(duration, exactTemporalZero(), { numerator: 0, denominator: 1 });
      const id = `broll-${group.id}-${item.id}`;
      const motion = brollMotionFor(broll, item, index);
      itemIds.push(id);
      brollCommands.push({ kind: "item.add", track: "broll", item: {
        id,
        name: `B-roll ${group.id}.${index + 1} · ${item.id}`,
        kind: "present",
        source: "media",
        asset: { path: item.asset },
        start: itemStart,
        duration,
        sourceTime,
        enabled: true,
        picture: {
          layout: item.layout,
          operators: [{
            id: `${id}-frame`,
            operator: pictureFrameNleSymbol,
            parameters: { treatment: brollFrameTreatment },
            controlTime: nleLinearTimeMapping(duration),
          }, ...brollMotionOperators(id, duration, motion)],
        },
      } });
    }
    if (group.mode === "replace") {
      assert(group.transition?.kind === "crossfade" && itemIds.length === 2,
        `B-roll replacement group ${group.id} must define one two-item crossfade.`);
      brollCommands.push({ kind: "transition.add", transition: {
        id: `broll-${group.id}-crossfade`,
        outgoing: itemIds[0]!,
        incoming: itemIds[1]!,
        operator: pictureTransitionNleSymbol,
        parameters: { kind: "cross-dissolve", easing: "ease-in-out" },
      } });
    }
  }
  project = applyNleTransaction(project, { revision: project.revision, commands: brollCommands });

  const bgmAsset = parseMediaAssetDocument(await readFile(assetPath("bgm-thank-you"), "utf8"));
  const bgmDomain = bgmAsset.media.interpretation.domain;
  assert(bgmDomain !== undefined && bgmAsset.media.interpretation.audio !== undefined,
    "THANK YOU instrumental must contain time-bearing audio.");
  assert(compareExactTemporalValues(bgmDomain.duration, cursor) >= 0,
    "THANK YOU instrumental is shorter than the Jensen edit.");
  const fadeOut = { ticks: "3", timeBase: { numerator: 1, denominator: 5 } } as const;
  const crossfade = exactSeconds(0.2);
  const firstMusicDuration = exactSeconds(37.6);
  const firstMusicFadeStart = subtractExactTemporalValues(firstMusicDuration, crossfade);
  const secondMusicStart = firstMusicFadeStart;
  const secondMusicDuration = subtractExactTemporalValues(cursor, secondMusicStart);
  const secondMusicSourceStart = exactSeconds(49.9);
  const lastSample = { ticks: "1", timeBase: { numerator: 1, denominator: 48_000 } } as const;
  assert(compareExactTemporalValues(addExactTemporalValues(secondMusicSourceStart, secondMusicDuration),
    bgmDomain.duration) <= 0, "THANK YOU instrumental cannot cover the post-modulation edit.");
  project = applyNleTransaction(project, { revision: project.revision, commands: [{
    kind: "item.add", track: "music", item: {
      id: "thank-you-instrumental-opening",
      name: "THANK YOU instrumental — opening",
      kind: "present",
      source: "media",
      asset: { path: portableAssetPath("bgm-thank-you") },
      start: exactTemporalZero(),
      duration: firstMusicDuration,
      sourceTime: nleLinearTimeMapping(firstMusicDuration),
      enabled: true,
      audio: { operators: [{
        id: "thank-you-opening-envelope",
        operator: audioGainNleSymbol,
        parameters: {
          kind: "keyframes",
          keyframes: [
            { at: exactTemporalZero(), gain: 0.14 },
            { at: firstMusicFadeStart, gain: 0.14 },
            { at: subtractExactTemporalValues(firstMusicDuration, lastSample), gain: 0 },
          ],
          interpolation: { kind: "linear" },
        },
        controlTime: nleLinearTimeMapping(firstMusicDuration),
      }] },
    },
  }, {
    kind: "item.add", track: "music", item: {
      id: "thank-you-instrumental-return",
      name: "THANK YOU instrumental — return",
      kind: "present",
      source: "media",
      asset: { path: portableAssetPath("bgm-thank-you") },
      start: secondMusicStart,
      duration: secondMusicDuration,
      sourceTime: nleLinearTimeMapping(secondMusicDuration, secondMusicSourceStart),
      enabled: true,
      audio: { operators: [{
        id: "thank-you-return-envelope",
        operator: audioGainNleSymbol,
        parameters: {
          kind: "keyframes",
          keyframes: [
            { at: exactTemporalZero(), gain: 0 },
            { at: crossfade, gain: 0.14 },
            { at: subtractExactTemporalValues(secondMusicDuration, fadeOut), gain: 0.14 },
            { at: subtractExactTemporalValues(secondMusicDuration, lastSample), gain: 0 },
          ],
          interpolation: { kind: "linear" },
        },
        controlTime: nleLinearTimeMapping(secondMusicDuration),
      }] },
    },
  }] });

  const revealSfxAsset = parseMediaAssetDocument(await readFile(assetPath("ranking-reveal-sfx"), "utf8"));
  const revealSfxDomain = revealSfxAsset.media.interpretation.domain;
  assert(revealSfxDomain !== undefined && revealSfxAsset.media.interpretation.audio !== undefined,
    "Tier reveal sound must contain time-bearing audio.");
  project = applyNleTransaction(project, { revision: project.revision, commands: subjects.map((subject) => ({
    kind: "item.add" as const,
    track: "reveal-sfx",
    item: {
      id: `${subject.segment}-tier-reveal-sfx`,
      name: `${subject.label} tier reveal`,
      kind: "present" as const,
      source: "media" as const,
      asset: { path: portableAssetPath("ranking-reveal-sfx") },
      start: addExactTemporalValues(starts.get(subject.media)!, tierRevealOffsets.get(subject.media)!),
      duration: revealSfxDomain.duration,
      sourceTime: nleLinearTimeMapping(revealSfxDomain.duration),
      enabled: true,
      audio: { operators: [{
        id: `${subject.segment}-tier-reveal-gain`,
        operator: audioGainNleSymbol,
        parameters: { kind: "constant" as const, gain: 0.2 },
        controlTime: nleLinearTimeMapping(revealSfxDomain.duration),
      }] },
    },
  })) });

  for (const subject of subjects) {
    const selection = segmentCaptionSelection(projection, subject.segment);
    const timing = projectNarrativeCaptionTiming(
      projection.caption.document,
      projection.caption.binding,
      timings.get(subject.segment)!,
      { documentId: projection.caption.document.id, unitIds: selection.ids },
    );
    project = applyNleTransaction(project, createCaptionFineNleMaterializationForMediaItem(project, {
      id: `${subject.segment}-captions`,
      track: "captions",
      mediaItem: `${subject.media}-use`,
      document: projection.caption.document,
      timing,
      presentation,
      selection,
      styleRef: (styleId) => `caption-style:${styleId}`,
      picture: { layout: { ref: "caption-bottom" } },
    }));
  }

  const entries = subjects.map((subject) => {
    const mediaStart = starts.get(subject.media)!;
    const start = addExactTemporalValues(mediaStart, tierRevealOffsets.get(subject.media)!);
    return {
      id: subject.segment,
      label: subject.label,
      tier: subject.tier,
      input: `subject.${subject.segment}`,
      preset: false,
      window: {
        start,
        end: addExactTemporalValues(mediaStart, domains.get(subject.media)!.duration),
      },
    };
  });
  const iconMedia = Object.fromEntries(subjects.map((subject) => [
    `subject.${subject.segment}`,
    { path: portableAssetPath(subject.icon) },
  ]));
  project = applyNleTransaction(project, { revision: project.revision, commands: [
    { kind: "item.add", track: "ranking", item: {
      id: "jensen-date-tier-board",
      name: "Jensen date tier list",
      kind: "present",
      source: "component",
      start: exactTemporalZero(),
      duration: cursor,
      sourceTime: nleLinearTimeMapping(cursor),
      enabled: true,
      component: footballTierBoardComponentSymbol,
      media: iconMedia,
      parameters: {
        boardHeightRatio: 0.4,
        entryMotion: "pop-in-place",
        rows: [
          { id: "s", label: "S", color: "#ee5f52" },
          { id: "a", label: "A", color: "#f0a04c" },
          { id: "b", label: "B", color: "#f0c84d" },
          { id: "c", label: "C", color: "#ede356" },
          { id: "d", label: "D", color: "#a6da7b" },
        ],
        entries,
      },
      picture: { layout: { x: 0, y: 0, width: 720, height: 1280, fit: "fill" } },
    } },
    { kind: "item.add", track: "title", item: {
      id: "jensen-ranking-title",
      name: "Ranking the best person Jensen ever dated",
      kind: "present",
      source: "component",
      start: exactTemporalZero(),
      duration: cursor,
      sourceTime: nleLinearTimeMapping(cursor),
      enabled: true,
      component: footballTitleComponentSymbol,
      parameters: {
        first: "RANKING THE BEST PERSON",
        second: "JENSEN EVER DATED 🔥💦🍑",
        top: 74,
      },
      picture: { layout: { x: 0, y: 0, width: 720, height: 1280, fit: "fill" } },
    } },
  ] });

  const revealFlashDuration = { ticks: "9", timeBase: { numerator: 1, denominator: 24 } } as const;
  project = applyNleTransaction(project, { revision: project.revision, commands: subjects.map((subject) => ({
    kind: "item.add" as const,
    track: "reveal-flash",
    item: {
      id: `${subject.segment}-tier-reveal-flash`,
      name: `${subject.label} full-frame reveal flash`,
      kind: "present" as const,
      source: "component" as const,
      start: addExactTemporalValues(starts.get(subject.media)!, tierRevealOffsets.get(subject.media)!),
      duration: revealFlashDuration,
      sourceTime: nleLinearTimeMapping(revealFlashDuration),
      enabled: true,
      component: footballRevealFlashComponentSymbol,
      parameters: {
        intensity: 0.72,
        attackFrames: 2,
        holdFrames: 1,
        decayFrames: 5,
        color: "#78ff18",
        glowColor: "#f1ffe8",
      },
      picture: { layout: { x: 0, y: 0, width: 720, height: 1280, fit: "fill" as const } },
    },
  })) });

  await writeFile(resolve(projectRoot, "film.nle.json"), serializeNleProject(project), "utf8");
  const view = createNleTimelineView({
    id: "ranking-jensen-main",
    name: "Jensen Dating Ranking Timeline",
    project: { path: "film.nle.json" },
    editRate: { numerator: 24, denominator: 1 },
    tracks: project.tracks.map((track) => track.id),
  });
  await writeFile(resolve(projectRoot, "film.nle-view.json"), serializeNleTimelineView(view), "utf8");
  process.stdout.write(`${JSON.stringify({
    format: "hypit.ranking-jensen-composition@1",
    duration: cursor,
    mediaItems: subjects.length,
    brollItems: project.tracks.find((track) => track.id === "broll")!.items.length,
    captionItems: project.tracks.find((track) => track.id === "captions")!.items.length,
  }, undefined, 2)}\n`);
}

await main();
