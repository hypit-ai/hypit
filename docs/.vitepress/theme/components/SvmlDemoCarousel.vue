<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
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

/** Track gap, in px. The slide-placement maths needs it as a number. */
const GAP = 26;

const cards = [
  { component: SvmlPlayground, props: undefined, labelZh: "AI 图片应用排名", labelEn: "AI photo app ranking" },
  { component: SemanticVideoDemo, props: { demo: "street" as const }, labelZh: "街头采访", labelEn: "Street interview" },
  { component: SemanticVideoDemo, props: { demo: "good-better-best" as const }, labelZh: "Good Better Best", labelEn: "Good Better Best" },
];

/**
 * A clone of the last card leads and a clone of the first trails, so a card is
 * always peeking at both edges and the wrap-around has somewhere to land. A
 * clone shares its original's active state, so the two are identical when the
 * track silently swaps between them.
 */
const rendered = [cards[cards.length - 1], ...cards, cards[0]];
const realIndexOf = (slot: number) => (slot - 1 + cards.length) % cards.length;

const { lang } = useData();
const isChinese = computed(() => lang.value.toLowerCase().startsWith("zh"));
const cardLabel = (card: (typeof cards)[number]) => (isChinese.value ? card.labelZh : card.labelEn);

const index = ref(0);
const animating = ref(true);
const offset = ref(0);
const viewport = ref<HTMLElement | null>(null);
const track = ref<HTMLElement | null>(null);

/** `index` runs past both ends during a wrap; this is the card it settles on. */
const active = computed(() => ((index.value % cards.length) + cards.length) % cards.length);

const loadedIndices = ref<Set<number>>(new Set());
const manifestPromises = new Map<number, Promise<void>>();
const mediaCacheVersionKey = "svml-demo-media-version";

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

/**
 * Media loads for the card being shown, not for all three: a demo is only
 * mounted once its own media is in, so the off-screen cards stay cheap. Once a
 * card has loaded it stays mounted, paused, as a side card.
 */
function preloadDemo(index: number) {
  if (loadedIndices.value.has(index)) return Promise.resolve();

  const existing = manifestPromises.get(index);
  if (existing) return existing;

  const promise = loadManifest(demoMediaManifests[index]).then(() => {
    loadedIndices.value = new Set([...loadedIndices.value, index]);
    if (loadedIndices.value.size === cards.length) {
      try {
        window.localStorage.setItem(mediaCacheVersionKey, demoMediaVersion);
      } catch {
        // Storage can be unavailable in private or restricted browser contexts.
      }
    }
  });
  manifestPromises.set(index, promise);
  return promise;
}

function restoreCachedDemos() {
  try {
    if (window.localStorage.getItem(mediaCacheVersionKey) !== demoMediaVersion) return false;
  } catch {
    return false;
  }

  loadedIndices.value = new Set(cards.map((_, i) => i));
  return true;
}

/** Centres the slide at `index`, with its neighbours bleeding off both edges. */
function place() {
  const vp = viewport.value;
  const tr = track.value;
  if (!vp || !tr) return;
  const slide = tr.querySelector<HTMLElement>(".demo-slide");
  if (!slide) return;
  const slideWidth = slide.getBoundingClientRect().width;
  offset.value = (index.value + 1) * (slideWidth + GAP) - (vp.clientWidth - slideWidth) / 2;
}

/**
 * Landing on a clone, the track is repositioned onto the matching real card
 * with the transition switched off, so the wrap is invisible: the clone is
 * identical to what replaces it and nothing appears to move.
 */
function onTransitionEnd() {
  if (index.value < 0 || index.value >= cards.length) {
    animating.value = false;
    index.value = active.value;
  }
}

watch(index, () => {
  place();
  void preloadDemo(active.value);
});

// Re-enable the transition only once the repositioned frame has painted.
watch(animating, (on) => {
  if (on) return;
  void nextTick(() => requestAnimationFrame(() => (animating.value = true)));
});

function onResize() {
  animating.value = false;
  place();
}

onMounted(() => {
  restoreCachedDemos();
  void preloadDemo(active.value);
  void nextTick(place);
  window.addEventListener("resize", onResize);
});
onBeforeUnmount(() => window.removeEventListener("resize", onResize));
</script>

