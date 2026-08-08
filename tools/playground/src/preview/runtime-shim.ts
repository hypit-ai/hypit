/**
 * The timeline the compiled document does not carry.
 *
 * `compileHyperframesDocument` emits every Present as an always-visible clip and
 * gives its animations a duration but no delay — a real render supplies the
 * runtime that gates and seeks them. This is that runtime, reduced to what a
 * preview needs, and it uses the same technique the production renderer does:
 * `getAnimations()` plus an explicit `currentTime`.
 *
 * Injected into the materialized HTML. `compileHyperframesDocument` is never
 * touched, so what renders here stays the document the compiler produced.
 */
export const RUNTIME_SHIM = String.raw`
<script>
(function () {
  var root = document.querySelector('[data-composition-id]');
  var fpsAttr = (root && root.getAttribute('data-fps')) || '30';
  var slash = fpsAttr.indexOf('/');
  var fps = slash === -1
    ? parseFloat(fpsAttr)
    : parseFloat(fpsAttr.slice(0, slash)) / parseFloat(fpsAttr.slice(slash + 1));
  var frameCount = parseInt((root && root.getAttribute('data-svml-frame-count')) || '0', 10);

  // The compiled stylesheet gives the composition root position and overflow but
  // no size — a real render sizes it from data-width/data-height. Left alone it
  // computes to zero height, and since every Present is absolutely positioned
  // inside it with overflow:hidden, the whole frame clips away to nothing.
  if (root) {
    root.style.width = (root.getAttribute('data-width') || '0') + 'px';
    root.style.height = (root.getAttribute('data-height') || '0') + 'px';
  }

  function clips() {
    return document.querySelectorAll('.svml-visual-present');
  }

  /** Seek to an absolute program time in seconds. */
  function seek(seconds) {
    var list = clips();
    for (var i = 0; i < list.length; i++) {
      var clip = list[i];
      var start = parseFloat(clip.getAttribute('data-start') || '0') || 0;
      var duration = parseFloat(clip.getAttribute('data-duration') || '0') || 0;
      var local = seconds - start;
      var inside = local >= 0 && local < duration;
      clip.style.visibility = inside ? 'visible' : 'hidden';

      var animations = clip.getAnimations({ subtree: true });
      for (var a = 0; a < animations.length; a++) {
        var animation = animations[a];
        try {
          animation.pause();
          // Clamp rather than skip: a Present's held first and last keyframes are
          // what the renderer shows at its edges, so the boundary frames match.
          var at = local < 0 ? 0 : (local > duration ? duration : local);
          animation.currentTime = at * 1000;
        } catch (error) {
          /* An animation that is not yet ready re-seeks on the next call. */
        }
      }

      var media = clip.querySelectorAll('video, audio');
      for (var m = 0; m < media.length; m++) {
        var element = media[m];
        element.pause();
        if (inside) {
          var offset = parseFloat(element.getAttribute('data-media-start') || '0') || 0;
          try { element.currentTime = offset + local; } catch (error) { /* not seekable yet */ }
        }
      }
    }
  }

  window.__svmlSeek = seek;
  window.__svmlFrameCount = frameCount;
  window.__svmlFps = fps;
  window.__svmlSeekFrame = function (frame) { seek(frame / fps); };

  // Paint the first frame correctly rather than whatever the CSS happened to be
  // mid-animation when the document loaded.
  seek(0);
  window.addEventListener('load', function () { seek(0); });
})();
</script>
`;

/** Places the shim last in the body so it observes the finished element tree. */
export function injectRuntimeShim(html: string): string {
  const marker = "</body>";
  const at = html.lastIndexOf(marker);
  if (at === -1) return html + RUNTIME_SHIM;
  return html.slice(0, at) + RUNTIME_SHIM + html.slice(at);
}
