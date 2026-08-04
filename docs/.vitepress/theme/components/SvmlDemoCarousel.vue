<script setup lang="ts">
import { computed, ref } from "vue";
import SemanticVideoDemo from "./SemanticVideoDemo.vue";
import SvmlPlayground from "./SvmlPlayground.vue";

const activeIndex = ref(0);
const demos = [SvmlPlayground, SemanticVideoDemo, SemanticVideoDemo];
const props = [undefined, { demo: "street" as const }, { demo: "good-better-best" as const }];
const activeComponent = computed(() => demos[activeIndex.value]);
const activeProps = computed(() => props[activeIndex.value]);

function move(direction: number) {
  activeIndex.value = (activeIndex.value + direction + demos.length) % demos.length;
}
</script>

<template>
  <div class="svml-demo-carousel">
    <component :is="activeComponent" :key="activeIndex" v-bind="activeProps" />
    <nav class="demo-carousel-controls" aria-label="切换示例">
      <button type="button" aria-label="上一个示例" @click="move(-1)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 5.3 8 12l6.7 6.7 1.4-1.4-5.3-5.3 5.3-5.3z"/></svg>
      </button>
      <button type="button" aria-label="下一个示例" @click="move(1)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.3 5.3-1.4 1.4 5.3 5.3-5.3 5.3 1.4 1.4L16 12z"/></svg>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.demo-carousel-controls { display: flex; justify-content: center; gap: 14px; padding: 20px 0 2px; }
.demo-carousel-controls button { display: grid; place-items: center; width: 42px; height: 42px; padding: 0; border: 1px solid #262626; border-radius: 50%; background: #111; color: #f5f5f5; cursor: pointer; transition: border-color .18s ease, background-color .18s ease, transform .18s ease; }
.demo-carousel-controls button:hover { border-color: rgba(236,72,153,.72); background: #262626; transform: translateY(-1px); }
.demo-carousel-controls button:focus-visible { outline: 2px solid #ec4899; outline-offset: 3px; }
.demo-carousel-controls svg { width: 21px; height: 21px; fill: currentColor; }
</style>
