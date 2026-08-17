<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";

const storageKey = "narratage-locale";

// The dev server serves the site under `/docs/`; the Pages deploy builds with
// VITEPRESS_BASE=/ and serves it at the domain root. Vite substitutes the right
// one at build time, so neither can be hard-coded here.
const base = import.meta.env.BASE_URL;
const zhRoot = `${base}zh`;

function localeFromPath(pathname: string) {
  return pathname === zhRoot || pathname.startsWith(`${zhRoot}/`) ? "zh" : "en";
}

function rememberLocale(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const link = target?.closest<HTMLAnchorElement>("a[href]");
  if (!link) return;
  const url = new URL(link.href, window.location.href);
  if (!url.pathname.startsWith(base)) return;
  try {
    window.localStorage.setItem(storageKey, localeFromPath(url.pathname));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

onMounted(() => {
  try {
    window.localStorage.setItem(storageKey, localeFromPath(window.location.pathname));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
  document.addEventListener("click", rememberLocale, true);
});

onBeforeUnmount(() => document.removeEventListener("click", rememberLocale, true));
</script>

<template></template>
