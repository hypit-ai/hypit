/**
 * Studio's frame driver for a compiled HyperFrames document.
 *
 * HyperFrames remains the owner of layout and animation. Studio only supplies
 * an absolute Program frame, places every timed Present/material at that
 * instant, and waits until a discrete media seek is actually decoded.
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
  var seekRevision = 0;
  if (root) {
    root.style.width = (root.getAttribute('data-width') || '0') + 'px';
    root.style.height = (root.getAttribute('data-height') || '0') + 'px';
  }

  var visualClips = [];
  for (var clip of document.querySelectorAll('.hypit-visual-present')) {
    visualClips.push({
      element: clip,
      start: parseFloat(clip.getAttribute('data-start') || '0') || 0,
      duration: parseFloat(clip.getAttribute('data-duration') || '0') || 0
    });
  }
  // Sampling runs are separate video elements with their own absolute spans.
  // Addressing only their containing Present makes every run paint at once.
  var media = [];
  for (var element of document.querySelectorAll('.hypit-visual-present video')) {
    var present = element.closest('.hypit-visual-present');
    var ownStart = element.getAttribute('data-start');
    var ownDuration = element.getAttribute('data-duration');
    media.push({
      element: element,
      start: parseFloat(ownStart || (present && present.getAttribute('data-start')) || '0') || 0,
      duration: parseFloat(ownDuration || (present && present.getAttribute('data-duration')) || '0') || 0,
      mediaStart: parseFloat(element.getAttribute('data-media-start') || '0') || 0,
      rate: parseFloat(element.getAttribute('data-playback-rate') || '1') || 1,
      track: present && present.getAttribute('data-hypit-track-id')
    });
  }

  function seekDecoded(element, target) {
    if (Math.abs(element.currentTime - target) < 0.0005 && element.readyState >= 2) return Promise.resolve();
    return new Promise(function (resolve) {
      var done = function () {
        element.removeEventListener('seeked', done);
        element.removeEventListener('error', done);
        resolve();
      };
      element.addEventListener('seeked', done, { once: true });
      element.addEventListener('error', done, { once: true });
      try { element.currentTime = target; }
      catch (error) { done(); }
    });
  }

  function placeHyperframes(seconds) {
    var pending = [];
    var event = new CustomEvent('hf-seek', { detail: {
      time: seconds,
      waitUntil: function (promise) { pending.push(Promise.resolve(promise)); }
    }});
    window.dispatchEvent(event);
    var compositionId = root && root.getAttribute('data-composition-id');
    var timeline = compositionId && window.__timelines && window.__timelines[compositionId];
    if (timeline) {
      if (typeof timeline.pause === 'function') timeline.pause();
      if (typeof timeline.totalTime === 'function') timeline.totalTime(seconds);
      else if (typeof timeline.seek === 'function') timeline.seek(seconds);
    }
    return Promise.all(pending);
  }

  function apply(seconds, scrubbing) {
    currentSeconds = Math.max(0, seconds);
    var revision = ++seekRevision;
    var waits = [];
    for (var record of visualClips) {
      var local = currentSeconds - record.start;
      record.element.style.visibility = local >= 0 && local < record.duration ? 'visible' : 'hidden';
    }
    for (var record of media) {
      var local = currentSeconds - record.start;
      var inside = local >= 0 && local < record.duration;
      var element = record.element;
      element.style.visibility = inside ? 'visible' : 'hidden';
      element.muted = muted || scrubbing || audible === null || record.track !== audible;
      if (!inside) { element.pause(); continue; }
      var target = record.mediaStart + (local + frameSeconds / 2) * record.rate;
      if (Number.isFinite(element.duration) && element.duration > 0) {
        target = Math.min(target, Math.max(0, element.duration - 0.001));
      }
      if (scrubbing || local >= record.duration - frameSeconds - 0.000001) {
        element.pause();
        waits.push(seekDecoded(element, target));
      } else {
        // During continuous playback the decoder owns its clock. A frame event
        // only corrects visible drift; making every refresh a media seek is what
        // previously froze the preview between frames.
        if (Math.abs(element.currentTime - target) > 0.08) element.currentTime = target;
        element.playbackRate = record.rate;
        if (element.paused) {
          var started = element.play();
          if (started) started.catch(function () {});
        }
      }
    }
    waits.push(placeHyperframes(currentSeconds));
    return Promise.all(waits).then(function () { return revision === seekRevision; });
  }

  window.__hypitSetMuted = function (value) {
    muted = !!value;
    return apply(currentSeconds, !playing);
  };
  window.__hypitSeekFrame = function (frame) {
    playing = false;
    return apply(frame / fps, true);
  };
  window.__hypitPlayFrame = function (frame) {
    playing = true;
    return apply(frame / fps, false);
  };
  window.__hypitFrameReady = apply(0, true);
  window.addEventListener('load', function () { window.__hypitFrameReady = apply(currentSeconds, true); });
})();
</script>`;
}

export function injectRuntimeShim(html: string, audibleTrack?: string): string {
  const script = shim(audibleTrack);
  const at = html.lastIndexOf("</body>");
  return at < 0 ? html + script : html.slice(0, at) + script + html.slice(at);
}
