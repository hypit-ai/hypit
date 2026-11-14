const labels = {
  zh: {
    language: "切换到 English",
    themeLight: "切换到浅色模式",
    themeDark: "切换到深色模式",
    environment: "生成服务",
    environmentReady: "已连接",
    environmentAction: "需要连接",
    environmentUnavailable: "不可用",
    environmentConnecting: "等待授权…",
    connect: "连接 HypiHub",
    environmentService: "本地环境",
  },
  en: {
    language: "切换到中文",
    themeLight: "Switch to light mode",
    themeDark: "Switch to dark mode",
    environment: "Generation service",
    environmentReady: "Connected",
    environmentAction: "Connection required",
    environmentUnavailable: "Unavailable",
    environmentConnecting: "Waiting for authorization…",
    connect: "Connect HypiHub",
    environmentService: "Local Environment",
  },
};

const icons = {
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.2 2.3 3.3 5.1 3.3 8.5S14.2 18.2 12 20.5M12 3.5C9.8 5.8 8.7 8.6 8.7 12s1.1 6.2 3.3 8.5"/>',
  sun: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
};

function icon(name) {
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round">${icons[name]}</svg>`;
}

const brand = `<span class="workbench-brand-mark" aria-hidden="true">
  <svg class="workbench-brand-symbol" viewBox="50 180 262 234" preserveAspectRatio="xMidYMid meet"><path fill="currentColor" d="M303.78 277.82c-5.98-8.63-15.83-13.77-26.32-13.77h-93.41c-12.28 0-24.92 7.44-29.6 18.8l-28.26 75.82c-4.6 11.25-4.54 24.05 2.22 34.16 6.79 10.15 19.36 16.15 31.57 16.15h85.98c14.12 0 26.9-8.88 31.84-22.1l29.69-79.57c3.67-9.84 2.29-20.86-3.69-29.48Zm-51.76 99.43c-.94 2.52-3.39 4.22-6.08 4.22h-83.45c-4.34 0-6.68-2.8-7.49-3.99s-2.5-4.43-.84-8.44l23.85-66.24c2.29-6.35 8.08-10.87 14.82-11.22.33-.02.67-.02 1.02-.02h75.41s12.51 1.42 9.29 14.61l-26.53 71.09ZM106.85 361.73s-22.36-11.59-17.66-32.66l29.67-82.23c4.78-13.25 17.36-22.09 31.45-22.09h95.02c6.25 0 12.1 3.03 15.71 8.14l13.89 19.68H161.96c-8.7 0-16.49 5.41-19.52 13.57l-35.59 95.6Zm-33.55-38.46s-22.37-11.59-17.66-32.66l29.67-82.23c4.79-13.25 17.37-22.09 31.45-22.09h89.91c6.25 0 12.1 3.03 15.71 8.14l13.89 19.68H128.43c-8.7 0-16.49 5.41-19.52 13.57l-35.59 95.6Z"/></svg>
  <svg class="workbench-brand-wordmark" viewBox="370 228 422 180" preserveAspectRatio="xMinYMid meet"><g fill="currentColor"><rect x="692.47" y="276.19" width="19.22" height="90.09" rx="4.12"/><path d="M462.31 293.32c-4.51-11.11-12.93-15.68-28.26-17.66-15.52-2-31.17 1.58-36.41 2.96V240.2c0-2.22-1.8-4.02-4.02-4.02h-11.19c-2.22 0-4.02 1.8-4.02 4.02v123.26c0 2.22 1.8 4.02 4.02 4.02h11.19c2.22 0 4.02-1.8 4.02-4.02v-66.25c3.68-1.46 16.84-6.13 30.89-4.57 12.12 1.35 15.81 10.13 16.92 14.75.32 1.33.47 2.68.47 4.03v53.36c0 1.49 1.2 2.68 2.68 2.68h13.65c1.49 0 2.68-1.2 2.68-2.68V307.4c0-4.82-.82-9.63-2.63-14.09Z"/><path d="M568.55 346.34v-67.42c0-1.57-1.27-2.85-2.85-2.85h-14.66c-1.57 0-2.85 1.27-2.85 2.85v64.51c0 .58-.19 1.16-.58 1.6-1.62 1.88-7.33 6.23-25.19 5.92-2.22.05-6.37-.58-8.51-1.13-14.03-3.61-12.62-17.41-12.62-33.16v-37.73c0-1.57-1.27-2.85-2.85-2.85h-13.68c-1.57 0-2.85 1.27-2.85 2.85v57.63s-2.72 24.49 25.91 30.92c0 0 3.11.67 7.45 1.01 3.13.16 8.78.27 14.27-.42 6.97-.77 13.42-2.51 17.37-5.02 0 0-1.77 20.45-18.82 23.73-9.86 1.13-24.24-.46-31.62-1.65-2.22-.36-4.33 1.06-4.84 3.24l-2.55 10.92c-.49 2.08.99 4.09 3.1 4.28 7.44.63 23.6 1.84 34.54 1.37 14.62-.61 26.8-6.24 34.06-21.17 7.26-14.93 5.93-37.54 5.93-37.54Z"/><path d="M674.19 297.63c-8.46-21.2-28.09-21.76-37.64-22.58-7.78-.66-37.08.93-47.69 1.54-2.17.13-3.86 1.92-3.86 4.1v119.88c0 1.74 1.41 3.14 3.14 3.14h14.17c1.74 0 3.14-1.41 3.14-3.14v-34.16c45.01 4.23 52.91-1.5 60.82-8.86 8.8-8.2 15.13-37.91 7.91-59.92Zm-17.73 33.19c-.27 4.64-1.91 18-19.5 19.22-17.59 1.23-31.5-2.32-31.5-2.32v-54.21c4.62-.18 16.65-.61 25.09-.61 10.64 0 15.27 1.5 21.82 8.32s4.37 24.96 4.09 29.59Z"/><path d="M784.34 292.92c1.41 0 2.56-1.15 2.56-2.56v-11.6c0-1.41-1.15-2.56-2.56-2.56h-27.3v-19.11c0-1.32-1.07-2.38-2.38-2.38h-14.87c-1.32 0-2.38 1.07-2.38 2.38v19.11h-10.74c-1.41 0-2.56 1.15-2.56 2.56v11.6c0 1.41 1.15 2.56 2.56 2.56h10.74v48.61c0 14.46 11.72 26.19 26.19 26.19h19.46c2.13 0 3.86-1.73 3.86-3.86v-9.69c0-2.13-1.73-3.86-3.86-3.86h-13.53c-6.9 0-12.48-5.59-12.48-12.48v-44.92h27.3Z"/></g><circle fill="#e83f5f" cx="703.1" cy="250.37" r="14.18"/></svg>
</span>`;

