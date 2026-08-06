<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  demoAudioEnabled as audioEnabled,
  demoAudioPlaybackEnabled as audioPlaybackEnabled,
  enableDemoAudioAfterInteraction,
  initializeDemoAudio,
  toggleDemoAudio,
} from "./demo-audio";
import { goodBetterBestMedia, resolveDemoMedia } from "./demo-media";
import { demoPointerIsInside } from "./demo-pointer";
import { wordAtTime } from "./demo-word-timing";
import { useSourcePanelInteraction } from "./source-panel-interaction";
import {
  semanticVideoDemos,
  type DemoId,
  type DemoSelection,
  type DemoSourceLine,
  type WordCue,
} from "./semantic-video-demos";
import {
  buildFoldedSourceView,
  buildFullSourceView,
  type SourceDisplayEntry,
} from "./source-display";

const props = withDefaults(defineProps<{ demo: DemoId; active?: boolean; showHeading?: boolean }>(), {
  active: true,
  showHeading: true,
});
const emit = defineEmits<{ ended: [] }>();
const config = semanticVideoDemos[props.demo];
const sourceLines = config.lines;
const sceneSelections = config.selections.filter((selection) => selection.layer === "scene");
const overlaySelections = config.selections.filter((selection) => selection.layer === "overlay");

type RangeBounds = {
  id: string;
  start: number;
  end: number;
  depth: number;
};

type DisplayLine = SourceDisplayEntry<DemoSourceLine>;

const rawBounds = config.selections.map((selection) => ({
  id: selection.id,
  start: sourceLines.findIndex((line) => line.html.includes(`>@${selection.id}</span>`)),
  end: sourceLines.findIndex((line) => line.html.includes(`>@/${selection.id}</span>`)),
})).filter((range) => range.start >= 0 && range.end >= range.start);

const rangeBounds: RangeBounds[] = rawBounds.map((range) => ({
  ...range,
  depth: rawBounds.filter((candidate) => (
    candidate.id !== range.id
    && candidate.start <= range.start
    && candidate.end >= range.end
  )).length,
}));

