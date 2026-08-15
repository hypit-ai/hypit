/**
 * The bridge between the transport bar and the composition inside the iframe.
 *
 * A HyperFrames document drives its own motion. On load it samples every
 * animated element frame by frame, cancels the CSS animation and sets
 * `animation-name: none`, then waits for an `hf-seek` event carrying a time in
 * seconds. Reaching for the Web Animations API here would find nothing to move,
 * which is exactly how motion ends up frozen on its first keyframe.
 *
 * What the document does not do is decide which Presents are on screen, or run
 * real material, because those are the driver's job. So this shim owns two
 * things and delegates the third: it hides Presents outside their span, keeps
 * material on the same instant, and asks the document to place its own
 * animations.
 */
function shim(audibleTrack: string | undefined): string {
  return String.raw`
<script>
(function () {
  var audible = ${JSON.stringify(audibleTrack ?? null)};
  var muted = false;
  var root = document.querySelector('[data-composition-id]');
  var fpsAttr = (root && root.getAttribute('data-fps')) || '30';
  var slash = fpsAttr.indexOf('/');
  var fps = slash === -1
    ? parseFloat(fpsAttr)
    : parseFloat(fpsAttr.slice(0, slash)) / parseFloat(fpsAttr.slice(slash + 1));
  if (root) {
    root.style.width = (root.getAttribute('data-width') || '0') + 'px';
    root.style.height = (root.getAttribute('data-height') || '0') + 'px';
  }
  /**
   * Place the composition at one instant.
   *
   * Scrubbing and playing are different requests of the same material. A seek is
   * a discrete jump, so material is paused and moved. Playback is continuous, so
   * material runs on its own clock and is only corrected when it has drifted —
   * setting currentTime every frame would ask the decoder for a fresh seek
   * dozens of times a second, and the picture would fall behind the playhead
   * while the transport insisted it was keeping time.
   */
  function apply(seconds, scrubbing) {
    var clips = document.querySelectorAll('.narratage-visual-present');
    for (var i = 0; i < clips.length; i++) {
      var clip = clips[i];
      var start = parseFloat(clip.getAttribute('data-start') || '0') || 0;
      var duration = parseFloat(clip.getAttribute('data-duration') || '0') || 0;
      var local = seconds - start;
      var inside = local >= 0 && local < duration;
      clip.style.visibility = inside ? 'visible' : 'hidden';
      var media = clip.querySelectorAll('video');
      for (var m = 0; m < media.length; m++) {
        var element = media[m];
        var mediaStart = parseFloat(element.getAttribute('data-media-start') || '0') || 0;
        var rate = parseFloat(element.getAttribute('data-playback-rate') || '1') || 1;
        var target = mediaStart + Math.max(0, local) * rate;
        // HyperFrames renders a silent picture, because programme audio is a
        // separate Track the media pipeline muxes in. A preview is not a
        // render, and placing B-roll against speech means hearing the speech,
        // so the Spine's own material is allowed to sound.
        var track = clip.getAttribute('data-narratage-track-id');
        element.muted = muted || scrubbing || audible === null || track !== audible;
        try {
          if (!inside) { element.pause(); continue; }
          if (scrubbing) { element.pause(); element.currentTime = target; continue; }
          // Quarter of a second is below the threshold of noticing and well
          // above the jitter of a decoder keeping its own time.
          if (Math.abs(element.currentTime - target) > 0.25) element.currentTime = target;
          element.playbackRate = rate;
          if (element.paused) { var played = element.play(); if (played) played.catch(function () {}); }
        } catch (error) { /* the media is not ready yet */ }
      }
    }
    // The document's own runtimes place every animated element and every text
    // flow from their sampled timelines.
    window.dispatchEvent(new CustomEvent('hf-seek', { detail: { time: seconds } }));
  }
  window.__svmlSetMuted = function (value) { muted = !!value; };
  window.__svmlSeekFrame = function (frame) { apply(frame / fps, true); };
  window.__svmlPlayFrame = function (frame) { apply(frame / fps, false); };
  apply(0, true);
  window.addEventListener('load', function () { apply(0, true); });
})();
</script>`;
}

export function injectRuntimeShim(html: string, audibleTrack?: string): string {
  const script = shim(audibleTrack);
  const at = html.lastIndexOf("</body>");
  return at < 0 ? html + script : html.slice(0, at) + script + html.slice(at);
}
