<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import {
  demoMediaVersion,
  demoMediaManifests,
  preloadDemoMedia,
  type DemoMediaManifest,
} from "./demo-media";
import { clearDemoPointer, updateDemoPointer } from "./demo-pointer";
import SemanticVideoDemo from "./SemanticVideoDemo.vue";
import SvmlPlayground from "./SvmlPlayground.vue";

const cards = [
  { component: SvmlPlayground, props: undefined, label: "AI 图片应用排名" },
  { component: SemanticVideoDemo, props: { demo: "street" as const }, label: "街头采访" },
  { component: SemanticVideoDemo, props: { demo: "good-better-best" as const }, label: "Good Better Best" },
];
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
      <h2>悬停标记范围，查看对应画面</h2>
    </header>

    <div class="demo-carousel-stage">
      <article
        v-for="(card, index) in cards"
        :key="card.label"
        class="demo-card"
        :class="cardPosition(index)"
        :aria-hidden="index !== selectedIndex"
      >
        <button
          v-if="index !== selectedIndex"
          class="demo-card-select"
          type="button"
          :aria-label="`查看${card.label}演示`"
          @click="activateDemo(index)"
        ></button>

        <div v-if="!loadedIndices.has(index)" class="demo-loading" role="status" aria-live="polite">
          <span class="demo-loading-spinner" aria-hidden="true"></span>
          <span>加载演示素材…</span>
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

    <nav class="demo-carousel-controls" aria-label="切换示例">
      <button class="arrow-button" type="button" aria-label="上一个示例" @click="move(-1)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 5.3 8 12l6.7 6.7 1.4-1.4-5.3-5.3 5.3-5.3z"/></svg>
      </button>
      <div class="demo-carousel-dots" aria-label="选择示例">
        <button
          v-for="(card, index) in cards"
          :key="card.label"
          type="button"
          :class="{ active: index === selectedIndex }"
          :aria-label="`查看${card.label}演示`"
          :aria-current="index === selectedIndex ? 'true' : undefined"
          @click="activateDemo(index)"
        ></button>
      </div>
      <button class="arrow-button" type="button" aria-label="下一个示例" @click="move(1)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.3 5.3-1.4 1.4 5.3 5.3-5.3 5.3 1.4 1.4L16 12z"/></svg>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.svml-demo-carousel { width: 100%; }
.demo-carousel-stage { display: grid; width: 100%; overflow: hidden; perspective: 1600px; }
.carousel-heading { width: calc(100% - 64px); margin-inline: auto; }
.demo-card { position: relative; grid-area: 1 / 1; justify-self: center; width: calc(100% - 64px); overflow: hidden; border-radius: 16px; transform-origin: center center; will-change: transform, opacity, filter; transition: transform 850ms cubic-bezier(.16,1,.3,1), opacity 650ms cubic-bezier(.16,1,.3,1), filter 650ms cubic-bezier(.16,1,.3,1); }
.demo-card.is-center { z-index: 3; opacity: 1; filter: brightness(1); transform: translateX(0) scale(1); }
.demo-card.is-left { z-index: 1; opacity: .56; filter: brightness(.58) saturate(.75); transform: translateX(calc(-100% + 58px)) scale(.955); }
.demo-card.is-right { z-index: 1; opacity: .56; filter: brightness(.58) saturate(.75); transform: translateX(calc(100% - 58px)) scale(.955); }
.demo-card-select { position: absolute; z-index: 10; inset: 0; width: 100%; height: 100%; border: 0; background: transparent; cursor: pointer; }
.demo-card-select:focus-visible { outline: 2px solid #ec4899; outline-offset: -5px; border-radius: 16px; }
.demo-card-content { min-width: 0; }
.demo-card-content :deep(.svml-demo) { margin-top: 0; }
.demo-card-content :deep(.demo-shell) { box-shadow: 0 28px 70px rgba(0,0,0,.34); }
.demo-loading { display: grid; place-content: center; justify-items: center; gap: 14px; min-height: 720px; border: 1px solid #262626; border-radius: 16px; background: #0a0a0a; color: #a3a3a3; font-family: var(--vp-font-family-mono); font-size: 12px; letter-spacing: .02em; }
.demo-loading-spinner { width: 30px; height: 30px; border: 2px solid rgba(255,255,255,.14); border-top-color: #ec4899; border-radius: 50%; animation: demo-loading-spin .7s linear infinite; }
.demo-carousel-controls { display: flex; align-items: center; justify-content: center; gap: 16px; padding: 22px 0 2px; }
.demo-carousel-controls button { padding: 0; cursor: pointer; }
.arrow-button { display: grid; place-items: center; width: 42px; height: 42px; border: 1px solid #262626; border-radius: 50%; background: #111; color: #f5f5f5; transition: border-color .18s ease, background-color .18s ease, transform .18s ease; }
.arrow-button:hover { border-color: rgba(236,72,153,.72); background: #262626; transform: translateY(-1px); }
.demo-carousel-controls button:focus-visible { outline: 2px solid #ec4899; outline-offset: 3px; }
.arrow-button svg { width: 21px; height: 21px; fill: currentColor; }
.demo-carousel-dots { display: flex; align-items: center; gap: 8px; }
.demo-carousel-dots button { width: 7px; height: 7px; border: 0; border-radius: 999px; background: #4a4a4a; transition: width 450ms cubic-bezier(.16,1,.3,1), background-color 250ms ease; }
.demo-carousel-dots button.active { width: 24px; background: #ec4899; }

@keyframes demo-loading-spin { to { transform: rotate(360deg); } }

@media (max-width: 900px) {
  .carousel-heading, .demo-card { width: calc(100% - 40px); }
  .demo-card.is-left { transform: translateX(calc(-100% + 34px)) scale(.97); }
  .demo-card.is-right { transform: translateX(calc(100% - 34px)) scale(.97); }
  .demo-loading { min-height: 990px; }
}

@media (max-width: 520px) {
  .carousel-heading, .demo-card { width: calc(100% - 20px); }
  .demo-card.is-left { transform: translateX(calc(-100% + 20px)) scale(.98); }
  .demo-card.is-right { transform: translateX(calc(100% - 20px)) scale(.98); }
}

@media (prefers-reduced-motion: reduce) {
  .demo-card { transition-duration: .01ms; }
}
</style>
