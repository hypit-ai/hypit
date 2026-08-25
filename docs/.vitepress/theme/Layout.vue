<script setup lang="ts">
import DefaultTheme from "vitepress/theme";
import LocalePreference from "./components/LocalePreference.vue";

const DefaultLayout = DefaultTheme.Layout;
</script>

<template>
  <DefaultLayout>
    <template #layout-top><LocalePreference /></template>
  </DefaultLayout>
</template>
