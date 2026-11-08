import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { CaptionDocument, CaptionSelection } from "@hypit/caption";
import {
  appendCaptionHiddenOverride,
  appendCaptionStyleOverride,
  createCaptionFineNleMaterializationForMediaItem,
  createCaptionPresentation,
  type CaptionPresentation,
  type CaptionStyle,
} from "@hypit/caption-fine";
import {
  parseMediaAssetDocument,
  serializeMediaAssetDocument,
  type MediaAssetDocument,
} from "@hypit/media-asset";
import { projectNarrativeCaptionTiming } from "@hypit/narrative-caption";
import { alignNarrative, correctTimedTranscript } from "@hypit/narrative-speech-alignment";
import { createNarrativeLocalTiming, narrativeBoundaryTime } from "@hypit/narrative-temporal";
import {
  applyNleTransaction,
  createNleProject,
  nleLinearSourceTime,
  serializeNleProject,
  type NleProject,
} from "@hypit/nle";
import { parseScript, projectScript } from "@hypit/script";
import {
  addExactTemporalValues,
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
  rankingBoardComponentSymbol,
  verdictBurstComponentSymbol,
} from "@hypit-example/ranking-debate-components";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type TurnSpec = {
  readonly segment: string;
  readonly media: string;
};

const turns: readonly TurnSpec[] = [
  { segment: "alice-opening", media: "alice-video-1" },
  { segment: "bob-generation", media: "bob-video-1" },
  { segment: "alice-timeline", media: "alice-video-2" },
  { segment: "bob-verdict", media: "bob-video-2" },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function mediaAssetPath(id: string): string {
  return resolve(projectRoot, "media", id, `${id}.media.json`);
}

function transcriptPath(id: string): string {
  return resolve(projectRoot, "media", id, `${id}.transcript.json`);
}

function portableMediaAssetPath(id: string): string {
  return `media/${id}/${id}.media.json`;
}

function cueText(document: CaptionDocument, cue: CaptionDocument["cues"][number]): string {
  const selected = new Set(cue.unitIds);
  return document.words
    .filter((word) => selected.has(word.unitId))
    .map((word) => `${word.separatorBefore}${word.text}`)
    .join("");
}

function cueContaining(document: CaptionDocument, text: string): string {
  const cue = document.cues.find((candidate) => cueText(document, candidate).includes(text));
  assert(cue !== undefined, `Caption document has no Cue containing ${JSON.stringify(text)}.`);
  return cue.id;
}

function segmentCaptionSelection(
  projection: ReturnType<typeof projectScript>,
  segmentId: string,
): CaptionSelection {
  const tokenIds = new Set(projection.narrative.tokens
    .filter((token) => token.segmentId === segmentId)
    .map((token) => token.id));
  const ids = projection.caption.binding.units
    .filter((unit) => unit.sourceTokenIds.every((token) => tokenIds.has(token)))
    .map((unit) => unit.unitId);
  assert(ids.length > 0, `Script Segment ${segmentId} has no Caption units.`);
  return { kind: "units", ids };
}

function searchable(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, "");
}

function phraseStart(
  projection: ReturnType<typeof projectScript>,
  timing: ReturnType<typeof createNarrativeLocalTiming>,
  segmentId: string,
  phrase: string,
): ExactTemporalValue {
  const query = searchable(phrase);
  const tokens = projection.narrative.tokens.filter((token) => token.segmentId === segmentId);
  for (let first = 0; first < tokens.length; first += 1) {
    let joined = "";
    for (let last = first; last < tokens.length && joined.length <= query.length; last += 1) {
      joined += searchable(tokens[last]!.text);
      if (joined !== query) continue;
      return narrativeBoundaryTime(timing, tokens[first]!.startAnchorId);
    }
  }
  throw new Error(`Script Segment ${segmentId} has no phrase ${JSON.stringify(phrase)}.`);
}

