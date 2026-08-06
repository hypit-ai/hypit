<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

const statements = [
  {
    enBefore: "A ",
    enConcept: "high-level video language",
    enConnector: " for ",
    enAudience: "developers",
    enAfter: ".",
    zhBefore: "面向",
    zhAudience: "开发者",
    zhConnector: "的",
    zhConcept: "高级视频语言",
    zhAfter: "。",
  },
  {
    enBefore: "An ",
    enConcept: "editing-free production system",
    enConnector: " for ",
    enAudience: "creative teams",
    enAfter: ".",
    zhBefore: "面向",
    zhAudience: "创意团队",
    zhConnector: "的",
    zhConcept: "免剪辑制作系统",
    zhAfter: "。",
  },
  {
    enBefore: "A ",
    enConcept: "scalable marketing video engine",
    enConnector: " for ",
    enAudience: "brands",
    enAfter: ".",
    zhBefore: "面向",
    zhAudience: "品牌",
    zhConnector: "的",
    zhConcept: "可规模化营销视频引擎",
    zhAfter: "。",
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
    <h1 class="hero-statement-name">Narratage</h1>

    <div class="hero-statement-viewport hero-statement-viewport-en">
      <Transition name="hero-statement-swap">
        <p :key="activeIndex" class="hero-statement-en">
          <span class="hero-statement-line">{{ statements[activeIndex].enBefore }}{{ statements[activeIndex].enConcept }}{{ statements[activeIndex].enConnector }}<br><span class="hero-statement-accent">{{ statements[activeIndex].enAudience }}</span>{{ statements[activeIndex].enAfter }}</span>
        </p>
      </Transition>
    </div>

    <div class="hero-statement-viewport hero-statement-viewport-zh">
      <Transition name="hero-statement-swap">
        <p :key="activeIndex" class="hero-statement-zh">
          <span class="hero-statement-line">{{ statements[activeIndex].zhBefore }}<span class="hero-statement-accent">{{ statements[activeIndex].zhAudience }}</span>{{ statements[activeIndex].zhConnector }}{{ statements[activeIndex].zhConcept }}{{ statements[activeIndex].zhAfter }}</span>
        </p>
      </Transition>
    </div>
  </div>
</template>
