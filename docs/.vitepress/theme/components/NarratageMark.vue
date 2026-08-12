<script setup lang="ts">
import markSvg from "../assets/narratage-logo/mark.svg?raw";

withDefaults(defineProps<{ class?: string; label?: string }>(), { label: "Narratage" });
</script>

<template>
  <span :class="['narratage-mark', $props.class]" role="img" :aria-label="label" v-html="markSvg"></span>
</template>