const environmentMark = `<svg viewBox="50 180 262 234" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><path fill="currentColor" d="M303.78 277.82c-5.98-8.63-15.83-13.77-26.32-13.77h-93.41c-12.28 0-24.92 7.44-29.6 18.8l-28.26 75.82c-4.6 11.25-4.54 24.05 2.22 34.16 6.79 10.15 19.36 16.15 31.57 16.15h85.98c14.12 0 26.9-8.88 31.84-22.1l29.69-79.57c3.67-9.84 2.29-20.86-3.69-29.48Zm-51.76 99.43c-.94 2.52-3.39 4.22-6.08 4.22h-83.45c-4.34 0-6.68-2.8-7.49-3.99s-2.5-4.43-.84-8.44l23.85-66.24c2.29-6.35 8.08-10.87 14.82-11.22.33-.02.67-.02 1.02-.02h75.41s12.51 1.42 9.29 14.61l-26.53 71.09ZM106.85 361.73s-22.36-11.59-17.66-32.66l29.67-82.23c4.78-13.25 17.36-22.09 31.45-22.09h95.02c6.25 0 12.1 3.03 15.71 8.14l13.89 19.68H161.96c-8.7 0-16.49 5.41-19.52 13.57l-35.59 95.6Zm-33.55-38.46s-22.37-11.59-17.66-32.66l29.67-82.23c4.79-13.25 17.37-22.09 31.45-22.09h89.91c6.25 0 12.1 3.03 15.71 8.14l13.89 19.68H128.43c-8.7 0-16.49 5.41-19.52 13.57l-35.59 95.6Z"/></svg>`;

function currentLocale() {
  return localStorage.getItem("hypit.locale") === "en" ? "en" : "zh";
}