<template>
  <section
    class="demo-carousel"
    @pointermove="updateDemoPointer"
    @pointerleave="clearDemoPointer"
  >
    <div class="demo-carousel-head">
      <div class="np-rule"></div>
      <header class="demo-heading carousel-heading">
        <h2>
          <span class="hover-interaction-copy">{{ isChinese ? "悬停任意标记区间，即可预览对应的画面。" : "Hover over a marked range to preview the corresponding scene." }}</span>
          <span class="touch-interaction-copy">{{ isChinese ? "点按任意标记区间，即可预览对应的画面。" : "Tap a marked range to preview the corresponding scene." }}</span>
        </h2>
      </header>
    </div>

    <div class="demo-viewport" ref="viewport">
      <div
        class="demo-track"
        ref="track"
        :style="{ transform: `translateX(${-offset}px)`, transition: animating ? undefined : 'none' }"
        @transitionend="onTransitionEnd"
      >
        <article
          v-for="(card, slot) in rendered"
          :key="slot"
          class="demo-slide"
          :data-active="realIndexOf(slot) === active ? '' : undefined"
          :aria-hidden="realIndexOf(slot) === active ? undefined : 'true'"
          :aria-label="cardLabel(card)"
        >
          <div v-if="!loadedIndices.has(realIndexOf(slot))" class="demo-loading" role="status" aria-live="polite">
            <span class="demo-loading-spinner" aria-hidden="true"></span>
            <span>{{ isChinese ? "加载演示素材…" : "Loading demo media…" }}</span>
          </div>
          <div v-else class="demo-card-content">
            <component
              :is="card.component"
              v-bind="card.props"
              :active="realIndexOf(slot) === active"
              :show-heading="false"
            />
          </div>
        </article>
      </div>

      <button class="demo-nav demo-prev" :aria-label="isChinese ? '上一张' : 'Previous slide'" @click="index--">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M15 4 7 12l8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <button class="demo-nav demo-next" :aria-label="isChinese ? '下一张' : 'Next slide'" @click="index++">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M9 4l8 8-8 8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>

    <div class="demo-dots">
      <button
        v-for="(card, n) in cards"
        :key="card.labelEn"
        class="demo-dot"
        :aria-current="n === active"
        :aria-label="cardLabel(card)"
        @click="index = n"
      ></button>
    </div>
  </section>
</template>

<style scoped>
.demo-carousel { padding-block: 0 60px; }
.demo-carousel-head { max-width: 1280px; margin: 0 auto; padding-inline: var(--pad); box-sizing: border-box; }
.carousel-heading { width: 100%; margin: 26px 0 20px; }

/* Full-bleed, so the neighbouring cards bleed off both edges of the viewport. */
.demo-viewport { position: relative; overflow: hidden; }
.demo-track { display: flex; align-items: center; gap: 26px; transition: transform .5s cubic-bezier(.3,.8,.35,1); will-change: transform; }
.demo-slide { flex: 0 0 66.5%; min-width: 0; min-height: 505px; overflow: hidden; border-radius: 2px; background: var(--paper-2); opacity: .4; transition: opacity .4s ease; }
.demo-slide[data-active] { opacity: 1; }

.demo-card-content { min-width: 0; overflow: hidden; border-radius: 2px; background: var(--paper-2); }
.demo-card-content :deep(.svml-demo) { margin-top: 0; }
.demo-card-content :deep(.demo-shell),
.demo-card-content :deep(.real-demo-shell) { min-height: 660px; box-shadow: none; border: 0; }
.demo-card-content :deep(.real-demo-shell .code-scroll) { height: 660px; }
.demo-card-content :deep(.real-preview-body) { padding: 18px 16px 10px; }
/* Both stages, or the ranking demo keeps its taller default and its
   container-scaled type comes out larger than the other card's. */
.demo-card-content :deep(.semantic-live-stage),
.demo-card-content :deep(.live-ranking-stage) { height: 500px; }
.demo-card-content :deep(.real-semantic-controls) { margin: 0 20px 18px; }

.demo-loading { display: grid; place-content: center; justify-items: center; gap: 14px; min-height: 660px; border-radius: 2px; background: var(--paper-2); color: var(--muted); font-family: var(--mono); font-size: 12px; letter-spacing: .04em; }
.demo-loading-spinner { width: 30px; height: 30px; border: 2px solid var(--crimson-soft); border-top-color: var(--crimson); border-radius: 50%; animation: demo-loading-spin .7s linear infinite; }
@keyframes demo-loading-spin { to { transform: rotate(360deg); } }

/* Centred in the gap between the side card and the main one. */
.demo-nav { position: absolute; top: 50%; z-index: 5; display: grid; place-items: center; width: 50px; height: 50px; border: 0; background: none; color: var(--ink); font: inherit; cursor: pointer; transform: translateY(-50%); }
.demo-nav:hover { color: var(--crimson); }
.demo-nav svg { display: block; }
.demo-prev { left: calc(16.75% - 38px); }
.demo-next { right: calc(16.75% - 38px); }

.demo-dots { display: flex; justify-content: center; gap: 8px; margin-top: 26px; }
.demo-dot { width: 10px; height: 10px; padding: 0; border: 0; border-radius: 50%; background: var(--crimson); opacity: .32; cursor: pointer; transition: opacity .2s ease; }
.demo-dot:hover { opacity: .7; }
.demo-dot[aria-current="true"] { opacity: 1; }

@media (max-width: 900px) {
  .demo-slide { flex-basis: 86%; min-height: 0; }
  /* `max()` only bites below ~540px, where the source's offset would otherwise
     hang the arrow off the edge of the viewport. */
  .demo-prev { left: max(4px, calc(7% - 38px)); }
  .demo-next { right: max(4px, calc(7% - 38px)); }
}

@media (prefers-reduced-motion: reduce) {
  .demo-track { transition: none !important; }
}
</style>
