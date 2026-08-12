<script setup lang="ts">
import nUrl from "../assets/narratage-logo/glyph-1.svg";
import aTopUrl from "../assets/narratage-logo/glyph-4.svg";
import rTopUrl from "../assets/narratage-logo/glyph-6.svg";
import rSecondUrl from "../assets/narratage-logo/glyph-5.svg";
import aBottomUrl from "../assets/narratage-logo/glyph-3.svg";
import tUrl from "../assets/narratage-logo/glyph-9.svg";
import aLastUrl from "../assets/narratage-logo/glyph-2.svg";
import gUrl from "../assets/narratage-logo/glyph-7.svg";
import eUrl from "../assets/narratage-logo/glyph-8.svg";

const letters = [
  { url: nUrl, width: .499 },
  { url: aTopUrl, width: .472 },
  { url: rTopUrl, width: .462 },
  { url: rSecondUrl, width: .467 },
  { url: aBottomUrl, width: .474 },
  { url: tUrl, width: .457 },
  { url: aLastUrl, width: .469 },
  { url: gUrl, width: .467 },
  { url: eUrl, width: .37 },
];
withDefaults(defineProps<{ class?: string; label?: string; animate?: boolean }>(), { label: "NARRATAGE", animate: false });
</script>

<template>
  <span class="narratage-wordmark" :class="[$props.class, { 'is-animated': animate }]" role="img" :aria-label="label">
    <span
      v-for="(letter, index) in letters"
      :key="`${letter.url}-${index}`"
      class="narratage-wordmark-letter"
      :style="{ '--narratage-letter-mask': `url(${letter.url})`, '--narratage-letter-width': `${letter.width}em` }"
      aria-hidden="true"
    ></span>
  </span>
</template>
