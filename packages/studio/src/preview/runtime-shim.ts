import { injectHtmlPlayback } from "@hypit/html-playback";
import type { HtmlProgram } from "@hypit/html-program";

/** Studio host notification layered over the shared browser playback adapter. */
export function injectRuntimeShim(html: string, audio = "", program?: HtmlProgram): string {
  const playback = injectHtmlPlayback(html, audio, program);
  const ready = `window.__hypitFrameReady.then(function () {
    if (window.parent) window.parent.postMessage({ type: 'hypit-preview-ready' }, '*');
  });\n`;
  const marker = "})();\n</script>";
  const at = playback.lastIndexOf(marker);
  if (at < 0) throw new Error("HTML playback runtime is missing its completion boundary");
  return playback.slice(0, at) + ready + playback.slice(at);
}
