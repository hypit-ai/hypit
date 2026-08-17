<script setup lang="ts">
import { computed } from "vue";
import { useData, withBase } from "vitepress";

const REPO = "https://github.com/hypit-ai/narratage";

const { lang } = useData();
const isChinese = computed(() => lang.value.toLowerCase().startsWith("zh"));
const docsRoot = computed(() => (isChinese.value ? "/zh" : ""));

const t = (en: string, zh: string) => (isChinese.value ? zh : en);
</script>

<template>
  <footer class="np-footer">
    <div class="np-footer-grid">
      <section>
        <h2>{{ t("Docs", "文档") }}</h2>
        <ul>
          <li>
            <a :href="withBase(`${docsRoot}/quickstart`)">{{ t("Quickstart", "快速开始") }}</a>
          </li>
          <li>
            <a :href="withBase(`${docsRoot}/guide/develop`)">{{ t("Develop", "开发指南") }}</a>
          </li>
        </ul>
      </section>

      <section>
        <h2>{{ t("Project", "项目") }}</h2>
        <ul>
          <li><a :href="REPO" target="_blank" rel="noreferrer">{{ t("Repository", "代码仓库") }}</a></li>
          <li>
            <a :href="`${REPO}/releases`" target="_blank" rel="noreferrer">
              {{ t("Changelog", "更新日志") }}
            </a>
          </li>
          <li>
            <a :href="`${REPO}/blob/main/LICENSE`" target="_blank" rel="noreferrer">
              {{ t("Licence", "开源协议") }}
            </a>
          </li>
        </ul>
      </section>

      <section>
        <h2>{{ t("Community", "社区") }}</h2>
        <ul>
          <li><a href="https://discord.gg/85hnyQnxpn" target="_blank" rel="noreferrer">Discord</a></li>
          <li><a href="https://t.me/narratage" target="_blank" rel="noreferrer">Telegram</a></li>
        </ul>
      </section>

      <section class="np-footer-about">
        <h2>Narratage</h2>
        <p>
          {{
            t(
              "World's #1 video programming language and system for AI agents.",
              "世界首个 AI agent 视频编程语言与系统。"
            )
          }}
        </p>

        <div class="np-footer-social">
          <a :href="REPO" target="_blank" rel="noreferrer" aria-label="GitHub">
            <svg width="21" height="21" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
            </svg>
          </a>
          <a href="https://x.com/hypitai" target="_blank" rel="noreferrer" aria-label="X">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.9 1.15h3.68l-8.04 9.19L24 22.85h-7.41l-5.8-7.58-6.64 7.58H.46l8.6-9.83L0 1.15h7.6l5.24 6.93 6.06-6.93Zm-1.29 19.5h2.04L6.49 3.24H4.3l13.31 17.41Z" />
            </svg>
          </a>
          <a href="https://www.instagram.com/hypit_ai" target="_blank" rel="noreferrer" aria-label="Instagram">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="2.5" y="2.5" width="19" height="19" rx="5.4" stroke="currentColor" stroke-width="1.9" />
              <circle cx="12" cy="12" r="4.4" stroke="currentColor" stroke-width="1.9" />
              <circle cx="17.6" cy="6.4" r="1.25" fill="currentColor" />
            </svg>
          </a>
        </div>
      </section>
    </div>

    <div class="np-footer-bottom">
      <span>{{ t("© 2026 Hypit. All rights reserved.", "© 2026 Hypit. 保留所有权利。") }}</span>
      <a href="mailto:official@hypit.ai">{{ t("Email us", "联系我们") }}</a>
    </div>
  </footer>
</template>
