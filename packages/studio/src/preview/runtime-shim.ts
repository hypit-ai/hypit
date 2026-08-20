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
  var frameSeconds = 1 / fps;
  var currentSeconds = 0;
  var playing = false;
  var playbackFrame = 0;
  var playbackStartedAt = 0;
  var playbackHandle = 0;
  var programmeDuration = 0;
  var visualClips = [];
  if (root) {
    root.style.width = (root.getAttribute('data-width') || '0') + 'px';
    root.style.height = (root.getAttribute('data-height') || '0') + 'px';
  }
  var clipNodes = document.querySelectorAll('.hypit-visual-present');
  for (var clipIndex = 0; clipIndex < clipNodes.length; clipIndex++) {
    var clipNode = clipNodes[clipIndex];
    var clipStart = parseFloat(clipNode.getAttribute('data-start') || '0') || 0;
    var clipDuration = parseFloat(clipNode.getAttribute('data-duration') || '0') || 0;
    programmeDuration = Math.max(programmeDuration, clipStart + clipDuration);
    visualClips.push({
      element: clipNode,
      start: clipStart,
      duration: clipDuration,
      videos: clipNode.querySelectorAll('video'),
      track: clipNode.getAttribute('data-hypit-track-id')
    });
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
    currentSeconds = Math.max(0, seconds);
    for (var i = 0; i < visualClips.length; i++) {
      var record = visualClips[i];
      var clip = record.element;
      var local = seconds - record.start;
      var inside = local >= 0 && local < record.duration;
      var lastFrame = inside && local >= record.duration - frameSeconds - 0.000001;
      clip.style.visibility = inside ? 'visible' : 'hidden';
      var media = record.videos;
      for (var m = 0; m < media.length; m++) {
        var element = media[m];
        var mediaStart = parseFloat(element.getAttribute('data-media-start') || '0') || 0;
        var rate = parseFloat(element.getAttribute('data-playback-rate') || '1') || 1;
        // Seek the centre of the requested source frame. An exact frame
        // boundary lets the decoder choose either neighbouring picture.
        var target = mediaStart + (Math.max(0, local) + frameSeconds / 2) * rate;
        if (Number.isFinite(element.duration) && element.duration > 0) {
          target = Math.min(target, Math.max(0, element.duration - 0.001));
        }
        // HyperFrames renders a silent picture, because programme audio is a
        // separate Track the media pipeline muxes in. A preview is not a
        // render, and placing B-roll against speech means hearing the speech,
        // so the Spine's own material is allowed to sound.
        element.muted = muted || scrubbing || audible === null || record.track !== audible;
        try {
          if (!inside) { element.pause(); continue; }
          // Do not let a video run through its media end. Some decoders expose
          // the first decoded picture again after ended; pinning the final
          // Program frame keeps the Segment transition frame-pure.
          if (scrubbing || lastFrame) { element.pause(); element.currentTime = target; continue; }
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
  function stopClock() {
    playing = false;
    if (playbackHandle) cancelAnimationFrame(playbackHandle);
    playbackHandle = 0;
  }
  function tick(now) {
    if (!playing) return;
    var seconds = playbackFrame / fps + Math.max(0, now - playbackStartedAt) / 1000;
    if (programmeDuration > 0 && seconds >= programmeDuration) {
      apply(Math.max(0, programmeDuration - frameSeconds), true);
      stopClock();
      return;
    }
    apply(seconds, false);
    playbackHandle = requestAnimationFrame(tick);
  }
  window.__hypitSetMuted = function (value) {
    muted = !!value;
    apply(currentSeconds, !playing);
  };
  window.__hypitSeekFrame = function (frame) {
    stopClock();
    apply(frame / fps, true);
  };
  window.__hypitPlayFrame = function (frame) { apply(frame / fps, false); };
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
