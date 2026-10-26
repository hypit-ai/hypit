import { audioEnvelopeGainAt } from "@hypit/composition";
import type { HtmlProgram } from "@hypit/html-program";
import {
  addExactTemporalValues,
  evaluateTemporalMap,
  exactTemporalRational,
  exactTemporalValueFromFrames,
} from "@hypit/temporal";

type PlaybackVideoPlan = {
  readonly id: string;
  readonly timestamps: readonly (number | null)[];
};

function playbackVideoPlan(program: HtmlProgram | undefined): readonly PlaybackVideoPlan[] {
  if (program === undefined) return [];
  return program.videoSources.flatMap((source) => {
    if (source.kind !== "media") return [];
    const timestamps = Array.from({ length: source.endFrameExclusive - source.startFrame }, (_, frame) => {
      const mapped = evaluateTemporalMap(source.sampling, exactTemporalValueFromFrames(frame, program));
      if (mapped === undefined) return null;
      const absolute = exactTemporalRational(addExactTemporalValues(source.source.presentationStart, mapped));
      const seconds = Number(absolute.numerator) / Number(absolute.denominator);
      if (!Number.isFinite(seconds)) throw new Error(`Playback video ${source.id} timestamp exceeds finite arithmetic`);
      return seconds;
    });
    return [{ id: source.id, timestamps }];
  });
}

/**
 * Browser playback adapter for one compiled HtmlProgram and AudioProgram.
 * The program owners retain picture, sound and frame facts; this adapter only
 * places both facts on one browser playback clock.
 */
