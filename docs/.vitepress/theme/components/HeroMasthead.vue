<script setup lang="ts">
import { computed } from "vue";
import { useData, withBase } from "vitepress";

const { lang } = useData();
const isChinese = computed(() => lang.value.toLowerCase().startsWith("zh"));
</script>

<template>
  <div class="np-masthead">
    <div class="np-masthead-wrap">
      <!--
        One <text> with two <tspan>s, not two <text>s: textLength is applied per
        <text>, so splitting the wordmark would stretch each half to full width.
      -->
      <svg
        class="np-masthead-wordmark"
        viewBox="0 0 1200 268"
        role="img"
        aria-label="Narratage"
      >
        <text
          x="0"
          y="252"
          font-family="Impact, Haettenschweiler, 'Arial Narrow Bold', 'Arial Black', sans-serif"
          font-size="268"
          textLength="1200"
          lengthAdjust="spacingAndGlyphs"
        >
          <tspan class="np-masthead-ink">NARRA</tspan><tspan class="np-masthead-red">TAGE</tspan>
        </text>
      </svg>

      <!-- Outside the wordmark, or the intro wipe would clip it too. -->
      <img
        class="np-masthead-stamp"
        :src="withBase('/hero-landscape.png')"
        alt=""
        width="77"
        height="50"
      />

      <p class="np-masthead-tagline">
        {{
          isChinese
            ? "全球第一的 AI agent 视频编程语言与系统。"
            : "World's #1 video programming language and system for AI agents."
        }}
      </p>
      <p class="np-masthead-subline">
        {{ isChinese ? "为终结 Adobe 而生。" : "Built to kill Adobe." }}
      </p>
    </div>
  </div>
</template>
