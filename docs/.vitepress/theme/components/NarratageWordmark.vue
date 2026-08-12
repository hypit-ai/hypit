<script setup lang="ts">
import nSvg from "../assets/narratage-logo/glyph-1.svg?raw";
import aTopSvg from "../assets/narratage-logo/glyph-4.svg?raw";
import rTopSvg from "../assets/narratage-logo/glyph-6.svg?raw";
import rSecondSvg from "../assets/narratage-logo/glyph-5.svg?raw";
import aBottomSvg from "../assets/narratage-logo/glyph-3.svg?raw";
import tSvg from "../assets/narratage-logo/glyph-9.svg?raw";
import aLastSvg from "../assets/narratage-logo/glyph-2.svg?raw";
import gSvg from "../assets/narratage-logo/glyph-7.svg?raw";
import eSvg from "../assets/narratage-logo/glyph-8.svg?raw";

const letters = [
  { svg: nSvg, width: .499 },
  { svg: aTopSvg, width: .472 },
  { svg: rTopSvg, width: .462 },
  { svg: rSecondSvg, width: .467 },
  { svg: aBottomSvg, width: .474 },
  { svg: tSvg, width: .457 },
  { svg: aLastSvg, width: .469 },
  { svg: gSvg, width: .467 },
  { svg: eSvg, width: .37 },
];
withDefaults(defineProps<{ class?: string; label?: string; animate?: boolean }>(), { label: "NARRATAGE", animate: false });
</script>

<template>
  <span class="narratage-wordmark" :class="[$props.class, { 'is-animated': animate }]" role="img" :aria-label="label">
    <span
      v-for="(letter, index) in letters"
      :key="index"
      class="narratage-wordmark-letter"
      :style="{ '--narratage-letter-width': `${letter.width}em` }"
      aria-hidden="true"
      v-html="letter.svg"
    ></span>
  </span>
</template>