function shim(videoPlan: readonly PlaybackVideoPlan[]): string {
  const encodedVideoPlan = encodeURIComponent(JSON.stringify(videoPlan));
  return String.raw`
<script>
(function () {
  var muted = false;
  var root = document.querySelector('[data-hypit-program-root]');
  var numerator = Number(root && root.getAttribute('data-hypit-frame-numerator')) || 30;
  var denominator = Number(root && root.getAttribute('data-hypit-frame-denominator')) || 1;
  var fps = numerator / denominator;
  var frameSeconds = 1 / fps;
  var currentSeconds = 0;
  var playing = false;
  var seekRevision = 0;
  var directMediaPlans = new Map(JSON.parse(decodeURIComponent(${JSON.stringify(encodedVideoPlan)})).map(function (entry) {
    return [entry.id, entry.timestamps];
  }));
  if (root) {
    root.style.width = (root.getAttribute('data-hypit-width') || '0') + 'px';
    root.style.height = (root.getAttribute('data-hypit-height') || '0') + 'px';
  }

  // Sampling runs are separate video elements with their own absolute spans.
  // Addressing only their containing Present makes every run paint at once.
  var media = [];
  for (var element of document.querySelectorAll('.hypit-visual-present video')) {
    var timestamps = directMediaPlans.get(element.id);
    var sourceFrame = element.getAttribute('data-hypit-source-frame');
    var sourceRate = element.getAttribute('data-hypit-source-rate');
    var sourceFps = element.getAttribute('data-hypit-source-fps');
    if (!timestamps && (!sourceFrame || !sourceRate || !sourceFps)) continue;
    media.push({
      element: element,
      url: element.getAttribute('data-hypit-src'),
      startFrame: Number(element.getAttribute('data-hypit-start-frame')),
      endFrame: Number(element.getAttribute('data-hypit-end-frame')),
      timestamps: timestamps,
      sourceFrame: timestamps ? undefined : sourceFrame.split('/').map(BigInt),
      sourceRate: timestamps ? undefined : sourceRate.split('/').map(BigInt),
      sourceFps: timestamps ? undefined : sourceFps.split('/').map(Number)
    });
  }
  var audioContext;
  var programAudio = [];
  for (var element of document.querySelectorAll('.hypit-playback-audio')) {
    programAudio.push({
      element: element,
      url: element.getAttribute('data-hypit-src'),
      start: parseFloat(element.getAttribute('data-start') || '0') || 0,
      duration: parseFloat(element.getAttribute('data-duration') || '0') || 0,
      mediaStart: parseFloat(element.getAttribute('data-media-start') || '0') || 0,
      mediaEnd: parseFloat(element.getAttribute('data-media-end') || '0') || 0,
      loop: element.getAttribute('data-loop') === 'true',
      phase: parseFloat(element.getAttribute('data-phase') || '0') || 0,
      rate: parseFloat(element.getAttribute('data-playback-rate') || '1') || 1,
      gain: Number(element.getAttribute('data-gain') ?? '1'),
      levelAutomation: JSON.parse(decodeURIComponent(element.getAttribute('data-level-automation') || '%7B%7D'))
    });
  }

  function scheduleEnvelope(param, points, sample, now) {
    param.cancelScheduledValues(now);
    param.setValueAtTime(audioEnvelopeGainAt(points, sample), now);
    for (var point of points || []) {
      if (point.sample > sample) param.linearRampToValueAtTime(point.gain, now + (point.sample - sample) / 48000);
    }
  }

  // Each factor has its own GainNode so intersecting ramps multiply exactly.
  // These are the same absolute-sample envelopes consumed by the render mixer.
  function placeAudioGain(record, seconds) {
    if (!record.nodes) {
      var source = audioContext.createMediaElementSource(record.element);
      record.nodes = Array.from({ length: 5 }, function () { return audioContext.createGain(); });
      var previous = source;
      for (var node of record.nodes) { previous.connect(node); previous = node; }
      previous.connect(audioContext.destination);
      record.element.volume = 1;
    }
    var sample = seconds * 48000;
    var now = audioContext.currentTime;
    var p = record.levelAutomation;
    var start = p.mixStartSample ?? record.start * 48000;
    var end = p.mixEndSampleExclusive ?? (record.start + record.duration) * 48000;
    record.nodes[0].gain.setValueAtTime(record.gain, now);
    scheduleEnvelope(record.nodes[1].gain, p.gainEnvelope, sample, now);
    scheduleEnvelope(record.nodes[2].gain, p.fadeInSamples > 0
      ? [{ sample: start, gain: 0 }, { sample: start + p.fadeInSamples, gain: 1 }] : undefined, sample, now);
    scheduleEnvelope(record.nodes[3].gain, p.fadeOutSamples > 0
      ? [{ sample: end - p.fadeOutSamples, gain: 1 }, { sample: end, gain: 0 }] : undefined, sample, now);
    var gate = record.nodes[4].gain;
    gate.cancelScheduledValues(now);
    gate.setValueAtTime(p.audibility === undefined || p.audibility.some(function (span) {
      return sample >= span.startSample && sample < span.endSampleExclusive;
    }) ? 1 : 0, now);
    for (var span of p.audibility || []) {
      if (span.startSample > sample) gate.setValueAtTime(1, now + (span.startSample - sample) / 48000);
      if (span.endSampleExclusive > sample) gate.setValueAtTime(0, now + (span.endSampleExclusive - sample) / 48000);
    }
  }

  var pendingSeeks = new Map();
  function cancelSeek(element) {
    var pending = pendingSeeks.get(element);
    if (pending) pending.done();
  }
  function seekDecoded(element, target) {
    var pending = pendingSeeks.get(element);
    if (pending && pending.target === target) return pending.promise;
    cancelSeek(element);
    if (Math.abs(element.currentTime - target) < 0.0005 && element.readyState >= 2) return Promise.resolve();
    var request = { target: target };
    request.promise = new Promise(function (resolve) {
      var done = function () {
        element.removeEventListener('seeked', done);
        element.removeEventListener('error', done);
        element.removeEventListener('emptied', done);
        element.removeEventListener('loadeddata', decoded);
        element.removeEventListener('loadedmetadata', seek);
        if (pendingSeeks.get(element) === request) pendingSeeks.delete(element);
        resolve();
      };
      request.done = done;
      var decoded = function () {
        if (!element.seeking && element.readyState >= 2 && Math.abs(element.currentTime - target) < 0.0005) done();
      };
      var seek = function () {
        try {
          if (Math.abs(element.currentTime - target) >= 0.0005) element.currentTime = target;
          decoded();
        }
        catch (error) { done(); }
      };
      pendingSeeks.set(element, request);
      element.addEventListener('seeked', done, { once: true });
      element.addEventListener('error', done, { once: true });
      element.addEventListener('emptied', done, { once: true });
      element.addEventListener('loadeddata', decoded);
      if (element.readyState === 0) element.addEventListener('loadedmetadata', seek, { once: true });
      else seek();
    });
    return request.promise;
  }

  function prepareMedia(record, nearby) {
    if (!record.url) return;
    if (nearby && !record.loaded) {
      record.element.setAttribute('src', record.url);
      record.element.preload = 'auto';
      record.loaded = true;
    } else if (!nearby && record.loaded) {
      cancelSeek(record.element);
      record.element.pause();
      record.element.removeAttribute('src');
      record.element.load();
      record.loaded = false;
    }
  }

  function placeHTML(frame) {
    if (!window.__hypitFrameProgram) return Promise.reject(new Error('HTML Program page ABI is missing'));
    return window.__hypitFrameProgram.applyFrame(frame);
  }

  // Source time (seconds, decoded-frame centre) that a visual record shows at
  // one Program frame. A hold stays on its authored source frame.
  function sourceTarget(record, programFrame) {
    if (record.timestamps) return record.timestamps[programFrame - record.startFrame];
    var sourceFrame;
    if (record.sourceRate[0] === 0n) sourceFrame = Number(record.sourceFrame[0] / record.sourceFrame[1]);
    else {
      var a = record.sourceFrame, r = record.sourceRate;
      sourceFrame = Number((a[0] * r[1] + BigInt(programFrame - record.startFrame) * r[0] * a[1]) / (a[1] * r[1]));
    }
    var target = (sourceFrame + 0.5) * record.sourceFps[1] / record.sourceFps[0];
    var element = record.element;
    if (Number.isFinite(element.duration) && element.duration > 0) {
      target = Math.min(target, Math.max(0, element.duration - 0.001));
    }
    return target;
  }

  function apply(seconds, scrubbing) {
    currentSeconds = Math.max(0, seconds);
    var revision = ++seekRevision;
    var waits = [];
    var programFrame = Math.max(0, Math.round(currentSeconds * fps));
    for (var record of media) {
      var inside = programFrame >= record.startFrame && programFrame < record.endFrame;
      var element = record.element;
      prepareMedia(record, programFrame >= record.startFrame - 2 * fps && programFrame < record.endFrame + fps);
      // Materialized picture Artifacts are deliberately silent. Program sound
      // comes from the exact AudioTrack below rather than from a video sidecar.
      element.muted = true;
      var target = inside ? sourceTarget(record, programFrame) : undefined;
      inside = inside && target !== undefined && target !== null;
      if (!inside) {
        element.style.visibility = 'hidden';
        element.pause();
        // An upcoming Clip waits decoded on its entry frame, so the cut shows
        // that frame at once instead of whatever the decoder last held.
        var entryTarget = programFrame < record.startFrame ? sourceTarget(record, record.startFrame) : undefined;
        if (record.loaded && entryTarget !== undefined && entryTarget !== null) seekDecoded(element, entryTarget);
        else cancelSeek(element);
        continue;
      }
      var directNext = record.timestamps && programFrame + 1 < record.endFrame
        ? sourceTarget(record, programFrame + 1) : undefined;
      var directRate = directNext === undefined || directNext === null ? 0 : (directNext - target) * fps;
      // A hold remains one compact target interval. Its exact zero source rate
      // cannot be assigned to HTMLMediaElement.playbackRate, so keep the native
      // decoder paused at the authored source frame instead.
      if (scrubbing || (record.timestamps ? directRate <= 0 : record.sourceRate[0] <= 0n)
        || programFrame === record.endFrame - 1) {
        element.style.visibility = 'visible';
        element.pause();
        waits.push(seekDecoded(element, target));
        continue;
      }
      // During continuous playback the decoder owns its clock. A frame event
      // only corrects visible drift; making every refresh a media seek is what
      // previously froze the preview between frames. A Clip entered before its
      // frame is decoded stays hidden rather than flashing a stale picture.
      if (element.style.visibility !== 'visible' && !(element.readyState >= 2 && !element.seeking && !pendingSeeks.has(element))) {
        if (element.readyState > 0 && !pendingSeeks.has(element)) {
          element.pause();
          seekDecoded(element, target);
        }
        continue;
      }
      element.style.visibility = 'visible';
      cancelSeek(element);
      if (element.readyState === 0) continue;
      if (!element.seeking && Math.abs(element.currentTime - target) > 0.08) element.currentTime = target;
      element.playbackRate = record.timestamps ? directRate
        : Number(record.sourceRate[0]) / Number(record.sourceRate[1]) * fps * record.sourceFps[1] / record.sourceFps[0];
      if (element.paused) {
        var started = element.play();
        if (started) started.catch(function () {});
      }
    }
    for (var record of programAudio) {
      var local = currentSeconds - record.start;
      var inside = local >= 0 && local < record.duration;
      var element = record.element;
      prepareMedia(record, local >= -2 && local < record.duration + 1);
      element.muted = muted || scrubbing;
      if (!inside) { cancelSeek(element); element.pause(); continue; }
      var interval = Math.max(0, record.mediaEnd - record.mediaStart);
      var advanced = local * record.rate;
      var target = record.mediaStart + advanced;
      if (record.loop && interval > 0) target = record.mediaStart + ((record.phase + advanced) % interval);
      else target = Math.min(target, Math.max(record.mediaStart, record.mediaEnd - 0.000001));
      if (scrubbing) {
        element.pause();
        waits.push(seekDecoded(element, target));
      } else {
        cancelSeek(element);
        if (element.readyState === 0) continue;
        if (!element.seeking && Math.abs(element.currentTime - target) > 0.08) element.currentTime = target;
        element.playbackRate = record.rate;
        placeAudioGain(record, currentSeconds);
        if (element.paused) {
          var started = element.play();
          if (started) started.catch(function () {});
        }
      }
    }
    waits.push(placeHTML(programFrame));
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
    if (programAudio.length && !audioContext) audioContext = new AudioContext();
    if (audioContext && audioContext.state === 'suspended') audioContext.resume();
    return apply(frame / fps, false);
  };
  window.__hypitFrameReady = apply(0, true);
})();
</script>`;
}

export function injectHtmlPlayback(html: string, audio = "", program?: HtmlProgram): string {
  // Take ownership before the renderer activates deferred resources. Otherwise
  // every video in a long Program allocates a decoder before the first frame.
  html = html.replace(/(<video\b[^>]*?)\s(?:data-hypit-resource-src|src)=/gu, '$1 preload="none" data-hypit-src=');
  const script = audio + shim(playbackVideoPlan(program)).replace("(function () {", `(function () {\n${audioEnvelopeGainAt.toString()}`);
  const at = html.lastIndexOf("</body>");
  return at < 0 ? html + script : html.slice(0, at) + script + html.slice(at);
}
