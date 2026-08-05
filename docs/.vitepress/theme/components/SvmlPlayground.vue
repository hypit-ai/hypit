<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  demoAudioEnabled as audioEnabled,
  enableDemoAudioAfterInteraction,
  initializeDemoAudio,
  toggleDemoAudio,
} from "./demo-audio";
import { rankingMedia, resolveDemoMedia } from "./demo-media";
import { demoPointerIsInside } from "./demo-pointer";
import { wordCues, type WordCue } from "./regen-ranking-cues";
import {
  buildFoldedSourceView,
  buildFullSourceView,
  type SourceDisplayEntry,
} from "./source-display";

const props = withDefaults(defineProps<{ active?: boolean; showHeading?: boolean }>(), {
  active: true,
  showHeading: true,
});
const emit = defineEmits<{ ended: [] }>();

type RankingSelectionId = "photoshop" | "facetune" | "remini" | "chatgpt" | "regen";
type BrollSelectionId = "handsome-1" | "handsome-2" | "dating-photo" | "linkedin-headshot" | "instagram-post";
type SelectionId = RankingSelectionId | BrollSelectionId;

type TimelineSelection = {
  id: SelectionId;
  start: number;
  end: number;
};

type RankingSelection = {
  id: RankingSelectionId;
  label: string;
  rank: number;
  start: number;
  end: number;
  color: string;
  icon: string;
};

type BaseScene = {
  src: string;
  start: number;
  end: number;
};

type BrollItem = {
  id: BrollSelectionId;
  src: string;
  start: number;
  end: number;
  zoom: number;
};

type SourceLine = {
  html: string;
  selection?: SelectionId;
  range?: SelectionId;
  ranges?: SelectionId[];
  edge?: "start" | "end";
  tokens?: readonly [number, number];
};

type DisplayedSourceLine = SourceDisplayEntry<SourceLine>;

const TOTAL_DURATION = 36.1;
const ENTER_DURATION = .45;
const MOVE_DURATION = .55;

const selections: RankingSelection[] = [
  { id: "photoshop", label: "Photoshop", rank: 5, start: .08, end: 6.4, color: "#31add0", icon: rankingMedia.icons[4] },
  { id: "facetune", label: "Facetune", rank: 4, start: 6.4, end: 12, color: "rgb(132, 198, 84)", icon: rankingMedia.icons[3] },
  { id: "remini", label: "Remini", rank: 3, start: 12.043333333333333, end: 18.184444444444445, color: "rgb(234, 220, 42)", icon: rankingMedia.icons[2] },
  { id: "chatgpt", label: "ChatGPT", rank: 2, start: 18.184444444444445, end: 24.066666666666666, color: "rgb(255, 167, 45)", icon: rankingMedia.icons[1] },
  { id: "regen", label: "ReGen", rank: 1, start: 24.076666666666668, end: 36.06666666666666, color: "#ff3f56", icon: rankingMedia.icons[0] },
];

const baseScenes: BaseScene[] = [
  { src: rankingMedia.avatars[0], start: 0, end: 12.033333333333333 },
  { src: rankingMedia.avatars[1], start: 12.033333333333333, end: 24.066666666666666 },
  { src: rankingMedia.avatars[2], start: 24.066666666666666, end: 36.1 },
];

const brollItems: BrollItem[] = [
  { id: "handsome-1", src: rankingMedia.broll[4], start: 791 / 30, end: 831 / 30, zoom: 1.02 },
  { id: "handsome-2", src: rankingMedia.broll[3], start: 831 / 30, end: 888 / 30, zoom: 1.03 },
  { id: "dating-photo", src: rankingMedia.broll[2], start: 925 / 30, end: 952 / 30, zoom: 1.02 },
  { id: "linkedin-headshot", src: rankingMedia.broll[1], start: 952 / 30, end: 977 / 30, zoom: 1.03 },
  { id: "instagram-post", src: rankingMedia.broll[0], start: 977 / 30, end: 1009 / 30, zoom: 1.02 },
];

const semanticSelections: TimelineSelection[] = [...selections, ...brollItems];