function currentTheme() {
  return localStorage.getItem("hypit-studio.theme") === "light" ? "light" : "dark";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

function workbenchEnvironment(environment, copy, hydrate = false) {
  const environmentStatus = environment?.connecting ? "connecting" : environment?.status;
  const environmentCopy = environmentStatus === "ready" ? copy.environmentReady
    : environmentStatus === "connecting" ? copy.environmentConnecting
      : environmentStatus === "action-required" ? copy.environmentAction : copy.environmentUnavailable;
  const credential = environment?.credentials?.find(item => !item.configured) ?? environment?.credentials?.[0];
  const service = credential?.endpoint?.startsWith("hypihub.") ? "HypiHub"
    : credential?.label ?? "HypiHub";
  return `<div class="workbench-environment" data-environment-state="${escapeHtml(environmentStatus ?? "unavailable")}"${hydrate ? " data-environment-hydrate" : ""}>
      <button class="workbench-chrome-button workbench-environment-trigger" type="button" popovertarget="workbench-environment-popover" aria-label="${escapeHtml(`${copy.environment}：${environmentCopy}`)}" title="${escapeHtml(`${copy.environment}：${environmentCopy}`)}"><span class="workbench-status-mark" aria-hidden="true">${environmentMark}</span></button>
      <div id="workbench-environment-popover" class="workbench-environment-popover" popover="auto">
        <header><strong>${copy.environment}</strong><span><i></i>${environmentCopy}</span></header>
        <div class="workbench-environment-service"><span class="workbench-service-mark">${environmentMark}</span><div><strong>${escapeHtml(service)}</strong><small>${environment?.environment?.selected ? `${copy.environmentService} · ${environment.environment.label ?? ""}` : environment?.environment?.candidate ?? copy.environmentService}</small></div></div>
        ${environment?.issue === undefined ? "" : `<p>${escapeHtml(environment.issue)}</p>`}
        ${environmentStatus === "ready" ? "" : `<button class="workbench-environment-connect" type="button" data-environment-connect ${environmentStatus === "unavailable" || environmentStatus === "connecting" ? "disabled" : ""}>${environmentStatus === "connecting" ? copy.environmentConnecting : copy.connect}</button>`}
      </div>
    </div>`;
}

export function workbenchTopbar({ projectName, mode = "floating", environment }) {
  const locale = currentLocale();
  const copy = labels[locale];
  const theme = currentTheme();
  document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  document.documentElement.dataset.theme = theme;
  const environmentMarkup = workbenchEnvironment(environment ?? { status: "unavailable", credentials: [] },
    copy, environment === undefined);
  return `<header class="workbench-topbar workbench-topbar--${mode}" data-workbench-topbar>
    <div class="workbench-topbar-left">
      <a class="workbench-brand" href="/" aria-label="Hypit">${brand}</a>
      <span class="workbench-project-name" data-project-name>${escapeHtml(projectName)}</span>
    </div>
    <div class="workbench-topbar-right">
      ${environmentMarkup}
      <button class="workbench-chrome-button" type="button" data-topbar-language aria-label="${copy.language}" title="${copy.language}">${icon("globe")}</button>
      <button class="workbench-chrome-button" type="button" data-topbar-theme aria-label="${theme === "dark" ? copy.themeLight : copy.themeDark}" title="${theme === "dark" ? copy.themeLight : copy.themeDark}">${icon(theme === "dark" ? "sun" : "moon")}</button>
    </div>
  </header>`;
}

export function bindWorkbenchTopbar(root = document) {
  const bar = root.querySelector("[data-workbench-topbar]");
  if (!bar) return;
  bar.querySelector("[data-topbar-language]")?.addEventListener("click", () => {
    localStorage.setItem("hypit.locale", currentLocale() === "zh" ? "en" : "zh");
    location.reload();
  });
  bar.querySelector("[data-topbar-theme]")?.addEventListener("click", () => {
    const theme = currentTheme() === "dark" ? "light" : "dark";
    localStorage.setItem("hypit-studio.theme", theme);
    document.documentElement.dataset.theme = theme;
    const locale = currentLocale();
    const button = bar.querySelector("[data-topbar-theme]");
    button.innerHTML = icon(theme === "dark" ? "sun" : "moon");
    button.title = theme === "dark" ? labels[locale].themeLight : labels[locale].themeDark;
    button.setAttribute("aria-label", button.title);
    dispatchEvent(new CustomEvent("hypit:theme", { detail: { theme } }));
  });
  const showEnvironment = environment => {
    const present = bar.querySelector(".workbench-environment");
    if (!present) return;
    present.outerHTML = workbenchEnvironment(environment, labels[currentLocale()]);
    bindEnvironment();
  };
  const bindEnvironment = () => {
    bar.querySelector("[data-environment-connect]")?.addEventListener("click", async () => {
      showEnvironment({ status: "action-required", connecting: true, credentials: [] });
      const response = await fetch("/api/workbench/environment", { method: "POST" });
      if (!response.ok) return;
      showEnvironment(await response.json());
    }, { once: true });
  };
  bindEnvironment();
  if (bar.querySelector("[data-environment-hydrate]")) {
    void fetch("/api/workbench/environment").then(async response => {
      if (response.ok) showEnvironment(await response.json());
    });
  }
}
