<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
  demoMediaVersion,
  demoMediaManifests,
  preloadDemoMedia,
  type DemoMediaManifest,
} from "./demo-media";
import { clearDemoPointer, updateDemoPointer } from "./demo-pointer";
import { useData } from "vitepress";
import SemanticVideoDemo from "./SemanticVideoDemo.vue";
import SvmlPlayground from "./SvmlPlayground.vue";

const cards = [
  { component: SvmlPlayground, props: undefined, labelZh: "AI 图片应用排名", labelEn: "AI photo app ranking" },
  { component: SemanticVideoDemo, props: { demo: "street" as const }, labelZh: "街头采访", labelEn: "Street interview" },
  { component: SemanticVideoDemo, props: { demo: "good-better-best" as const }, labelZh: "Good Better Best", labelEn: "Good Better Best" },
];
const { lang } = useData();
const isChinese = computed(() => lang.value.toLowerCase().startsWith("zh"));
const cardLabel = (card: (typeof cards)[number]) => isChinese.value ? card.labelZh : card.labelEn;
const selectedIndex = ref(0);
const playingIndex = ref<number | null>(null);
const loadedIndices = ref<Set<number>>(new Set());
const manifestPromises = new Map<number, Promise<void>>();
const mediaCacheVersionKey = "svml-demo-media-version";
let activationId = 0;
let backgroundPreloadStarted = false;

const isLoading = computed(() => !loadedIndices.value.has(selectedIndex.value));

function loadManifest(manifest: DemoMediaManifest) {
  const assets = [
    ...manifest.images.map((source) => preloadDemoMedia(source, "image")),
    ...manifest.videos.map((source) => preloadDemoMedia(source, "video")),
  ];

  return Promise.allSettled(assets).then((results) => {
    const failures = results.filter((result) => result.status === "rejected");
    if (failures.length) {
      console.warn(`SVML demo mounted with ${failures.length} media preload failure(s).`, failures);
    }
  });
}

function preloadDemo(index: number) {
  if (loadedIndices.value.has(index)) return Promise.resolve();

  const existing = manifestPromises.get(index);
  if (existing) return existing;

  const promise = loadManifest(demoMediaManifests[index]).then(() => {
    loadedIndices.value = new Set([...loadedIndices.value, index]);
  });
  manifestPromises.set(index, promise);
  return promise;
}

