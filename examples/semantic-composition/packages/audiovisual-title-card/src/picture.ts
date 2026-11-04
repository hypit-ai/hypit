import { visualProgramHtmlSource } from "@hypit/audiovisual-html";
import { htmlVisual } from "@hypit/html-program";

import { assertTitleCardSpec } from "./source.js";
import type { TitleCardSpec } from "./source.js";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
}

/** Package-owned HTML implementation of this Source; AVIR never interprets its vocabulary. */
export function titleCardHtmlSource(spec: TitleCardSpec) {
  assertTitleCardSpec(spec);
  return visualProgramHtmlSource(spec.id, "picture", htmlVisual({
      html: `<section><h1>${escapeHtml(spec.title)}</h1><p>${escapeHtml(spec.subtitle)}</p></section>`,
      css: `:scope>section{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:24px;background:${spec.background};color:${spec.foreground};font-family:system-ui,sans-serif}:scope h1,:scope p{margin:0}:scope h1{font-size:96px}:scope p{font-size:36px}`,
  }));
}
