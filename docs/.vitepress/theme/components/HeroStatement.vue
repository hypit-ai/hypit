<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

const statements = [
  {
    en: "A high-level video language for developers.",
    zh: "面向开发者的高级视频语言。",
  },
  {
    en: "An editing-free production system for creative teams.",
    zh: "面向创意团队的免剪辑制作系统。",
  },
  {
    en: "A scalable marketing video engine for brands.",
    zh: "面向品牌的可规模化营销视频引擎。",
  },
];

const activeIndex = ref(0);
let rotationTimer: ReturnType<typeof setInterval> | undefined;

onMounted(() => {
  rotationTimer = setInterval(() => {
    activeIndex.value = (activeIndex.value + 1) % statements.length;
  }, 2900);
});

onBeforeUnmount(() => {
  if (rotationTimer) clearInterval(rotationTimer);
});
</script>

<template>
  <div class="hero-statement">
    <h1 class="hero-statement-name">SVML</h1>

    <div class="hero-statement-viewport hero-statement-viewport-en">
      <Transition name="hero-statement-swap">
        <p :key="activeIndex" class="hero-statement-en">
          {{ statements[activeIndex].en }}
        </p>
      </Transition>
    </div>

    <div class="hero-statement-viewport hero-statement-viewport-zh">
      <Transition name="hero-statement-swap">
        <p :key="activeIndex" class="hero-statement-zh">
          {{ statements[activeIndex].zh }}
        </p>
      </Transition>
    </div>
  </div>
</template>
