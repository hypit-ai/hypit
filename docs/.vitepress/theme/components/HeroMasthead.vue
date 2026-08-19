<script setup lang="ts">
import { computed } from "vue";
import { useData, withBase } from "vitepress";

const { lang } = useData();
const isChinese = computed(() => lang.value.toLowerCase().startsWith("zh"));
</script>

<template>
  <div class="np-masthead">
    <div class="np-masthead-meta">
      <span class="np-masthead-label">{{ isChinese ? "开源项目" : "Open source" }}</span>
      <span class="np-rule tick-r np-masthead-rule"></span>
    </div>

    <div class="np-masthead-wrap">
      <span class="np-masthead-wordmark">
        <img
          class="hypit-logo-on-light"
          :src="withBase('/hypit-logo-dark.png')"
          alt="Hypit"
          width="641"
          height="125"
        />
        <img
          class="hypit-logo-on-dark"
          :src="withBase('/hypit-logo-light.png')"
          alt="Hypit"
          width="641"
          height="125"
        />
      </span>

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
            ? "世界首个 AI agent 视频编程语言与系统。"
            : "World's #1 video programming language and system for AI agents."
        }}
      </p>
    </div>
  </div>
</template>
