<script setup lang="ts">
import { withBase } from "vitepress";

withDefaults(defineProps<{ label?: string }>(), { label: "Hypit" });
</script>

<template>
  <span class="hypit-logo">
    <img class="hypit-logo-on-light" :src="withBase('/hypit-logo-dark.png')" :alt="label" />
    <img class="hypit-logo-on-dark" :src="withBase('/hypit-logo-light.png')" :alt="label" />
  </span>
</template>