const lines: SourceLine[] = [
  { html: '<span class="syn-tag">&lt;script&gt;</span>' },
  { html: '  <span class="syn-tag">&lt;segment</span> <span class="syn-attr">id</span>=<span class="syn-string">"scene-1"</span><span class="syn-tag">&gt;</span>' },
  { html: '    <span class="syn-tag">&lt;NARRATOR&gt;</span> <span class="syn-marker semantic-token" data-selection="photoshop" tabindex="0">@photoshop</span> Photoshop.', selection: "photoshop", range: "photoshop", edge: "start", tokens: [0, 1] },
  { html: '    <span class="syn-tag">&lt;SPEAKER&gt;</span> Powerful, but only if you know how to use it. Otherwise, your new profile', range: "photoshop", tokens: [1, 15] },
  { html: '              picture becomes a three-hour design project <span class="syn-marker semantic-token" data-selection="photoshop" tabindex="0">@/photoshop</span>.', selection: "photoshop", range: "photoshop", edge: "end", tokens: [15, 21] },
  { html: '    <span class="syn-tag">&lt;NARRATOR&gt;</span> <span class="syn-marker semantic-token" data-selection="facetune" tabindex="0">@facetune</span> Facetune.', selection: "facetune", range: "facetune", edge: "start", tokens: [21, 22] },
  { html: '    <span class="syn-tag">&lt;SPEAKER&gt;</span> Fast and great for touch-ups. But it still leaves you with the same awkward pose and the same dorm-room background <span class="syn-marker semantic-token" data-selection="facetune" tabindex="0">@/facetune</span>.', selection: "facetune", range: "facetune", edge: "end", tokens: [22, 42] },
  { html: '  <span class="syn-tag">&lt;/segment&gt;</span>' },
  { html: "" },
  { html: '  <span class="syn-tag">&lt;segment</span> <span class="syn-attr">id</span>=<span class="syn-string">"scene-2"</span><span class="syn-tag">&gt;</span>' },
  { html: '    <span class="syn-tag">&lt;NARRATOR&gt;</span> <span class="syn-marker semantic-token" data-selection="remini" tabindex="0">@remini</span> Remini.' , selection: "remini", range: "remini", edge: "start", tokens: [42, 43] },
  { html: '    <span class="syn-tag">&lt;SPEAKER&gt;</span> Great for blurry photos. It restores detail, but it can\'t fix the pose, outfit, or background. You get the same bad photo in HD <span class="syn-marker semantic-token" data-selection="remini" tabindex="0">@/remini</span>.', selection: "remini", range: "remini", edge: "end", tokens: [43, 67] },
  { html: '    <span class="syn-tag">&lt;NARRATOR&gt;</span> <span class="syn-marker semantic-token" data-selection="chatgpt" tabindex="0">@chatgpt</span> ChatGPT.', selection: "chatgpt", range: "chatgpt", edge: "start", tokens: [67, 68] },
  { html: '    <span class="syn-tag">&lt;SPEAKER&gt;</span> More flexible. It can create a new shot, but getting your face and the details right becomes a prompt-writing group project <span class="syn-marker semantic-token" data-selection="chatgpt" tabindex="0">@/chatgpt</span>.', selection: "chatgpt", range: "chatgpt", edge: "end", tokens: [68, 89] },
  { html: '  <span class="syn-tag">&lt;/segment&gt;</span>' },
  { html: "" },
  { html: '  <span class="syn-tag">&lt;segment</span> <span class="syn-attr">id</span>=<span class="syn-string">"scene-3"</span><span class="syn-tag">&gt;</span>' },
  { html: '    <span class="syn-tag">&lt;NARRATOR&gt;</span> <span class="syn-marker semantic-token" data-selection="regen" tabindex="0">@regen</span> ReGen.', selection: "regen", range: "regen", edge: "start", tokens: [89, 90] },
  { html: '    <span class="syn-tag">&lt;SPEAKER&gt;</span> Pick a photo you love, and the app <span class="syn-marker semantic-token" data-selection="handsome-1" tabindex="0">@handsome-1</span> rebuilds it around you with a', selection: "handsome-1", range: "handsome-1", edge: "start", tokens: [90, 104] },
  { html: '              <span class="syn-marker semantic-token" data-selection="handsome-1" tabindex="0">@/handsome-1~</span> <span class="syn-marker semantic-token" data-selection="handsome-2" tabindex="0">@handsome-2</span> better pose, outfit, and setting. <span class="syn-marker semantic-token" data-selection="handsome-2" tabindex="0">@/handsome-2</span>', selection: "handsome-2", ranges: ["handsome-1", "handsome-2"], edge: "end", tokens: [104, 109] },
  { html: '              From one selfie, you can make <span class="syn-marker semantic-token" data-selection="dating-photo" tabindex="0">@dating-photo</span> a dating photo, <span class="syn-marker semantic-token" data-selection="dating-photo" tabindex="0">@/dating-photo~</span>', selection: "dating-photo", range: "dating-photo", edge: "end", tokens: [109, 118] },
  { html: '              <span class="syn-marker semantic-token" data-selection="linkedin-headshot" tabindex="0">@linkedin-headshot</span> LinkedIn headshot, <span class="syn-marker semantic-token" data-selection="linkedin-headshot" tabindex="0">@/linkedin-headshot~</span>', selection: "linkedin-headshot", range: "linkedin-headshot", edge: "end", tokens: [118, 120] },
  { html: '              <span class="syn-marker semantic-token" data-selection="instagram-post" tabindex="0">@instagram-post</span> or Instagram post, <span class="syn-marker semantic-token" data-selection="instagram-post" tabindex="0">@/instagram-post</span>', selection: "instagram-post", range: "instagram-post", edge: "end", tokens: [120, 123] },
  { html: '              so you get what you wanted instead of fixing a bad shot <span class="syn-marker semantic-token" data-selection="regen" tabindex="0">@/regen</span>.', selection: "regen", range: "regen", edge: "end", tokens: [123, 135] },
  { html: '  <span class="syn-tag">&lt;/segment&gt;</span>' },
  { html: '<span class="syn-tag">&lt;/script&gt;</span>' },
  { html: "" },
  { html: '<span class="syn-tag">&lt;ranking-column</span> <span class="syn-attr">id</span>=<span class="syn-string">"ranking"</span> <span class="syn-attr">z</span>=<span class="syn-string">"42"</span><span class="syn-tag">&gt;</span>' },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">rank</span>=<span class="syn-string">"5"</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="photoshop" tabindex="0">{script.selection.photoshop}</span> <span class="syn-tag">/&gt;</span>', selection: "photoshop" },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">rank</span>=<span class="syn-string">"4"</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="facetune" tabindex="0">{script.selection.facetune}</span> <span class="syn-tag">/&gt;</span>', selection: "facetune" },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">rank</span>=<span class="syn-string">"3"</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="remini" tabindex="0">{script.selection.remini}</span> <span class="syn-tag">/&gt;</span>', selection: "remini" },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">rank</span>=<span class="syn-string">"2"</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="chatgpt" tabindex="0">{script.selection.chatgpt}</span> <span class="syn-tag">/&gt;</span>', selection: "chatgpt" },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">rank</span>=<span class="syn-string">"1"</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="regen" tabindex="0">{script.selection.regen}</span> <span class="syn-tag">/&gt;</span>', selection: "regen" },
  { html: '<span class="syn-tag">&lt;/ranking-column&gt;</span>' },
  { html: "" },
  { html: '<span class="syn-tag">&lt;broll-track</span> <span class="syn-attr">id</span>=<span class="syn-string">"broll"</span> <span class="syn-attr">z</span>=<span class="syn-string">"700"</span><span class="syn-tag">&gt;</span>' },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">source</span>=<span class="syn-expr">{broll-5}</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="handsome-1" tabindex="0">{script.selection.handsome-1}</span> <span class="syn-tag">/&gt;</span>', selection: "handsome-1" },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">source</span>=<span class="syn-expr">{broll-4}</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="handsome-2" tabindex="0">{script.selection.handsome-2}</span> <span class="syn-tag">/&gt;</span>', selection: "handsome-2" },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">source</span>=<span class="syn-expr">{broll-3}</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="dating-photo" tabindex="0">{script.selection.dating-photo}</span> <span class="syn-tag">/&gt;</span>', selection: "dating-photo" },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">source</span>=<span class="syn-expr">{broll-2}</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="linkedin-headshot" tabindex="0">{script.selection.linkedin-headshot}</span> <span class="syn-tag">/&gt;</span>', selection: "linkedin-headshot" },
  { html: '  <span class="syn-tag">&lt;item</span> <span class="syn-attr">source</span>=<span class="syn-expr">{broll-1}</span> <span class="syn-attr">during</span>=<span class="syn-expr semantic-token" data-selection="instagram-post" tabindex="0">{script.selection.instagram-post}</span> <span class="syn-tag">/&gt;</span>', selection: "instagram-post" },
  { html: '<span class="syn-tag">&lt;/broll-track&gt;</span>' },
];

