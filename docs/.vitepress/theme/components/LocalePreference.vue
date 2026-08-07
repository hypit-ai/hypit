<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";

const storageKey = "narratage-locale";

function localeFromPath(pathname: string) {
  return pathname.startsWith("/docs/en/") ? "en" : "zh";
}

function rememberLocale(event: MouseEvent) {
  const target = event.target as HTMLElement | null;
  const link = target?.closest<HTMLAnchorElement>("a[href]");
  if (!link) return;
  const url = new URL(link.href, window.location.href);
  if (!url.pathname.startsWith("/docs/")) return;
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