function decorateLine(line: DemoSourceLine) {
  if (!line.tokens) return line.html;
  let cueIndex = line.tokens[0];
  const end = line.tokens[1];
  return line.html.split(/(<span\b[^>]*>.*?<\/span>)/giu).map((part) => {
    if (part.startsWith("<span")) return part;
    let output = "";
    let cursor = 0;
    while (cueIndex < end) {
      const cue = config.words[cueIndex];
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

const decoratedLines = sourceLines.map(decorateLine);
const sourceFollowEnabled = ref(true);
const pinnedSelection = ref<string | null>(null);
const pinnedLoopSelection = ref<string | null>(null);
const activeWord = ref<WordCue | null>(null);
const currentSceneIndex = ref(0);
const activeSceneSelection = ref(sceneSelections[0]);
const activeOverlaySelection = ref<DemoSelection | null>(null);
const visibleLogoCount = ref(0);
const sourceViewportRows = ref(27);
const sourceLineRows = ref<number[]>(sourceLines.map(() => 1));
const sourcePanelElement = ref<HTMLElement | null>(null);
const codeScrollElement = ref<HTMLElement | null>(null);
const sourceMeasureElement = ref<HTMLElement | null>(null);
const playheadElement = ref<HTMLElement | null>(null);
const rangeCanvas = ref({ width: 0, height: 0 });
const rangeGeometry = ref<Record<string, { path: string; depth: number }>>({});
const baseVideos: HTMLVideoElement[] = [];
const overlayVideos: HTMLVideoElement[] = [];
let resizeObserver: ResizeObserver | null = null;
let rangeMutationObserver: MutationObserver | null = null;
let animationFrame = 0;
let previousTimestamp = 0;
let programTime = 0;
let playbackSceneIndex = -1;
let playbackOverlayId: string | null = null;
let completedPass = false;

function setBaseVideo(element: unknown, index: number) {
  if (element && typeof element === "object" && "currentTime" in element) {
    baseVideos[index] = element as HTMLVideoElement;
  }
}

function setOverlayVideo(element: unknown, index: number) {
  if (element && typeof element === "object" && "currentTime" in element) {
    overlayVideos[index] = element as HTMLVideoElement;
  }
}

function wordAt(time: number) {
  return wordAtTime(config.words, time);
}

const activeCaptionWords = computed(() => {
  const word = activeWord.value;
  if (!word) return [];
  const start = Math.floor(word.index / 3) * 3;
  return config.words.slice(start, start + 3);
});

const automaticSelections = computed(() => [
  activeSceneSelection.value,
  ...(activeOverlaySelection.value ? [activeOverlaySelection.value] : []),
]);

const sourceSelections = computed(() => {
  if (!pinnedSelection.value) return automaticSelections.value;
  const pinned = config.selections.find((selection) => selection.id === pinnedSelection.value);
  if (!pinned) return automaticSelections.value;
  const bounds = rangeBounds.find((range) => range.id === pinned.id);
  const outer = bounds
    ? rangeBounds
      .filter((candidate) => candidate.start <= bounds.start && candidate.end >= bounds.end)
      .sort((left, right) => left.depth - right.depth)[0]
    : undefined;
  const outerSelection = config.selections.find((selection) => selection.id === outer?.id);
  const pinnedSelections = outerSelection && outerSelection.id !== pinned.id
    ? [outerSelection, pinned]
    : [pinned];
  const activeNestedOverlay = pinned.layer === "scene"
    && activeOverlaySelection.value
    && activeOverlaySelection.value.start >= pinned.start
    && activeOverlaySelection.value.end <= pinned.end
    ? activeOverlaySelection.value
    : null;
  return activeNestedOverlay ? [...pinnedSelections, activeNestedOverlay] : pinnedSelections;
});

const sourceWordLine = computed(() => {
  const wordIndex = activeWord.value?.index;
  if (wordIndex === undefined) return rangeBounds.find((range) => range.id === activeSceneSelection.value.id)?.start ?? 0;
  const lineIndex = sourceLines.findIndex((line) => line.tokens && wordIndex >= line.tokens[0] && wordIndex < line.tokens[1]);
  return lineIndex >= 0 ? lineIndex : 0;
});

const bindingLine = computed(() => {
  const id = activeOverlaySelection.value?.id ?? activeSceneSelection.value.id;
  const index = sourceLines.findIndex((line, lineIndex) => line.selection === id && lineIndex > 24);
  if (index >= 0) return index;
  const scriptEnd = sourceLines.findIndex((line) => line.html.includes("&lt;/script&gt;"));
  return Math.min(sourceLines.length - 1, scriptEnd + 2);
});

const displayedLines = computed<DisplayLine[]>(() => {
  if (!sourceFollowEnabled.value) {
    return buildFullSourceView(sourceLines);
  }

  const sideRows = Math.max(3, Math.floor((sourceViewportRows.value - 1) / 2));
  const activeRanges = sourceSelections.value
    .map((selection) => rangeBounds.find((range) => range.id === selection.id))
    .filter((range): range is RangeBounds => range !== undefined)
    .sort((left, right) => left.depth - right.depth);

  return buildFoldedSourceView({
    lines: sourceLines,
    rowSpans: sourceLineRows.value,
    rowBudget: sideRows,
    topRanges: activeRanges,
    topFocus: sourceWordLine.value,
    bottomLine: bindingLine.value,
  });
});

function renderedLineHtml(index: number) {
  let html = decoratedLines[index];
  if (activeWord.value) {
    html = html.replace(
      `class="script-word" data-word-index="${activeWord.value.index}"`,
      `class="script-word active" data-word-index="${activeWord.value.index}"`,
    );
  }
  for (const selection of sourceSelections.value) {
    const depth = rangeBounds.find((range) => range.id === selection.id)?.depth ?? 0;
    html = html.replaceAll(
      `semantic-token" data-selection="${selection.id}"`,
      `semantic-token semantic-active semantic-depth-${depth}" data-selection="${selection.id}"`,
    );
  }
  return html;
}

function bindingDepth(line: DemoSourceLine) {
  if (!line.selection || !sourceSelections.value.some((selection) => selection.id === line.selection)) return -1;
  return rangeBounds.find((range) => range.id === line.selection)?.depth ?? 0;
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
  const scaleX = container.offsetWidth ? containerRect.width / container.offsetWidth : 1;
  const scaleY = container.offsetHeight ? containerRect.height / container.offsetHeight : 1;
  const renderedLines = Array.from(container.querySelectorAll<HTMLElement>(":scope > .code-line"));
  const lastLine = renderedLines.at(-1);
  const height = Math.max(container.clientHeight, lastLine ? lastLine.offsetTop + lastLine.offsetHeight : container.clientHeight);
  const markers = Array.from(container.querySelectorAll<HTMLElement>(".syn-marker[data-selection]"));
  const geometry: Record<string, { path: string; depth: number }> = {};

  for (const range of rangeBounds) {
    const startMarker = markers.find((marker) => marker.dataset.selection === range.id && marker.textContent?.trim() === `@${range.id}`);
    const endMarker = markers.find((marker) => marker.dataset.selection === range.id && marker.textContent?.trim() === `@/${range.id}`);
    const startLine = startMarker?.closest<HTMLElement>(".code-line");
    const endLine = endMarker?.closest<HTMLElement>(".code-line");
    if (!startMarker || !endMarker || !startLine || !endLine) continue;
    const startFragments = Array.from(startMarker.getClientRects());
    const endFragments = Array.from(endMarker.getClientRects());
    const startRect = startFragments[0] ?? startMarker.getBoundingClientRect();
    const endRect = endFragments.at(-1) ?? endMarker.getBoundingClientRect();
    const lineHeight = Number.parseFloat(getComputedStyle(startLine).lineHeight) || 26;
    const blockPadding = 0;
    const startCenter = ((startRect.top + startRect.bottom) / 2 - containerRect.top) / scaleY + container.scrollTop;
    const endCenter = ((endRect.top + endRect.bottom) / 2 - containerRect.top) / scaleY + container.scrollTop;
    const inlinePadding = 3;
    const edgeOverhang = 3;
    const startX = Math.max(3, Math.min(width - 3, (startRect.left - containerRect.left) / scaleX + container.scrollLeft - inlinePadding));
    const endX = Math.max(3, Math.min(width - 3, (endRect.right - containerRect.left) / scaleX + container.scrollLeft + inlinePadding));
    const left = 44 - edgeOverhang;
    const right = width - 12 + edgeOverhang;
    const top = startCenter - lineHeight / 2 - blockPadding;
    const bottom = endCenter + lineHeight / 2 + blockPadding;
    const sameLine = Math.abs(startCenter - endCenter) < lineHeight / 2;
    const endTop = endCenter - lineHeight / 2;
    const startBottom = startCenter + lineHeight / 2;
    const points = sameLine
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

function sceneIndexAt(time: number) {
  const index = config.scenes.findIndex((scene) => time >= scene.start && time < scene.end);
  return index === -1 ? config.scenes.length - 1 : index;
}

function syncState(time: number, force = false) {
  const nextSceneIndex = sceneIndexAt(time);
  const sceneChanged = force || nextSceneIndex !== currentSceneIndex.value;
  if (sceneChanged) currentSceneIndex.value = nextSceneIndex;
  const nextSceneSelection = sceneSelections.find((selection) => time >= selection.start && time < selection.end)
    ?? sceneSelections.find((selection) => time < selection.start)
    ?? sceneSelections.at(-1)!;
  if (force || nextSceneSelection.id !== activeSceneSelection.value.id) activeSceneSelection.value = nextSceneSelection;
  const nextOverlay = overlaySelections.find((selection) => time >= selection.start && time < selection.end) ?? null;
  if (force || nextOverlay?.id !== activeOverlaySelection.value?.id) activeOverlaySelection.value = nextOverlay;
  const nextWord = wordAt(time);
  if (force || nextWord?.index !== activeWord.value?.index) activeWord.value = nextWord;
  if (config.id === "good-better-best") {
    const nextLogoCount = time >= 23.12 ? 3 : time >= 14.12 ? 2 : time >= 4.01 ? 1 : 0;
    if (force || nextLogoCount !== visibleLogoCount.value) visibleLogoCount.value = nextLogoCount;
  }
  return sceneChanged;
}

function syncBaseVideos(force = false) {
  const activeIndex = sceneIndexAt(programTime);
  const scene = config.scenes[activeIndex];
  const localTime = scene.sourceStart + Math.max(0, programTime - scene.start);
  const sceneChanged = playbackSceneIndex !== activeIndex;
  baseVideos.forEach((video, index) => {
    if (!video) return;
    video.muted = !audioPlaybackEnabled.value || index !== activeIndex;
    if (index !== activeIndex) {
      video.pause();
      return;
    }
    if (force || sceneChanged || Math.abs(video.currentTime - localTime) > .2) video.currentTime = localTime;
    if (props.active && video.paused) void video.play().catch(() => undefined);
  });
  playbackSceneIndex = activeIndex;
}

function syncOverlayVideos(force = false) {
  if (config.id !== "street") return;
  overlayVideos.forEach((video, index) => {
    const selection = overlaySelections[index];
    const active = selection.id === activeOverlaySelection.value?.id;
    video.muted = true;
    if (!active) {
      video.pause();
      return;
    }
    const requestedTime = Math.max(0, programTime - selection.start);
    const sourceEnd = Number.isFinite(video.duration)
      ? Math.max(0, video.duration)
      : requestedTime;
    const localTime = Math.min(requestedTime, sourceEnd);
    if (force || playbackOverlayId !== selection.id || Math.abs(video.currentTime - localTime) > .2) video.currentTime = localTime;
    if (requestedTime >= sourceEnd) {
      video.pause();
      return;
    }
    if (props.active && video.paused) void video.play().catch(() => undefined);
  });
  playbackOverlayId = activeOverlaySelection.value?.id ?? null;
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

function seekTo(selection: DemoSelection, lineIndex: number | null = null) {
  pinnedSelection.value = selection.id;
  const bounds = rangeBounds.find((range) => range.id === selection.id);
  const outer = bounds
    ? rangeBounds
      .filter((candidate) => candidate.start <= bounds.start && candidate.end >= bounds.end)
      .sort((left, right) => left.depth - right.depth)[0]
    : undefined;
  pinnedLoopSelection.value = outer?.id ?? selection.id;
  programTime = selection.start;
  previousTimestamp = 0;
  syncState(programTime, true);
  syncBaseVideos(true);
  syncOverlayVideos(true);
  if (lineIndex !== null) void lineIndex;
}

function inspectLine(line: DemoSourceLine, index: number) {
  const id = line.range ?? line.selection;
  if (!id) {
    clearInspection();
    return;
  }
  const selection = config.selections.find((candidate) => candidate.id === id);
  if (selection && pinnedSelection.value !== selection.id) seekTo(selection, index);
}

function inspectToken(event: Event, index: number) {
  const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-selection]") : null;
  const selection = config.selections.find((candidate) => candidate.id === target?.dataset.selection);
  if (selection && pinnedSelection.value !== selection.id) seekTo(selection, index);
}

function clearInspection() {
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
  const measurementChanged = measuredRows.length === sourceLines.length && measuredRows.some(
    (rowSpan, index) => rowSpan !== sourceLineRows.value[index],
  );
  if (measurementChanged) sourceLineRows.value = measuredRows;
}

function updateLayoutGeometry() {
  updateSourceViewportRows();
  updateRangeGeometry();
}

function renderFrame(timestamp: number) {
  if (!props.active) {
    animationFrame = 0;
    return;
  }
  if (!previousTimestamp) previousTimestamp = timestamp;
  const delta = Math.min(.05, (timestamp - previousTimestamp) / 1000);
  previousTimestamp = timestamp;
  const scene = config.scenes[currentSceneIndex.value];
  const video = baseVideos[currentSceneIndex.value];
  let nextTime = video && !video.paused && video.readyState >= 2
    ? scene.start + video.currentTime - scene.sourceStart
    : programTime + delta;
  let looped = false;
  if (pinnedLoopSelection.value) {
    const loopSelection = config.selections.find((selection) => selection.id === pinnedLoopSelection.value);
    if (loopSelection && nextTime >= loopSelection.end) {
      nextTime = loopSelection.start;
      looped = true;
    }
  } else if (nextTime >= config.duration) {
    if (!completedPass) {
      completedPass = true;
      emit("ended");
    }
    nextTime = 0;
    looped = true;
  }
  programTime = nextTime;
  const sceneChanged = syncState(programTime, looped);
  if (looped || sceneChanged) syncBaseVideos(true);
  syncOverlayVideos(looped);
  if (playheadElement.value) playheadElement.value.style.left = `${Math.max(0, Math.min(100, programTime / config.duration * 100))}%`;
  animationFrame = requestAnimationFrame(renderFrame);
}

function stopPlayback() {
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  previousTimestamp = 0;
  baseVideos.forEach((video) => video?.pause());
  overlayVideos.forEach((video) => video?.pause());
}

function startPlayback() {
  stopPlayback();
  programTime = 0;
  playbackSceneIndex = -1;
  playbackOverlayId = null;
  completedPass = false;
  pinnedSelection.value = null;
  pinnedLoopSelection.value = null;
  syncState(programTime, true);
  syncBaseVideos(true);
  syncOverlayVideos(true);
  syncSourceHoverState();
  animationFrame = requestAnimationFrame(renderFrame);
}

function syncSourceHoverState() {
  if (!sourceUsesHover.value) {
    resumeSourceFollow();
    return;
  }
  const sourceHovered = demoPointerIsInside(sourcePanelElement.value);
  if (!sourceHovered) clearInspection();
  sourceFollowEnabled.value = !sourceHovered;
}

const {
  sourceUsesHover,
  handleSourcePointerMove,
  handleSourcePointerDown,
  handleSourceClick,
  handleSourceWheel,
  handleSourcePointerLeave,
} = useSourcePanelInteraction(sourcePanelElement, {
  active: () => props.active,
  expand: stopSourceFollow,
  collapse: resumeSourceFollow,
});

watch(
  [() => displayedLines.value.map((entry) => entry.key).join("|"), sourceFollowEnabled, sourceSelections],
  () => void nextTick().then(() => {
    updateSourceViewportRows();
    void nextTick().then(() => {
      updateLayoutGeometry();
      requestAnimationFrame(updateLayoutGeometry);
    });
  }),
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
  window.addEventListener("resize", updateLayoutGeometry);
  if (navigator.userActivation?.hasBeenActive) enableAudio();
  void nextTick().then(() => {
    syncState(0, true);
    if (props.active) startPlayback();
    updateLayoutGeometry();
    if (codeScrollElement.value) {
      resizeObserver = new ResizeObserver(updateLayoutGeometry);
      resizeObserver.observe(codeScrollElement.value);
      rangeMutationObserver = new MutationObserver(() => requestAnimationFrame(updateRangeGeometry));
      rangeMutationObserver.observe(codeScrollElement.value, { childList: true, subtree: true });
    }
  });
});

onBeforeUnmount(() => {
  stopPlayback();
  window.removeEventListener("pointerdown", enableAudio, true);
  window.removeEventListener("keydown", enableAudio, true);
  window.removeEventListener("resize", updateLayoutGeometry);
  resizeObserver?.disconnect();
  rangeMutationObserver?.disconnect();
});
</script>

<template>
  <section class="svml-demo semantic-video-demo" aria-label="SVML 交互式实时渲染预览">
    <header v-if="props.showHeading" class="demo-heading">
      <h2><span class="hover-interaction-copy">悬停标记范围，查看对应画面</span><span class="touch-interaction-copy">点击标记范围，查看对应画面</span></h2>
    </header>

    <div class="demo-shell real-demo-shell">
      <div
        ref="sourcePanelElement"
        class="source-panel"
        :class="{ 'source-following': sourceFollowEnabled }"
        @pointermove="handleSourcePointerMove"
        @pointerdown="handleSourcePointerDown"
        @click="handleSourceClick"
        @wheel="handleSourceWheel"
        @pointerleave="handleSourcePointerLeave"
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
          {{ sourceUsesHover
            ? (sourceFollowEnabled ? "移入查看所有源码" : "移出查看精简视图")
            : (sourceFollowEnabled ? "点击代码查看所有源码" : "点击空白处返回精简视图") }}
        </div>
        <div ref="codeScrollElement" class="code-scroll" aria-label="SVML source code" @scroll="updateRangeGeometry">
          <svg
            v-if="rangeCanvas.width && rangeCanvas.height"
            class="semantic-range-canvas"
            :width="rangeCanvas.width"
            :height="rangeCanvas.height"
            :viewBox="`0 0 ${rangeCanvas.width} ${rangeCanvas.height}`"
            aria-hidden="true"
          >
            <path
              v-for="selection in sourceSelections"
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
            ><code>···</code></div>
            <div
              v-else-if="entry.line"
              class="code-line"
              :data-source-line="entry.index"
              :class="{
                'binding-active': bindingDepth(entry.line) >= 0,
                'binding-depth-1': bindingDepth(entry.line) === 1,
                'binding-depth-2': bindingDepth(entry.line) === 2,
              }"
              @mouseover="inspectLine(entry.line, entry.index!)"
            >
              <span class="line-number">{{ entry.index! + 1 }}</span>
              <code
                v-html="renderedLineHtml(entry.index!) || '&nbsp;'"
                @mouseover="inspectToken($event, entry.index!)"
                @focusin="inspectToken($event, entry.index!)"
                @click="inspectToken($event, entry.index!)"
              />
            </div>
          </template>
        </div>
      </div>

      <div class="preview-panel">
        <div class="real-preview-body">
          <div class="semantic-live-stage" :class="`stage-${config.id}`">
            <div class="live-base-layer">
              <video
                v-for="(scene, index) in config.scenes"
                :key="scene.src"
                :ref="(element) => setBaseVideo(element, index)"
                :class="{ active: currentSceneIndex === index }"
                :src="resolveDemoMedia(scene.src)"
                :muted="!audioPlaybackEnabled || currentSceneIndex !== index"
                playsinline
                preload="auto"
                @loadedmetadata="syncBaseVideos(true)"
              />
            </div>

            <template v-if="config.id === 'street'">
              <video
                v-for="(selection, index) in overlaySelections"
                :key="selection.id"
                :ref="(element) => setOverlayVideo(element, index)"
                class="street-broll"
                :class="{ active: activeOverlaySelection?.id === selection.id }"
                :src="resolveDemoMedia(selection.asset!)"
                muted
                playsinline
                preload="auto"
              />
              <div class="visual-outline street-scene-outline"></div>
              <div v-if="activeOverlaySelection" class="visual-outline street-broll-outline"></div>
            </template>

            <template v-else>
              <div class="gbb-header">
                <div
                  v-for="(item, index) in [
                    { id: 'good', label: 'GOOD', src: goodBetterBestMedia.logos[0] },
                    { id: 'better', label: 'BETTER', src: goodBetterBestMedia.logos[1] },
                    { id: 'best', label: 'BEST', src: goodBetterBestMedia.logos[2] },
                  ]"
                  :key="item.id"
                  class="gbb-slot"
                  :class="[{ visible: visibleLogoCount > index, selected: sourceSelections.some((selection) => selection.id === item.id) }, `slot-${item.id}`]"
                >
                  <img :src="resolveDemoMedia(item.src)" alt="">
                  <strong>{{ item.label }}</strong>
                </div>
              </div>
              <img
                v-if="activeOverlaySelection"
                class="gbb-deck"
                :class="{ selected: sourceSelections.some((selection) => selection.id === activeOverlaySelection?.id) }"
                :src="resolveDemoMedia(activeOverlaySelection.asset!)"
                alt=""
              >
            </template>

            <div v-if="activeCaptionWords.length" class="demo-caption" :class="`caption-${config.id}`" aria-hidden="true">
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
              <span class="material-symbols-rounded" aria-hidden="true">{{ audioEnabled ? "volume_up" : "volume_off" }}</span>
            </button>
          </div>
        </div>

        <div class="real-semantic-controls">
          <div class="semantic-timeline">
            <div class="timeline-labels ranking-labels demo-progress-labels">
              <button
                v-for="selection in sceneSelections"
                :key="selection.id"
                type="button"
                :class="{ current: activeSceneSelection.id === selection.id }"
                :style="{ flexGrow: selection.end - selection.start }"
                @click="seekTo(selection)"
              >@{{ selection.id }}</button>
            </div>
            <div class="timeline-track demo-progress-track">
              <span
                v-for="selection in sceneSelections"
                :key="selection.id"
                class="segment"
                :class="{ active: activeSceneSelection.id === selection.id }"
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
.semantic-video-demo .code-scroll { overflow-y: auto; }
.source-following .code-scroll { overflow-y: hidden; }
.semantic-live-stage { position: relative; height: 540px; aspect-ratio: 9 / 16; overflow: hidden; background: #000; isolation: isolate; }
.street-broll { position: absolute; inset: 0; z-index: 10; display: none; width: 100%; height: 100%; object-fit: cover; }
.street-broll.active { display: block; }
.visual-outline { position: absolute; z-index: 24; pointer-events: none; }
.street-scene-outline { inset: 4px; border: 1px solid rgba(238,123,98,.92); }
.street-broll-outline { inset: 9px; border: 1px solid rgba(99,216,255,.95); }
.gbb-header { position: absolute; z-index: 8; top: 8.9%; left: 5.8%; display: grid; grid-template-columns: repeat(3, 1fr); gap: 7.2%; width: 88.4%; }
.gbb-slot { position: relative; display: grid; justify-items: center; opacity: 1; }
.gbb-slot img { width: 80%; aspect-ratio: 1; object-fit: cover; border-radius: 20%; opacity: 0; transform: translateY(-6px) scale(.94); transition: opacity .28s ease, transform .38s cubic-bezier(.2,.8,.2,1); }
.gbb-slot.visible img { opacity: 1; transform: translateY(0) scale(1); }
.gbb-slot strong { margin-top: 8%; font-family: Arial Black, Poppins, Inter, sans-serif; font-size: 17px; font-weight: 950; line-height: 1; text-shadow: 0 1px 3px rgba(0,0,0,.25); }
.slot-good strong { color: #ff1749; }
.slot-better strong { color: #ffb300; }
.slot-best strong { color: #00b96b; }
.gbb-slot.selected::after { content: ""; position: absolute; inset: -4px -2px -5px; border: 1px solid #EE7B62; pointer-events: none; }
.gbb-deck { position: absolute; z-index: 12; top: 61.7%; left: 11%; width: 78%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 8px; box-shadow: 0 9px 28px rgba(0,0,0,.28); }
.gbb-deck.selected { outline: 1px solid #63d8ff; outline-offset: 3px; }
.demo-caption { position: absolute; z-index: 30; left: 5%; display: flex; align-items: baseline; justify-content: center; width: 90%; column-gap: 4px; color: #fff; font-family: Arial Black, Poppins, Inter, sans-serif; font-size: 16px; font-weight: 900; line-height: 1.08; text-align: center; white-space: nowrap; pointer-events: none; -webkit-text-stroke: .75px #000; paint-order: stroke fill; text-shadow: 0 1px 3px rgba(0,0,0,.7); }
.caption-street { top: 50%; }
.caption-good-better-best { top: 65%; }
.demo-caption span { display: inline-block; transition: color .08s linear, transform .08s linear; }
.demo-caption span.active { color: #ffd34d; transform: scale(1.08); }
.demo-progress-track { display: flex; grid-template-columns: none; gap: 0; background: transparent; }
.demo-progress-labels { gap: 2px; }
.demo-progress-track .segment { min-width: 0; height: 100%; flex-basis: 0; border-radius: 0; box-shadow: inset -1px 0 #1F191B; transition: box-shadow .2s ease; }
.demo-progress-track .segment:first-child { border-radius: 3px 0 0 3px; }
.demo-progress-track .segment:nth-child(4) { border-radius: 0 3px 3px 0; box-shadow: none; }
.demo-progress-track .segment:nth-child(1) { background: var(--demo-segment-cyan); }
.demo-progress-track .segment:nth-child(2) { background: var(--demo-segment-green); }
.demo-progress-track .segment:nth-child(3) { background: var(--demo-segment-gold); }
.demo-progress-track .segment:nth-child(4) { background: var(--demo-segment-pink); }
.demo-progress-track .segment.active { box-shadow: inset 0 -2px var(--demo-cursor), inset -1px 0 #1F191B; }

@media (max-width: 900px) {
  .semantic-live-stage { height: 520px; }
}

@media (max-width: 520px) {
  .semantic-live-stage { height: min(520px, 145vw); }
}
</style>
