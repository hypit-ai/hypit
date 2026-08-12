<script setup lang="ts">
import markUrl from "../assets/narratage-logo/mark.svg";

withDefaults(defineProps<{ class?: string; label?: string }>(), { label: "Narratage" });
</script>

<template>
  <span :class="['narratage-mark', $props.class]" :style="{ '--narratage-mark-mask': `url(${markUrl})` }" role="img" :aria-label="label"></span>
</template>