type SemanticRangeBounds = {
  id: SelectionId;
  start: number;
  end: number;
  depth: number;
};

const rawRangeBounds = semanticSelections.map((selection) => ({
  id: selection.id,
  start: lines.findIndex((line) => line.html.includes(`>@${selection.id}</span>`)),
  end: lines.findIndex((line) => line.html.includes(`>@/${selection.id}`)),
})).filter((range) => range.start >= 0 && range.end >= range.start);

const semanticRangeBounds: SemanticRangeBounds[] = rawRangeBounds.map((range) => ({
  ...range,
  depth: rawRangeBounds.filter((candidate) => (
    candidate.id !== range.id
    && candidate.start <= range.start
    && candidate.end >= range.end
  )).length,
}));

const rankingBlock = {
  start: lines.findIndex((line) => line.html.includes("&lt;ranking-column")),
  end: lines.findIndex((line) => line.html.includes("&lt;/ranking-column")),
};
const brollBlock = {
  start: lines.findIndex((line) => line.html.includes("&lt;broll-track")),
  end: lines.findIndex((line) => line.html.includes("&lt;/broll-track")),
};

function decorateLine(line: SourceLine) {
  if (!line.tokens) return line.html;
  let cueIndex = line.tokens[0];
  const end = line.tokens[1];
  return line.html.split(/(<span\b[^>]*>.*?<\/span>)/giu).map((part) => {
    if (part.startsWith("<span")) return part;
    let output = "";
    let cursor = 0;
    while (cueIndex < end) {
      const cue = wordCues[cueIndex];
      const position = part.toLocaleLowerCase().indexOf(cue.text.toLocaleLowerCase(), cursor);
      if (position === -1) break;
      output += part.slice(cursor, position);
      output += `<span class="script-word" data-word-index="${cue.index}">${part.slice(position, position + cue.text.length)}</span>`;
      cursor = position + cue.text.length;
      cueIndex += 1;
    }
    return output + part.slice(cursor);
  }).join("");
}

const decoratedLines = lines.map(decorateLine);

const activeLine = ref<number | null>(null);
const pinnedSelection = ref<SelectionId | null>(null);
const pinnedLoopSelection = ref<SelectionId | null>(null);
const sourceFollowEnabled = ref(true);
const sourceViewportRows = ref(27);
const sourceLineRows = ref<number[]>(lines.map(() => 1));
const stageElement = ref<HTMLElement | null>(null);
const sourcePanelElement = ref<HTMLElement | null>(null);
const codeScrollElement = ref<HTMLElement | null>(null);
const sourceMeasureElement = ref<HTMLElement | null>(null);
const activeIconElement = ref<HTMLElement | null>(null);
const playheadElement = ref<HTMLElement | null>(null);
const rankCells: Array<HTMLElement | undefined> = [];
const rankTargets: Array<{ x: number; y: number; size: number } | undefined> = [];
const rangeGeometry = ref<Record<string, { path: string; depth: number }>>({});
const rangeCanvas = ref({ width: 0, height: 0 });
const activeWord = ref<WordCue | null>(null);
const currentSceneIndex = ref(0);
const activeBroll = ref<BrollItem | null>(null);
const activeRankingSelection = ref<RankingSelection>(selections[0]);
const automaticSourceSelections = ref<TimelineSelection[]>([selections[0]]);
const activeRuntimeItem = ref<RankingSelection | null>(null);
const settledIds = ref<Set<RankingSelectionId>>(new Set());
let rangeResizeObserver: ResizeObserver | null = null;
let animationFrame = 0;
let previousTimestamp = 0;
let programTime = 0;
let playbackSceneIndex = -1;
let completedPass = false;

const automaticScriptLineIndex = computed(() => {
  const wordIndex = activeWord.value?.index;
  if (wordIndex !== undefined) {
    const lineIndex = lines.findIndex((line) => (
      line.tokens && wordIndex >= line.tokens[0] && wordIndex < line.tokens[1]
    ));
    if (lineIndex >= 0) return lineIndex;
  }
  return semanticRangeBounds.find((range) => range.id === activeRankingSelection.value.id)?.start ?? 0;
});

const automaticTargetBlock = computed(() => activeBroll.value ? brollBlock : rankingBlock);

