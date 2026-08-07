<script setup lang="ts">
import DefaultTheme from "vitepress/theme";
import { useData } from "vitepress";
import { computed } from "vue";
import HeroStatement from "./components/HeroStatement.vue";
import LocalePreference from "./components/LocalePreference.vue";
import { useHomeThemeScope } from "./HomeThemeScope";

const DefaultLayout = DefaultTheme.Layout;

const { frontmatter } = useData();
const isHome = computed(() => frontmatter.value.layout === "home");

useHomeThemeScope(isHome);
</script>

<template>
  <DefaultLayout>
    <template #layout-top><LocalePreference /></template>
    <template #home-hero-info><HeroStatement /></template>
  </DefaultLayout>
</template>