async function preloadRemainingDemos(initialIndex: number) {
  for (let offset = 1; offset < cards.length; offset += 1) {
    await preloadDemo((initialIndex + offset) % cards.length);
  }

  try {
    window.localStorage.setItem(mediaCacheVersionKey, demoMediaVersion);
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function restoreCachedDemos() {
  try {
    if (window.localStorage.getItem(mediaCacheVersionKey) !== demoMediaVersion) return false;
  } catch {
    return false;
  }

  loadedIndices.value = new Set(cards.map((_, index) => index));
  playingIndex.value = selectedIndex.value;
  backgroundPreloadStarted = true;
  return true;
}

function transitionDelay(immediate: boolean) {
  if (immediate || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => window.setTimeout(resolve, 850));
}

async function activateDemo(index: number, immediate = false) {
  if (!immediate && index === selectedIndex.value && playingIndex.value === index) return;

  selectedIndex.value = index;
  playingIndex.value = null;
  const currentActivation = ++activationId;

  await Promise.all([preloadDemo(index), transitionDelay(immediate)]);
  if (currentActivation !== activationId) return;

  playingIndex.value = index;
  if (!backgroundPreloadStarted) {
    backgroundPreloadStarted = true;
    window.setTimeout(() => void preloadRemainingDemos(index), 0);
  }
}

function cardPosition(index: number) {
  const offset = (index - selectedIndex.value + cards.length) % cards.length;
  if (offset === 0) return "is-center";
  if (offset === 1) return "is-right";
  return "is-left";
}

function move(direction: number) {
  const nextIndex = (selectedIndex.value + direction + cards.length) % cards.length;
  void activateDemo(nextIndex);
}

function handleEnded(index: number) {
  if (playingIndex.value !== index) return;
  move(1);
}

onMounted(() => {
  if (!restoreCachedDemos()) void activateDemo(0, true);
});
onBeforeUnmount(() => { activationId += 1; });
</script>

<template>
  <div
    class="svml-demo-carousel"
    :aria-busy="isLoading"
    @pointermove="updateDemoPointer"
    @pointerleave="clearDemoPointer"
  >
    <header class="demo-heading carousel-heading">
      <h2><span class="hover-interaction-copy">{{ isChinese ? "悬停标记范围，查看对应画面" : "Hover a marked range to see the corresponding frame" }}</span><span class="touch-interaction-copy">{{ isChinese ? "点击标记范围，查看对应画面" : "Tap a marked range to see the corresponding frame" }}</span></h2>
    </header>

    <div class="demo-carousel-stage">
      <article
        v-for="(card, index) in cards"
        :key="card.labelEn"
        class="demo-card"
        :class="cardPosition(index)"
        :aria-hidden="index !== selectedIndex"
      >
        <button
          v-if="index !== selectedIndex"
          class="demo-card-select"
          type="button"
          :aria-label="isChinese ? `查看${cardLabel(card)}演示` : `View the ${cardLabel(card)} demo`"
          @click="activateDemo(index)"
        ></button>

        <div v-if="!loadedIndices.has(index)" class="demo-loading" role="status" aria-live="polite">
          <span class="demo-loading-spinner" aria-hidden="true"></span>
          <span>{{ isChinese ? "加载演示素材…" : "Loading demo media…" }}</span>
        </div>
        <div
          v-else
          class="demo-card-content"
          :inert="index !== selectedIndex ? '' : undefined"
        >
          <component
            :is="card.component"
            v-bind="card.props"
            :active="playingIndex === index"
            :show-heading="false"
            @ended="handleEnded(index)"
          />
        </div>
      </article>
    </div>

    <nav class="demo-carousel-controls" :aria-label="isChinese ? '切换示例' : 'Switch demos'">
      <button class="arrow-button" type="button" :aria-label="isChinese ? '上一个示例' : 'Previous demo'" @click="move(-1)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 5.3 8 12l6.7 6.7 1.4-1.4-5.3-5.3 5.3-5.3z"/></svg>
      </button>
      <div class="demo-carousel-dots" :aria-label="isChinese ? '选择示例' : 'Choose a demo'">
        <button
          v-for="(card, index) in cards"
          :key="card.labelEn"
          type="button"
          :class="{ active: index === selectedIndex }"
          :aria-label="isChinese ? `查看${cardLabel(card)}演示` : `View the ${cardLabel(card)} demo`"
          :aria-current="index === selectedIndex ? 'true' : undefined"
          @click="activateDemo(index)"
        ></button>
      </div>
      <button class="arrow-button" type="button" :aria-label="isChinese ? '下一个示例' : 'Next demo'" @click="move(1)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.3 5.3-1.4 1.4 5.3 5.3-5.3 5.3 1.4 1.4L16 12z"/></svg>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.svml-demo-carousel { width: calc(100% - 128px); max-width: 1180px; margin: 0 auto; padding: 48px 32px 96px; overflow: visible; box-sizing: border-box; }
.demo-carousel-stage { display: grid; width: min(100%, 1000px); margin-inline: auto; overflow: visible; perspective: 1600px; }
.carousel-heading { width: min(100%, 1000px); margin-right: 0; margin-left: 0; }
.demo-card { position: relative; grid-area: 1 / 1; justify-self: center; width: 100%; overflow: visible; border-radius: 2px; background: transparent; transform-origin: center center; will-change: transform, opacity; transition: transform 850ms cubic-bezier(.16,1,.3,1), opacity 850ms cubic-bezier(.16,1,.3,1); }
.demo-card.is-center { z-index: 3; opacity: 1; transform: translateX(0) scale(1); }
.demo-card.is-left { z-index: 1; opacity: .3; transform: translateX(calc(-100% + 34px)) scale(.86); }
.demo-card.is-right { z-index: 1; opacity: .3; transform: translateX(calc(100% - 34px)) scale(.86); }
.demo-card-select { position: absolute; z-index: 10; inset: 0; width: 100%; height: 100%; border: 0; background: transparent; cursor: pointer; }
.demo-card-select:focus-visible { outline: 2px solid var(--accent); outline-offset: -5px; border-radius: 2px; }
.demo-card-content { min-width: 0; overflow: hidden; border-radius: 2px; background: #272022; filter: brightness(1); transition: filter 850ms cubic-bezier(.16,1,.3,1); }
.demo-card.is-left .demo-card-content,
.demo-card.is-right .demo-card-content { filter: brightness(.82) saturate(.68); }
.demo-card-content :deep(.svml-demo) { margin-top: 0; }
.demo-card-content :deep(.demo-shell) { box-shadow: none; }
.demo-loading { display: grid; place-content: center; justify-items: center; gap: 14px; min-height: 720px; border: 0; border-radius: 2px; background: #272022; color: #BBAAB0; font-family: var(--font-ui); font-size: 12px; letter-spacing: .04em; }
.demo-loading-spinner { width: 30px; height: 30px; border: 2px solid #EB609133; border-top-color: #49D6E9; border-radius: 50%; animation: demo-loading-spin .7s linear infinite; }
.demo-carousel-controls { display: flex; align-items: center; justify-content: center; gap: 16px; padding: 22px 0 2px; }
.demo-carousel-controls button { padding: 0; cursor: pointer; }
.arrow-button { display: grid; place-items: center; width: 42px; height: 42px; border: 1px solid var(--rule); border-radius: 2px; background: transparent; color: var(--ink); transition: color .18s ease, background-color .18s ease; }
.arrow-button:hover { background: var(--ink); color: var(--paper); }
.demo-carousel-controls button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
.arrow-button svg { width: 21px; height: 21px; fill: currentColor; }
.demo-carousel-dots { display: flex; align-items: center; gap: 8px; }
.demo-carousel-dots button { width: 7px; height: 7px; border: 0; border-radius: 50%; background: rgba(233,178,166,.34); transition: background-color 160ms ease; }
.demo-carousel-dots button.active { background: var(--accent); }

@keyframes demo-loading-spin { to { transform: rotate(360deg); } }

@media (max-width: 959px) {
  .svml-demo-carousel { width: calc(100% - 96px); }
  .demo-card.is-left { transform: translateX(calc(-100% + 18px)) scale(.88); }
  .demo-card.is-right { transform: translateX(calc(100% - 18px)) scale(.88); }
  .demo-loading { min-height: 990px; }
}

@media (max-width: 639px) {
  .svml-demo-carousel { width: 100%; padding-inline: 24px; }
}

@media (max-width: 520px) {
  .svml-demo-carousel { padding: 48px 24px 72px; }
  .demo-card.is-left { transform: translateX(calc(-100% + 8px)) scale(.9); }
  .demo-card.is-right { transform: translateX(calc(100% - 8px)) scale(.9); }
}

@media (prefers-reduced-motion: reduce) {
  .demo-card { transition-duration: .01ms; }
}
</style>
