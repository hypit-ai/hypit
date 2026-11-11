import type { NleTimelineComponentPresentation } from "@hypit/nle-view";

import { rankingBoardComponentSymbol, verdictBurstComponentSymbol } from "./nle-package.js";

const rankingBoardPoster = new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" width="34" height="48" viewBox="0 0 34 48">
  <rect width="34" height="48" fill="#2a1f18"/>
  <g opacity=".82">
    <rect x="5" y="5" width="18" height="7" rx="2" fill="#f0a15f"/>
    <rect x="5" y="15" width="25" height="7" rx="2" fill="#cb7658"/>
    <rect x="5" y="25" width="21" height="7" rx="2" fill="#9b5b62"/>
    <rect x="5" y="35" width="15" height="7" rx="2" fill="#694a55"/>
  </g>
  <path d="M33 0v48" stroke="#ffffff" stroke-opacity=".08"/>
</svg>`);

const verdictPoster = new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg" width="34" height="48" viewBox="0 0 34 48">
  <rect width="34" height="48" fill="#251d20"/>
  <path d="m17 3 3 10 8-6-4 11 9 2-9 4 6 9-10-5-3 12-4-11-10 6 6-11-9-3 10-4-6-9 10 5z" fill="#d98563" opacity=".84"/>
  <circle cx="17" cy="22" r="5" fill="#251d20"/>
  <path d="M33 0v48" stroke="#ffffff" stroke-opacity=".08"/>
</svg>`);

function parameterText(parameters: unknown, name: string): string | undefined {
  if (parameters === null || typeof parameters !== "object" || Array.isArray(parameters)) return undefined;
  const value = (parameters as Readonly<Record<string, unknown>>)[name];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

export const rankingBoardNlePresentation: NleTimelineComponentPresentation = {
  component: rankingBoardComponentSymbol,
  displayName: "Ranking Board",
  tone: "orange",
  chrome: "group",
  heightPx: 48,
  poster: {
    mediaType: "image/svg+xml",
    layout: "repeat-x",
    open: () => rankingBoardPoster,
  },
  project: ({ item }) => {
    const title = parameterText(item.parameters, "title");
    return { title: title ?? "Ranking Board" };
  },
};

export const verdictBurstNlePresentation: NleTimelineComponentPresentation = {
  component: verdictBurstComponentSymbol,
  displayName: "Verdict",
  tone: "orange-muted",
  chrome: "standard",
  heightPx: 40,
  poster: {
    mediaType: "image/svg+xml",
    layout: "repeat-x",
    open: () => verdictPoster,
  },
  project: ({ item }) => {
    const title = parameterText(item.parameters, "title");
    return { title: title ?? parameterText(item.parameters, "kicker") ?? "Verdict" };
  },
};