const automaticBindingLineIndex = computed(() => {
  const selectionId = activeBroll.value?.id ?? activeRankingSelection.value.id;
  const block = automaticTargetBlock.value;
  const lineIndex = lines.findIndex((line, index) => (
    index >= block.start && index <= block.end && line.selection === selectionId
  ));
  return lineIndex >= 0 ? lineIndex : block.start;
});

const displayedLines = computed<DisplayedSourceLine[]>(() => {
  if (!sourceFollowEnabled.value) {
    return buildFullSourceView(lines);
  }

  const sideRows = Math.max(3, Math.floor((sourceViewportRows.value - 1) / 2));
  const activeRanges = activeSourceSelections.value
    .map((selection) => semanticRangeBounds.find((range) => range.id === selection.id))
    .filter((range): range is SemanticRangeBounds => range !== undefined)
    .sort((left, right) => left.depth - right.depth);

  return buildFoldedSourceView({
    lines,
    rowSpans: sourceLineRows.value,
    rowBudget: sideRows,
    topRanges: activeRanges,
    topFocus: automaticScriptLineIndex.value,
    bottomLine: automaticBindingLineIndex.value,
  });
});

function wordAt(time: number): WordCue | null {
  for (const [index, cue] of wordCues.entries()) {
    if (time >= cue.start && time < cue.end) return cue;
    const nextStart = wordCues[index + 1]?.start ?? TOTAL_DURATION;
    if (time >= cue.end && time < Math.min(nextStart, cue.end + .08)) return cue;
  }
  return null;
}

const activeCaptionWords = computed(() => {
  const word = activeWord.value;
  if (!word) return [];
  const segmentStart = word.index < 42 ? 0 : word.index < 89 ? 42 : 89;
  const segmentEnd = word.index < 42 ? 42 : word.index < 89 ? 89 : 135;
  const cueStart = segmentStart + Math.floor((word.index - segmentStart) / 3) * 3;
  return wordCues.slice(cueStart, Math.min(cueStart + 3, segmentEnd));
});

function renderedLineHtml(index: number) {
  let html = decoratedLines[index];
  const word = activeWord.value;
  if (word) {
    html = html.replace(
      `class="script-word" data-word-index="${word.index}"`,
      `class="script-word active" data-word-index="${word.index}"`,
    );
  }
  for (const selection of activeSourceSelections.value) {
    const depth = semanticRangeBounds.find((range) => range.id === selection.id)?.depth ?? 0;
    html = html.replaceAll(
      `semantic-token" data-selection="${selection.id}"`,
      `semantic-token semantic-active semantic-depth-${depth}" data-selection="${selection.id}"`,
    );
  }
  return html;
}

function bindingDepth(line: SourceLine) {
  if (!line.selection || !activeSourceSelections.value.some((selection) => selection.id === line.selection)) {
    return -1;
  }
  return semanticRangeBounds.find((range) => range.id === line.selection)?.depth ?? 0;
}

function roundedRangePath(points: Array<{ x: number; y: number }>, radius = 6) {
  return points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const previousLength = Math.hypot(previous.x - point.x, previous.y - point.y) || 1;
    const nextLength = Math.hypot(next.x - point.x, next.y - point.y) || 1;
    const cornerRadius = Math.min(radius, previousLength / 2, nextLength / 2);
    const before = {
      x: point.x + (previous.x - point.x) * cornerRadius / previousLength,
      y: point.y + (previous.y - point.y) * cornerRadius / previousLength,
    };
    const after = {
      x: point.x + (next.x - point.x) * cornerRadius / nextLength,
      y: point.y + (next.y - point.y) * cornerRadius / nextLength,
    };
    return `${index === 0 ? "M" : "L"} ${before.x} ${before.y} Q ${point.x} ${point.y} ${after.x} ${after.y}`;
  }).join(" ") + " Z";
}

