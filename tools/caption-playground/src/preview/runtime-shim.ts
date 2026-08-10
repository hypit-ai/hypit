export const RUNTIME_SHIM = String.raw`
<script>
(function () {
  var root = document.querySelector('[data-composition-id]');
  var fpsAttr = (root && root.getAttribute('data-fps')) || '30';
  var slash = fpsAttr.indexOf('/');
  var fps = slash === -1 ? parseFloat(fpsAttr) : parseFloat(fpsAttr.slice(0, slash)) / parseFloat(fpsAttr.slice(slash + 1));
  if (root) {
    root.style.width = (root.getAttribute('data-width') || '0') + 'px';
    root.style.height = (root.getAttribute('data-height') || '0') + 'px';
  }
  function seek(seconds) {
    var clips = document.querySelectorAll('.svml-visual-present');
    for (var i = 0; i < clips.length; i++) {
      var clip = clips[i];
      var start = parseFloat(clip.getAttribute('data-start') || '0') || 0;
      var duration = parseFloat(clip.getAttribute('data-duration') || '0') || 0;
      var local = seconds - start;
      var inside = local >= 0 && local < duration;
      clip.style.visibility = inside ? 'visible' : 'hidden';
      var animations = clip.getAnimations({ subtree: true });
      for (var a = 0; a < animations.length; a++) {
        try {
          animations[a].pause();
          animations[a].currentTime = Math.max(0, Math.min(duration, local)) * 1000;
        } catch (error) { /* animation will be sought again */ }
      }
    }
  }
  window.__svmlSeekFrame = function (frame) { seek(frame / fps); };
  seek(0);
  window.addEventListener('load', function () { seek(0); });
})();
</script>`;

export function injectRuntimeShim(html: string): string {
  const at = html.lastIndexOf("</body>");
  return at < 0 ? html + RUNTIME_SHIM : html.slice(0, at) + RUNTIME_SHIM + html.slice(at);
}
