<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
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
const playingIndex = ref(0);
const loadedIndices = ref<Set<number>>(new Set());
const manifestPromises = new Map<number, Promise<void>>();
const mediaCacheVersionKey = "svml-demo-media-version";
const cardElements = new Map<number, HTMLElement>();
const visibleRatios = new Map<number, number>();
let cardObserver: IntersectionObserver | null = null;

const isLoading = computed(() => loadedIndices.value.size < cards.length);

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

async function preloadAllDemos() {
  await Promise.all(cards.map((_, index) => preloadDemo(index)));
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
  return true;
}

function setCardElement(element: Element | null, index: number) {
  if (element instanceof HTMLElement) cardElements.set(index, element);
  else cardElements.delete(index);
}

function selectMostVisibleCard() {
  let nextIndex = playingIndex.value;
  let largestRatio = 0;
  for (const [index, ratio] of visibleRatios) {
    if (ratio > largestRatio) {
      largestRatio = ratio;
      nextIndex = index;
    }
  }
  if (largestRatio > 0) playingIndex.value = nextIndex;
}

function observeCards() {
  cardObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const index = Number((entry.target as HTMLElement).dataset.demoIndex);
      visibleRatios.set(index, entry.isIntersecting ? entry.intersectionRatio : 0);
    }
    selectMostVisibleCard();
  }, { threshold: [0, .2, .4, .6, .8, 1] });

  for (const element of cardElements.values()) cardObserver.observe(element);
}

onMounted(() => {
  if (!restoreCachedDemos()) void preloadAllDemos();
  void nextTick(observeCards);
});
onBeforeUnmount(() => cardObserver?.disconnect());
</script>

<template>
  <div
    class="svml-demo-showcase"
    :aria-busy="isLoading"
    @pointermove="updateDemoPointer"
    @pointerleave="clearDemoPointer"
  >
    <header class="demo-heading carousel-heading">
      <h2><span class="hover-interaction-copy">{{ isChinese ? "悬停标记范围，查看对应画面" : "Hover a marked range to see the corresponding frame" }}</span><span class="touch-interaction-copy">{{ isChinese ? "点击标记范围，查看对应画面" : "Tap a marked range to see the corresponding frame" }}</span></h2>
    </header>

    <div class="demo-list">
      <article
        v-for="(card, index) in cards"
        :key="card.labelEn"
        class="demo-card"
        :ref="(element) => setCardElement(element, index)"
        :data-demo-index="index"
        :aria-label="cardLabel(card)"
      >
        <div v-if="!loadedIndices.has(index)" class="demo-loading" role="status" aria-live="polite">
          <span class="demo-loading-spinner" aria-hidden="true"></span>
          <span>{{ isChinese ? "加载演示素材…" : "Loading demo media…" }}</span>
        </div>
        <div
          v-else
          class="demo-card-content"
        >
          <component
            :is="card.component"
            v-bind="card.props"
            :active="playingIndex === index"
            :show-heading="false"
          />
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
/* The cap covers the padding as well, so this column and the masthead — which is
   capped at 1280px inside the same padding — share a left edge. */
.svml-demo-showcase { width: 100%; max-width: calc(1280px + var(--pad) * 2); margin: 0 auto; padding: 48px var(--pad) 96px; box-sizing: border-box; }
.demo-list { display: grid; gap: 64px; width: 100%; margin-inline: 0; }
.carousel-heading { width: 100%; margin-right: 0; margin-left: 0; }
.demo-card { width: 100%; min-width: 0; border-radius: 2px; background: transparent; opacity: 0; transform: translateY(18px); animation: demo-card-rise .48s cubic-bezier(.22,1,.36,1) forwards; }
.demo-card:nth-child(1) { animation-delay: 1.59s; }
.demo-card:nth-child(2) { animation-delay: 1.75s; }
.demo-card:nth-child(3) { animation-delay: 1.91s; }
/* These delays continue the intro sequence in style.css, which ends at the carousel
   heading. That file cancels the sequence under `.hero-intro-seen`; the cards are the
   only part of it living outside it, so they need the matching cancellation here. */
.hero-intro-seen .demo-card { opacity: 1; transform: none; animation: none; }
.demo-card-content { min-width: 0; overflow: hidden; border-radius: 2px; background: var(--paper-2); }
.demo-card-content :deep(.svml-demo) { margin-top: 0; }
.demo-card-content :deep(.demo-shell) { box-shadow: none; }
.demo-loading { display: grid; place-content: center; justify-items: center; gap: 14px; min-height: 720px; border: 1px solid var(--rule-soft); border-radius: 2px; background: var(--paper-2); color: var(--muted); font-family: var(--mono); font-size: 12px; letter-spacing: .04em; }
.demo-loading-spinner { width: 30px; height: 30px; border: 2px solid var(--crimson-soft); border-top-color: var(--crimson); border-radius: 50%; animation: demo-loading-spin .7s linear infinite; }
@keyframes demo-loading-spin { to { transform: rotate(360deg); } }
@keyframes demo-card-rise { to { opacity: 1; transform: translateY(0); } }

@media (max-width: 959px) {
  .svml-demo-showcase { width: calc(100% - 96px); }
  .demo-loading { min-height: 990px; }
}

@media (max-width: 639px) {
  .svml-demo-showcase { width: 100%; padding-inline: 24px; }
}

@media (max-width: 520px) {
  .svml-demo-showcase { padding: 48px 24px 72px; }
  .demo-list { gap: 32px; }
}

@media (prefers-reduced-motion: reduce) {
  .demo-card { opacity: 1; transform: none; animation: none; }
}
</style>
