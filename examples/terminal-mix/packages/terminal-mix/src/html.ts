import { visualProgramHtmlSource } from "@hypit/audiovisual-html";
import { htmlVisual } from "@hypit/html-program";

function escapeHtml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
}

export function terminalMixLabelHtmlSource(source: string, title: string, subtitle: string) {
  return visualProgramHtmlSource(source, "picture", htmlVisual({
    html: `<header><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></header>`,
    css: ":scope>header{position:absolute;left:0;right:0;top:0;padding:28px 32px;display:flex;align-items:baseline;justify-content:space-between;color:#f7f8ff;font-family:Inter,system-ui,sans-serif;letter-spacing:.02em}:scope strong{font-size:22px;font-weight:720}:scope span{font-size:12px;font-weight:520;color:#aebbd8;text-transform:uppercase;letter-spacing:.16em}",
  }));
}