function updateRangeGeometry() {
  const container = codeScrollElement.value;
  if (!container) return;
  const containerRect = container.getBoundingClientRect();
  const width = container.clientWidth;
  const renderedLines = Array.from(container.querySelectorAll<HTMLElement>(":scope > .code-line"));
  const lastRenderedLine = renderedLines.at(-1);
  const paddingBottom = Number.parseFloat(getComputedStyle(container).paddingBottom) || 0;
  const contentHeight = lastRenderedLine
    ? lastRenderedLine.offsetTop + lastRenderedLine.offsetHeight + paddingBottom
    : container.clientHeight;
  const height = Math.max(container.clientHeight, contentHeight);
  const geometry: Record<string, { path: string; depth: number }> = {};
  const markers = Array.from(container.querySelectorAll<HTMLElement>(".syn-marker[data-selection]"));

  for (const range of semanticRangeBounds) {
    const startMarker = markers.find((marker) => (
      marker.dataset.selection === range.id && marker.textContent?.trim() === `@${range.id}`
    ));
    const endMarker = markers.find((marker) => (
      marker.dataset.selection === range.id && marker.textContent?.trim().startsWith(`@/${range.id}`)
    ));
    const startLine = startMarker?.closest<HTMLElement>(".code-line");
    const endLine = endMarker?.closest<HTMLElement>(".code-line");
    if (!startMarker || !endMarker || !startLine || !endLine) continue;

    const startRect = startMarker.getBoundingClientRect();
    const endRect = endMarker.getBoundingClientRect();
    const offsetX = container.scrollLeft - containerRect.left;
    const offsetY = container.scrollTop - containerRect.top;
    const inlinePadding = 3;
    const edgeOverhang = 3;
    const left = 44 - edgeOverhang;
    const right = width - 12 + edgeOverhang;
    const startX = Math.max(3, Math.min(width - 3, startRect.left + offsetX - inlinePadding));
    const endX = Math.max(3, Math.min(width - 3, endRect.right + offsetX + inlinePadding));
    const lineHeight = Number.parseFloat(getComputedStyle(startLine).lineHeight) || 26;
    const blockPadding = 0;
    const startCenter = (startRect.top + startRect.bottom) / 2 + offsetY;
    const endCenter = (endRect.top + endRect.bottom) / 2 + offsetY;
    const top = startCenter - lineHeight / 2 - blockPadding;
    const startBottom = startCenter + lineHeight / 2;
    const endTop = endCenter - lineHeight / 2;
    const bottom = endCenter + lineHeight / 2 + blockPadding;
    const sameVisualLine = Math.abs(startCenter - endCenter) < lineHeight / 2;
    const points = sameVisualLine
      ? [
        { x: startX, y: top },
        { x: endX, y: top },
        { x: endX, y: bottom },
        { x: startX, y: bottom },
      ]
      : [
        { x: startX, y: top },
        { x: right, y: top },
        { x: right, y: endTop },
        { x: endX, y: endTop },
        { x: endX, y: bottom },
        { x: left, y: bottom },
        { x: left, y: startBottom },
        { x: startX, y: startBottom },
      ];
    const path = roundedRangePath(points);
    geometry[range.id] = { path, depth: range.depth };
  }

  rangeCanvas.value = { width, height };
  rangeGeometry.value = geometry;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress;
const easeInOutCubic = (value: number) => value < .5
  ? 4 * value * value * value
  : 1 - Math.pow(-2 * value + 2, 3) / 2;
const outBack = (value: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
};

const runtimeItems = selections.map((selection) => ({
  ...selection,
  start: selection.start + .1,
  end: selection.end - .3,
}));

const baseVideos: HTMLVideoElement[] = [];

function setBaseVideo(element: unknown, index: number) {
  if (element && typeof element === "object" && "currentTime" in element) {
    baseVideos[index] = element as HTMLVideoElement;
  }
}

function setRankCell(element: unknown, rank: number) {
  if (element instanceof HTMLElement) rankCells[rank] = element;
}

const resolvedSelection = computed<RankingSelection>(() => {
  if (pinnedSelection.value) {
    const pinnedRanking = selections.find((item) => item.id === pinnedSelection.value);
    if (pinnedRanking) return pinnedRanking;
  }
  return activeRankingSelection.value;
});

const resolvedBrollSelection = computed<BrollItem | null>(() => {
  if (pinnedSelection.value) {
    const pinned = brollItems.find((item) => item.id === pinnedSelection.value);
    if (pinned) return pinned;
  }
  return activeBroll.value;
});

const activeSourceSelections = computed<TimelineSelection[]>(() => {
  if (!pinnedSelection.value) return automaticSourceSelections.value;
  return [
    resolvedSelection.value,
    ...(resolvedBrollSelection.value ? [resolvedBrollSelection.value] : []),
  ];
});

function sceneIndexAt(time: number) {
  const index = baseScenes.findIndex((scene) => time >= scene.start && time < scene.end);
  return index === -1 ? baseScenes.length - 1 : index;
}

function syncDiscreteState(time: number, force = false) {
  const nextSceneIndex = sceneIndexAt(time);
  const sceneChanged = force || currentSceneIndex.value !== nextSceneIndex;
  if (sceneChanged) currentSceneIndex.value = nextSceneIndex;

  const nextBroll = brollItems.find((item) => time >= item.start && time < item.end) ?? null;
  if (force || activeBroll.value?.id !== nextBroll?.id) activeBroll.value = nextBroll;

  const nextRanking = selections.find((item) => time >= item.start && time < item.end)
    ?? selections.find((item) => time < item.start)
    ?? selections[selections.length - 1];
  if (force || activeRankingSelection.value.id !== nextRanking.id) {
    activeRankingSelection.value = nextRanking;
  }

  const nextSourceSelections = semanticSelections.filter((item) => time >= item.start && time < item.end);
  const sourceSelectionsChanged = nextSourceSelections.length !== automaticSourceSelections.value.length
    || nextSourceSelections.some((item, index) => item.id !== automaticSourceSelections.value[index]?.id);
  if (force || sourceSelectionsChanged) automaticSourceSelections.value = nextSourceSelections;

  const nextRuntimeItem = runtimeItems.find((item) => time >= item.start && time < item.end) ?? null;
  if (force || activeRuntimeItem.value?.id !== nextRuntimeItem?.id) {
    activeRuntimeItem.value = nextRuntimeItem;
    void nextTick().then(() => updateContinuousVisuals(programTime));
  }

  const nextSettledIds = new Set(runtimeItems.filter((item) => time >= item.end).map((item) => item.id));
  const settledChanged = nextSettledIds.size !== settledIds.value.size
    || [...nextSettledIds].some((id) => !settledIds.value.has(id));
  if (force || settledChanged) settledIds.value = nextSettledIds;

  const nextWord = wordAt(time);
  if (force || activeWord.value?.index !== nextWord?.index) activeWord.value = nextWord;
  return sceneChanged;
}

function updateRankTargets() {
  const stageRect = stageElement.value?.getBoundingClientRect();
  if (!stageRect) return;
  for (let rank = 1; rank <= 5; rank += 1) {
    const cellRect = rankCells[rank]?.getBoundingClientRect();
    if (!cellRect) continue;
    rankTargets[rank] = {
      x: (cellRect.left - stageRect.left + cellRect.width / 2) / stageRect.width * 100,
      y: (cellRect.top - stageRect.top + cellRect.height / 2) / stageRect.height * 100,
      size: cellRect.width / stageRect.width * 100,
    };
  }
}

function updateContinuousVisuals(time: number) {
  if (playheadElement.value) {
    playheadElement.value.style.left = `${Math.min(100, Math.max(0, time / TOTAL_DURATION * 100))}%`;
  }
  const item = activeRuntimeItem.value;
  const icon = activeIconElement.value;
  if (!item || !icon) return;
  const duration = item.end - item.start;
  const elapsed = time - item.start;
  const moveStart = Math.max(ENTER_DURATION, duration - MOVE_DURATION);
  let centerX = 66.0185;
  let centerY = 73.0208;
  let size = 33;
  let opacity = 1;
  let scale = 1;
  let rotate = 0;

  if (elapsed < ENTER_DURATION) {
    const phase = outBack(clamp01(elapsed / ENTER_DURATION));
    centerY = lerp(104.6406, 73.0208, phase);
    opacity = Math.min(1, phase * 2.2);
    scale = .96 + .04 * phase;
  } else if (elapsed < moveStart) {
    const idle = (elapsed - ENTER_DURATION) / Math.max(.001, moveStart - ENTER_DURATION);
    const wave = Math.sin(idle * Math.PI * 2);
    const wave2 = Math.sin(idle * Math.PI * 2 + Math.PI / 2);
    centerY = 73.0208 - .09375 * wave;
    centerX = 66.0185 + .0741 * wave2;
    scale = 1.004 + .003 * wave2;
    rotate = .12 * wave;
  } else {
    const phase = easeInOutCubic(clamp01((elapsed - moveStart) / MOVE_DURATION));
    const rankIndex = item.rank - 1;
    const target = rankTargets[item.rank];
    const targetX = target?.x ?? 20.55;
    const targetY = target?.y ?? 23.23 + rankIndex * 7.29;
    const targetSize = target?.size ?? 8.89;
    centerX = lerp(66.0185, targetX, phase);
    centerY = lerp(73.0208, targetY, phase);
    size = lerp(33, targetSize, phase);
    scale = 1 - .02 * Math.sin(phase * Math.PI);
  }

  icon.style.left = `${centerX - size / 2}%`;
  icon.style.top = `${centerY - size * .5625 / 2}%`;
  icon.style.width = `${size}%`;
  icon.style.opacity = `${opacity}`;
  icon.style.transform = `scale(${scale}) rotate(${rotate}deg)`;
}

function syncBaseVideos(force = false) {
  const activeIndex = sceneIndexAt(programTime);
  const scene = baseScenes[activeIndex];
  const localTime = Math.max(0, programTime - scene.start);
  const sceneChanged = playbackSceneIndex !== activeIndex;

  baseVideos.forEach((video, index) => {
    if (!video) return;
    video.muted = !audioEnabled.value || index !== activeIndex;
    if (index !== activeIndex) {
      video.pause();
      return;
    }
    if (force || sceneChanged) video.currentTime = localTime;
    if (props.active && video.paused) void video.play().catch(() => undefined);
  });
  playbackSceneIndex = activeIndex;
}

function enableAudio(event?: Event) {
  if (event?.target instanceof Element && event.target.closest(".live-audio-toggle")) return;
  if (!enableDemoAudioAfterInteraction()) return;
  syncBaseVideos();
}

function toggleAudio() {
  toggleDemoAudio();
  syncBaseVideos();
}

async function seekTo(selection: TimelineSelection, lineIndex: number | null = null) {
  pinnedSelection.value = selection.id;
  const selectedBounds = semanticRangeBounds.find((range) => range.id === selection.id);
  const outermostBounds = selectedBounds
    ? semanticRangeBounds
      .filter((range) => range.start <= selectedBounds.start && range.end >= selectedBounds.end)
      .sort((left, right) => left.depth - right.depth)[0]
    : undefined;
  pinnedLoopSelection.value = outermostBounds?.id ?? selection.id;
  activeLine.value = lineIndex;
  programTime = selection.start;
  previousTimestamp = 0;
  syncDiscreteState(programTime, true);
  syncBaseVideos(true);
  updateContinuousVisuals(programTime);
}

function selectRange(selection: TimelineSelection, index: number) {
  if (pinnedSelection.value === selection.id) {
    activeLine.value = index;
    return;
  }
  void seekTo(selection, index);
}

function inspectToken(event: Event, index: number) {
  const element = event.target instanceof Element
    ? event.target.closest<HTMLElement>("[data-selection]")
    : null;
  const id = element?.dataset.selection as SelectionId | undefined;
  if (!id) return;
  const selection = semanticSelections.find((item) => item.id === id);
  if (selection) selectRange(selection, index);
}

function inspectLine(line: SourceLine, index: number) {
  const id = line.range ?? line.selection;
  if (!id) {
    clearInspection();
    return;
  }
  const selection = semanticSelections.find((item) => item.id === id);
  if (selection) selectRange(selection, index);
}

function clearInspection() {
  activeLine.value = null;
  pinnedSelection.value = null;
  pinnedLoopSelection.value = null;
}

function stopSourceFollow(event?: MouseEvent) {
  if (!sourceFollowEnabled.value) return;
  const container = codeScrollElement.value;
  const hoveredLine = event?.target instanceof Element && container
    ? event.target.closest<HTMLElement>("[data-source-line]")
    : null;
  const lineIndex = Number(hoveredLine?.dataset.sourceLine);
  const lineOffset = event && hoveredLine ? event.clientY - hoveredLine.getBoundingClientRect().top : 0;
  const targetTop = event && hoveredLine ? event.clientY - lineOffset : null;
  sourceFollowEnabled.value = false;
  if (!container || !Number.isInteger(lineIndex) || targetTop === null) return;
  void nextTick().then(() => {
    const expandedLine = container.querySelector<HTMLElement>(`[data-source-line="${lineIndex}"]`);
    if (!expandedLine) return;
    const previousBehavior = container.style.scrollBehavior;
    container.style.scrollBehavior = "auto";
    container.scrollTop += expandedLine.getBoundingClientRect().top - targetTop;
    container.style.scrollBehavior = previousBehavior;
    updateRangeGeometry();
  });
}

function resumeSourceFollow() {
  clearInspection();
  sourceFollowEnabled.value = true;
}

function handleDemoPointerMove(event: PointerEvent) {
  const target = event.target instanceof Element ? event.target : null;
  if (!target?.closest(".source-panel")) resumeSourceFollow();
}

function renderFrame(timestamp: number) {
  if (!props.active) {
    animationFrame = 0;
    return;
  }
  if (!previousTimestamp) previousTimestamp = timestamp;
  const delta = Math.min(.05, (timestamp - previousTimestamp) / 1000);
  previousTimestamp = timestamp;
  const scene = baseScenes[currentSceneIndex.value];
  const video = baseVideos[currentSceneIndex.value];
  let nextTime = video && !video.paused && video.readyState >= 2
    ? scene.start + video.currentTime
    : programTime + delta;
  let looped = false;
  if (pinnedLoopSelection.value) {
    const selection = semanticSelections.find((candidate) => candidate.id === pinnedLoopSelection.value);
    if (selection && nextTime >= selection.end) {
      nextTime = selection.start;
      looped = true;
    }
  } else if (nextTime >= TOTAL_DURATION) {
    if (!completedPass) {
      completedPass = true;
      emit("ended");
    }
    nextTime = 0;
    looped = true;
  }
  programTime = nextTime;
  const sceneChanged = syncDiscreteState(programTime, looped);
  if (looped || sceneChanged) syncBaseVideos(true);
  updateContinuousVisuals(programTime);
  animationFrame = requestAnimationFrame(renderFrame);
}

function stopPlayback() {
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  previousTimestamp = 0;
  baseVideos.forEach((video) => video?.pause());
}

function startPlayback() {
  stopPlayback();
  programTime = 0;
  playbackSceneIndex = -1;
  completedPass = false;
  pinnedSelection.value = null;
  pinnedLoopSelection.value = null;
  syncDiscreteState(programTime, true);
  syncBaseVideos(true);
  updateContinuousVisuals(programTime);
  syncSourceHoverState();
  animationFrame = requestAnimationFrame(renderFrame);
}

function syncSourceHoverState() {
  const sourceHovered = demoPointerIsInside(sourcePanelElement.value);
  if (!sourceHovered) clearInspection();
  sourceFollowEnabled.value = !sourceHovered;
}

function updateSourceViewportRows() {
  const container = codeScrollElement.value;
  if (!container) return;
  let rows = Math.max(7, Math.floor(container.clientHeight / 26));
  if (rows % 2 === 0) rows -= 1;
  if (sourceViewportRows.value !== rows) sourceViewportRows.value = rows;
  const padding = Math.max(0, (container.clientHeight - rows * 26) / 2);
  container.style.setProperty("--source-vertical-padding", `${padding}px`);

  const measuredRows = Array.from(
    sourceMeasureElement.value?.querySelectorAll<HTMLElement>("[data-measure-line]") ?? [],
  ).map((line) => Math.max(1, Math.ceil(line.getBoundingClientRect().height / 26)));
  const measurementChanged = measuredRows.length === lines.length && measuredRows.some(
    (rowSpan, index) => rowSpan !== sourceLineRows.value[index],
  );
  if (measurementChanged) sourceLineRows.value = measuredRows;
}

function updateLayoutGeometry() {
  updateSourceViewportRows();
  updateRangeGeometry();
  updateRankTargets();
  updateContinuousVisuals(programTime);
}

watch(
  [() => displayedLines.value.map((entry) => entry.key).join("|"), sourceFollowEnabled],
  () => {
    void nextTick().then(() => {
      updateLayoutGeometry();
    });
  },
  { flush: "post" },
);

watch(
  () => props.active,
  (active) => {
    if (active) void nextTick().then(startPlayback);
    else stopPlayback();
  },
  { flush: "post" },
);

onMounted(() => {
  initializeDemoAudio();
  window.addEventListener("pointerdown", enableAudio, { capture: true, once: true });
  window.addEventListener("keydown", enableAudio, { capture: true, once: true });
  if (navigator.userActivation?.hasBeenActive) enableAudio();
  void nextTick().then(() => {
    updateLayoutGeometry();
    syncDiscreteState(programTime, true);
    if (props.active) startPlayback();
    if (codeScrollElement.value) {
      rangeResizeObserver = new ResizeObserver(updateLayoutGeometry);
      rangeResizeObserver.observe(codeScrollElement.value);
    }
  });
  window.addEventListener("resize", updateLayoutGeometry);
});
onBeforeUnmount(() => {
  stopPlayback();
  window.removeEventListener("pointerdown", enableAudio, true);
  window.removeEventListener("keydown", enableAudio, true);
  window.removeEventListener("resize", updateLayoutGeometry);
  rangeResizeObserver?.disconnect();
});
</script>

<template>
  <section class="svml-demo" aria-label="SVML 交互式实时渲染预览">
    <header v-if="props.showHeading" class="demo-heading">
      <h2>悬停标记范围，查看对应画面</h2>
    </header>

    <div
      class="demo-shell real-demo-shell"
      @pointermove="handleDemoPointerMove"
      @mouseleave="clearInspection"
    >
      <div
        ref="sourcePanelElement"
        class="source-panel"
        :class="{ 'source-following': sourceFollowEnabled }"
        @pointermove="stopSourceFollow"
        @pointerdown="stopSourceFollow"
        @wheel="stopSourceFollow"
        @pointerleave="resumeSourceFollow"
      >
        <div ref="sourceMeasureElement" class="source-measure" aria-hidden="true">
          <div
            v-for="(html, index) in decoratedLines"
            :key="index"
            class="code-line"
            :data-measure-line="index"
          >
            <span class="line-number">{{ index + 1 }}</span>
            <code v-html="html || '&nbsp;'" />
          </div>
        </div>
        <div class="source-follow-hint">
          {{ sourceFollowEnabled ? "移入查看所有源码" : "移出查看精简视图" }}
        </div>
        <div ref="codeScrollElement" class="code-scroll" aria-label="SVML source code">
          <svg
            v-if="rangeCanvas.width && rangeCanvas.height"
            class="semantic-range-canvas"
            :width="rangeCanvas.width"
            :height="rangeCanvas.height"
            :viewBox="`0 0 ${rangeCanvas.width} ${rangeCanvas.height}`"
            aria-hidden="true"
          >
            <path
              v-for="selection in activeSourceSelections"
              :key="selection.id"
              :class="`depth-${rangeGeometry[selection.id]?.depth ?? 0}`"
              :d="rangeGeometry[selection.id]?.path"
            />
          </svg>
          <template v-for="entry in displayedLines" :key="entry.key">
            <div
              v-if="entry.kind === 'fold'"
              class="code-line code-fold"
              :data-source-line="entry.index"
              aria-hidden="true"
            >
              <code>···</code>
            </div>
            <div
              v-else-if="entry.line"
              class="code-line"
              :data-source-line="entry.index"
              :class="{
                'binding-active': bindingDepth(entry.line) >= 0,
                'binding-depth-1': bindingDepth(entry.line) === 1,
              }"
              @mouseover="inspectLine(entry.line, entry.index)"
            >
              <span class="line-number">{{ entry.index + 1 }}</span>
              <code
                v-html="renderedLineHtml(entry.index) || '&nbsp;'"
                @mouseover="inspectToken($event, entry.index)"
                @focusin="inspectToken($event, entry.index)"
                @click="inspectToken($event, entry.index)"
                @keydown.enter.prevent="inspectToken($event, entry.index)"
                @keydown.space.prevent="inspectToken($event, entry.index)"
              />
            </div>
          </template>
        </div>
      </div>

      <div class="preview-panel">
        <div class="real-preview-body">
          <div ref="stageElement" class="live-ranking-stage" aria-label="Twinit RankingColumn 实时渲染画面">
            <div class="live-base-layer">
              <video
                v-for="(scene, index) in baseScenes"
                :key="scene.src"
                :ref="(element) => setBaseVideo(element, index)"
                :class="{ active: currentSceneIndex === index }"
                :src="resolveDemoMedia(scene.src)"
                :muted="!audioEnabled || currentSceneIndex !== index"
                playsinline
                preload="auto"
                @loadedmetadata="syncBaseVideos(true)"
              />
            </div>

            <div class="live-title">RANKING AI PHOTO APPS FOR GUYS<br>WITH NO GOOD PICS</div>

            <div class="live-ranking-board">
              <div v-for="rank in 5" :key="rank" class="live-rank-row">
                <strong :style="{ background: runtimeItems[5 - rank].color }">{{ rank }}</strong>
                <span
                  :ref="(element) => setRankCell(element, rank)"
                  class="live-rank-cell"
                  :class="{ 'semantic-selected': !activeRuntimeItem && resolvedSelection.id === runtimeItems[5 - rank].id }"
                >
                  <img
                    v-if="settledIds.has(runtimeItems[5 - rank].id)"
                    :src="resolveDemoMedia(runtimeItems[5 - rank].icon)"
                    :alt="runtimeItems[5 - rank].label"
                  >
                </span>
              </div>
            </div>

            <div
              v-if="activeRuntimeItem"
              ref="activeIconElement"
              class="live-active-icon"
              :class="{ 'semantic-selected': resolvedSelection.id === activeRuntimeItem.id }"
            >
              <img :src="resolveDemoMedia(activeRuntimeItem.icon)" :alt="activeRuntimeItem.label">
              <i></i>
            </div>

            <img
              v-if="activeBroll"
              class="live-broll"
              :class="{ 'semantic-selected': activeSourceSelections.some((selection) => selection.id === activeBroll.id) }"
              :src="resolveDemoMedia(activeBroll.src)"
              alt=""
              :style="{ transform: `scale(${activeBroll.zoom})` }"
            >

            <div v-if="activeCaptionWords.length" class="live-caption" aria-hidden="true">
              <span
                v-for="word in activeCaptionWords"
                :key="word.index"
                :class="{ active: activeWord?.index === word.index }"
              >{{ word.text }}</span>
            </div>

            <button
              class="live-audio-toggle"
              type="button"
              :aria-label="audioEnabled ? '静音' : '取消静音'"
              :title="audioEnabled ? '静音' : '取消静音'"
              @click.stop="toggleAudio"
            >
              <svg v-if="audioEnabled" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.25-3.9v7.8A4.5 4.5 0 0 0 16.5 12zm-2.25-8.6v2.1a7 7 0 0 1 0 13v2.1a9 9 0 0 0 0-17.2z"/>
              </svg>
              <svg v-else viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 9v6h4l5 4V5L8 9H4zm12.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4-2.7-2.7z"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="real-semantic-controls">
          <div class="semantic-timeline">
            <div class="timeline-labels ranking-labels">
              <button
                v-for="selection in selections"
                :key="selection.id"
                type="button"
                :class="{ current: resolvedSelection.id === selection.id }"
                :style="{ flexGrow: selection.end - selection.start }"
                @click="seekTo(selection)"
              >@{{ selection.id }}</button>
            </div>
            <div class="timeline-track ranking-track">
              <span
                v-for="selection in selections"
                :key="selection.id"
                class="segment"
                :style="{ flexGrow: selection.end - selection.start }"
              ></span>
              <i ref="playheadElement" class="playhead"></i>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.live-active-icon.semantic-selected,
.live-rank-cell.semantic-selected {
  outline: 1px solid #ec4899;
  outline-offset: 3px;
}

.live-broll.semantic-selected {
  outline: 1px solid rgba(99, 216, 255, .95);
  outline-offset: -5px;
}
</style>