function attachTranscript(
  asset: MediaAssetDocument,
  id: string,
  domain: LocalTemporalDomain,
): MediaAssetDocument {
  const representation = {
    id: "speech.zh",
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

const baseStyle: CaptionStyle = {
  id: "alice",
  family: "fine",
  parameters: {
    color: "#f8fafc",
    fontFamily: "PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif",
    fontSize: 48,
    fontWeight: 800,
    lineHeight: 1.16,
    textAlign: "center",
    outlineColor: "#020617cc",
    outlineWidth: 2,
    shadowColor: "#02061799",
    shadowBlur: 12,
    shadowOffsetY: 5,
    cueBox: { background: "#0b1020e8", borderColor: "#ffffff24", borderWidth: 1, borderRadius: 18, paddingX: 22, paddingY: 14 },
    activeBox: { mode: "off" },
    karaoke: { mode: "current", transition: "step", activeColor: "#67e8f9" },
    entry: { kind: "fade", frames: 4 },
    attributeFaces: [{ attribute: "face", value: "serif", fontFamily: "Georgia, serif", fontWeight: 700, fontStyle: "italic" }],
  },
};

const bobStyle: CaptionStyle = {
  id: "bob",
  family: "fine",
  parameters: {
    color: "#f8fafc",
    fontFamily: "PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif",
    fontSize: 48,
    fontWeight: 800,
    lineHeight: 1.16,
    textAlign: "center",
    outlineColor: "#020617cc",
    outlineWidth: 2,
    shadowColor: "#02061799",
    shadowBlur: 12,
    shadowOffsetY: 5,
    cueBox: { background: "#0b1020e8", borderColor: "#ffffff24", borderWidth: 1, borderRadius: 18, paddingX: 22, paddingY: 14 },
    activeBox: { mode: "off" },
    karaoke: { mode: "current", transition: "step", activeColor: "#fdba74" },
    entry: { kind: "fade", frames: 4 },
  },
};

const warningStyle: CaptionStyle = {
  id: "warning",
  family: "fine",
  parameters: {
    color: "#f8fafc",
    fontFamily: "PingFang SC, Hiragino Sans GB, Microsoft YaHei, sans-serif",
    fontSize: 50,
    fontWeight: 850,
    lineHeight: 1.12,
    textAlign: "center",
    outlineColor: "#020617cc",
    outlineWidth: 2,
    shadowColor: "#02061799",
    shadowBlur: 12,
    shadowOffsetY: 5,
    cueBox: { background: "#2a0e16ed", borderColor: "#fb718566", borderWidth: 1, borderRadius: 18, paddingX: 22, paddingY: 14 },
    activeBox: { mode: "off" },
    karaoke: { mode: "current", transition: "step", activeColor: "#fde68a" },
    entry: { kind: "fade", frames: 4 },
  },
};

async function main(): Promise<void> {
  const source = await readFile(resolve(projectRoot, "story.script"), "utf8");
  const projection = projectScript(parseScript("story.script", source), "ranking-debate");
  const hiddenCue = cueContaining(projection.caption.document, "默认不显示");
  const warningCue = cueContaining(projection.caption.document, "稳定修改");

  let presentation: CaptionPresentation = appendCaptionStyleOverride(
    createCaptionPresentation(baseStyle),
    { id: "bob-role", selector: { roles: ["BOB"] } },
    bobStyle,
  );
  presentation = appendCaptionHiddenOverride(presentation,
    { id: "hidden-cue", selector: { cues: [hiddenCue] } });
  presentation = appendCaptionStyleOverride(presentation,
    { id: "warning-cue", selector: { cues: [warningCue] } }, warningStyle);

  const assets = new Map<string, MediaAssetDocument>();
  const domains = new Map<string, LocalTemporalDomain>();
  const timings = new Map<string, ReturnType<typeof createNarrativeLocalTiming>>();

  for (const turn of turns) {
    const assetFile = mediaAssetPath(turn.media);
    const asset = parseMediaAssetDocument(await readFile(assetFile, "utf8"));
    const domain = asset.media.interpretation.domain;
    assert(domain !== undefined && asset.media.interpretation.audio !== undefined,
      `Media ${turn.media} must contain time-bearing audio.`);
    const segment = projection.segments.find((candidate) => candidate.id === turn.segment);
    assert(segment !== undefined, `Script has no Segment ${turn.segment}.`);
    const transcriptFile = transcriptPath(turn.media);
    const raw = decodeTimedTranscript(await readFile(transcriptFile, "utf8"), transcriptFile);
    const alignment = alignNarrative(projection.narrative, segment, domain, raw);
    const corrected = correctTimedTranscript(projection.narrative, segment, domain, raw);
    await writeFile(transcriptFile, encodeTimedTranscript(corrected), "utf8");
    const attached = attachTranscript(asset, turn.media, domain);
    await writeFile(assetFile, serializeMediaAssetDocument(attached), "utf8");
    assets.set(turn.media, attached);
    domains.set(turn.media, domain);
    timings.set(turn.segment,
      createNarrativeLocalTiming(`${turn.segment}.timing`, projection.narrative.id, domain, [alignment]));
  }

  let project = createNleProject({
    id: "ranking-debate",
    name: "Ranking debate",
    editRate: { numerator: 24, denominator: 1 },
    canvas: { width: 720, height: 1280, clearColor: "#111827" },
  });
  project = applyNleTransaction(project, { revision: project.revision, commands: [
    { kind: "track.add", track: { id: "picture-main", name: "Picture + production audio", kind: "picture", locked: false, muted: false, items: [] } },
    { kind: "track.add", track: { id: "ranking", name: "Ranking board", kind: "picture", locked: false, muted: false, items: [] } },
    { kind: "track.add", track: { id: "captions", name: "Captions", kind: "picture", locked: false, muted: false, items: [] } },
    { kind: "track.add", track: { id: "verdict", name: "Verdict", kind: "picture", locked: false, muted: false, items: [] } },
  ] });

  const starts = new Map<string, ExactTemporalValue>();
  let cursor = exactTemporalZero();
  const mediaCommands: Parameters<typeof applyNleTransaction>[1]["commands"][number][] = [];
  for (const turn of turns) {
    const domain = domains.get(turn.media)!;
    starts.set(turn.media, cursor);
    mediaCommands.push(
      { kind: "media.add", media: { id: turn.media, name: turn.media, asset: { path: portableMediaAssetPath(turn.media) } } },
      { kind: "item.add", track: "picture-main", item: {
        id: `${turn.media}-use`,
        kind: "media",
        media: turn.media,
        start: cursor,
        duration: domain.duration,
        sourceTime: nleLinearSourceTime(domain.duration),
        enabled: true,
        picture: { layout: { x: 0, y: 0, width: 720, height: 1280, fit: "cover" }, effects: [] },
        audio: { effects: [] },
      } },
    );
    cursor = addExactTemporalValues(cursor, domain.duration);
  }
  project = applyNleTransaction(project, { revision: project.revision, commands: mediaCommands });

  for (const turn of turns) {
    const timing = timings.get(turn.segment)!;
    const selection = segmentCaptionSelection(projection, turn.segment);
    const captionTiming = projectNarrativeCaptionTiming(
      projection.caption.document,
      projection.caption.binding,
      timing,
      { documentId: projection.caption.document.id, unitIds: selection.ids },
    );
    project = applyNleTransaction(project, createCaptionFineNleMaterializationForMediaItem(project, {
      id: `${turn.segment}-captions`,
      track: "captions",
      mediaItem: `${turn.media}-use`,
      document: projection.caption.document,
      timing: captionTiming,
      presentation,
      selection,
      picture: { layout: { x: 42, y: 930, width: 636, height: 240, fit: "fill" }, effects: [] },
    }));
  }

  const at = (segment: string, media: string, phrase: string) => addExactTemporalValues(
    starts.get(media)!,
    phraseStart(projection, timings.get(segment)!, segment, phrase),
  );
  const verdictAt = at("bob-verdict", "bob-video-2", "这局我服");
  const graphicsCommands: Parameters<typeof applyNleTransaction>[1]["commands"][number][] = [{
    kind: "item.add",
    track: "ranking",
    item: {
      id: "ranking-board",
      kind: "component",
      start: exactTemporalZero(),
      duration: cursor,
      sourceTime: nleLinearSourceTime(cursor),
      enabled: true,
      component: rankingBoardComponentSymbol,
      parameters: {
        title: "AI 视频能力榜",
        rows: [
          { id: "S", label: "S", color: "#fb5260" },
          { id: "A", label: "A", color: "#fbbf24" },
          { id: "B", label: "B", color: "#34d399" },
        ],
        entries: [
          { id: "pretty", label: "漂亮画面", tier: "B", icon: "画", revealAt: at("bob-generation", "bob-video-1", "漂亮画面") },
          { id: "stable", label: "稳定修改", tier: "A", icon: "改", revealAt: at("bob-generation", "bob-video-1", "稳定修改") },
          { id: "timed", label: "按词编排", tier: "S", icon: "词", revealAt: at("alice-timeline", "alice-video-2", "时间线上") },
          { id: "editable", label: "普通工程", tier: "S", icon: "剪", revealAt: at("bob-verdict", "bob-video-2", "普通工程") },
        ],
        revealFrames: 18,
      },
      picture: { layout: { x: 392, y: 26, width: 300, height: 260, fit: "fill" }, effects: [] },
    },
  }, {
    kind: "item.add",
    track: "verdict",
    item: {
      id: "verdict-burst",
      kind: "component",
      start: verdictAt,
      duration: subtractExactTemporalValues(cursor, verdictAt),
      sourceTime: nleLinearSourceTime(subtractExactTemporalValues(cursor, verdictAt)),
      enabled: true,
      component: verdictBurstComponentSymbol,
      parameters: { kicker: "最终结论", title: "S 级：生成后还能剪", accent: "#38bdf8", enterFrames: 7 },
      picture: { layout: { x: 90, y: 735, width: 540, height: 145, fit: "fill" }, effects: [] },
    },
  }];
  project = applyNleTransaction(project, { revision: project.revision, commands: graphicsCommands });

  await writeFile(resolve(projectRoot, "film.nle.json"), serializeNleProject(project), "utf8");
  process.stdout.write(`${JSON.stringify({
    format: "hypit.ranking-debate-composition@1",
    project: "film.nle.json",
    revision: project.revision,
    mediaItems: turns.length,
    captionItems: project.tracks.find((track) => track.id === "captions")!.items.length,
    componentItems: project.tracks.filter((track) => track.id !== "picture-main")
      .flatMap((track) => track.items).length,
  }, undefined, 2)}\n`);
}

await main();
