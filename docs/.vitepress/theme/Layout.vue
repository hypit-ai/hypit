<script setup lang="ts">
import DefaultTheme from "vitepress/theme";
import { useData } from "vitepress";
import { computed } from "vue";
import HeroMasthead from "./components/HeroMasthead.vue";
import LocalePreference from "./components/LocalePreference.vue";
import NarratageLogo from "./components/NarratageLogo.vue";
import PaperFooter from "./components/PaperFooter.vue";
import { useHomeThemeScope } from "./HomeThemeScope";

const DefaultLayout = DefaultTheme.Layout;

const { frontmatter } = useData();
const isHome = computed(() => frontmatter.value.layout === "home");

useHomeThemeScope(isHome);
</script>

<template>
  <DefaultLayout>
    <template #nav-bar-title-before><NarratageLogo v-if="isHome" class="nav-narratage-logo" /></template>
    <template #layout-top><LocalePreference /></template>
    <template #home-hero-info><HeroMasthead /></template>
    <template #layout-bottom><PaperFooter v-if="isHome" /></template>
  </DefaultLayout>
  <!-- Kept outside the layout: a blended overlay must not sit inside a container
       that establishes its own stacking or filter context. -->
  <div v-if="isHome" class="np-grain" aria-hidden="true"></div>
</template>
