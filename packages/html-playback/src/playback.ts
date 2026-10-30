import { audioEnvelopeGainAt } from "@hypit/composition";
import type { HtmlProgram } from "@hypit/html-program";
import {
  addExactTemporalValues,
  evaluateTemporalSample,
  exactTemporalRational,
  exactTemporalValueFromFrames,
} from "@hypit/temporal";

type PlaybackVideoPlan = {
  readonly id: string;
  readonly documentPath: readonly string[];
  readonly startFrame: number;
  readonly endFrame: number;
  readonly timestamps: readonly (number | null)[];
};

function playbackVideoPlan(program: HtmlProgram | undefined): readonly PlaybackVideoPlan[] {
  if (program === undefined) return [];
  return program.videoSources.flatMap((source) => {
    if (source.kind === "media" && source.source.streamIndex !== 0) {
      throw new Error(`Browser playback cannot select visual stream ${source.source.streamIndex} for ${source.id}; use a renderer that executes the HtmlProgram source plan`);
    }
    if (source.kind === "media" && source.source.frameIndex === undefined) {
      throw new Error(`Browser playback requires the measured frame index for ${source.id}; prepare the source with video frame timing.`);
    }
    const timestamps = Array.from({ length: source.endFrameExclusive - source.startFrame }, (_, frame) => {
      if (source.kind === "surface") {
        const a = source.sourceFrame, r = source.sourceRate;
        const index = (BigInt(a.numerator) * BigInt(r.denominator)
          + BigInt(frame) * BigInt(r.numerator) * BigInt(a.denominator))
          / (BigInt(a.denominator) * BigInt(r.denominator));
        return (Number(index) + 0.5) * source.sourceFrameRate.denominator / source.sourceFrameRate.numerator;
      }
      const selected = source.frameSelection === undefined ? frame : source.frameSelection.frames[frame];
      if (selected == null) return null;
      const mapped = evaluateTemporalSample(source.sampling, exactTemporalValueFromFrames(selected, source.frameSelection ?? program));
      if (mapped === undefined) return null;
      const absolute = exactTemporalRational(addExactTemporalValues(source.source.presentationStart, mapped.position));
      const index = source.source.frameIndex!;
      const scale = BigInt(index.timeBase.numerator) * absolute.denominator;
      const target = absolute.numerator * BigInt(index.timeBase.denominator);
      let low = 0, high = index.timestamps.length;
      while (low < high) {
        const middle = Math.floor((low + high) / 2);
        const pts = BigInt(index.timestamps[middle]!) * scale;
        if (mapped.direction < 0 ? pts < target : pts <= target) low = middle + 1;
        else high = middle;
      }
      if (low === 0 || (mapped.direction < 0 ? target > BigInt(index.endTimestamp) * scale
        : target >= BigInt(index.endTimestamp) * scale)) return null;
      const start = BigInt(index.timestamps[low - 1]!);
      const end = BigInt(index.timestamps[low] ?? index.endTimestamp);
      const seconds = Number((start + end) * BigInt(index.timeBase.numerator)) / (2 * index.timeBase.denominator);
      if (!Number.isFinite(seconds)) throw new Error(`Playback video ${source.id} timestamp exceeds finite arithmetic`);
      return seconds;
    });
    return [{ id: source.elementId, documentPath: source.documentPath, startFrame: source.startFrame,
      endFrame: source.endFrameExclusive, timestamps }];
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
  var videoPlans = JSON.parse(decodeURIComponent(${JSON.stringify(encodedVideoPlan)}));
  if (root) {
    root.style.width = (root.getAttribute('data-hypit-width') || '0') + 'px';
    root.style.height = (root.getAttribute('data-hypit-height') || '0') + 'px';
  }

  // Sampling runs are separate video elements with their own absolute spans.
  // Addressing only their containing Present makes every run paint at once.
  var media = [];
  for (var element of videoPlans.length ? [] : document.querySelectorAll('.hypit-visual-present video')) {
    var timestamps;
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
  function refreshMedia(frame) {
    if (!videoPlans.length) return;
    var selected = new Map();
    for (var plan of videoPlans) {
      var owner = document;
      for (var id of plan.documentPath) {
        var child = owner.getElementById(id);
        if (!child) throw new Error('Playback nested document element is missing: ' + id);
        if (!child.hasAttribute('data-hypit-nested-active')) { owner = null; break; }
        owner = child.contentDocument;
        if (!owner) throw new Error('Playback active nested document is unavailable: ' + id);
      }
      if (!owner) continue;
      var element = owner.getElementById(plan.id);
      if (!element) throw new Error('Playback media element is missing: ' + plan.id);
      var previous = selected.get(element);
      if (!previous || (frame >= plan.startFrame && frame < plan.endFrame)) selected.set(element, plan);
    }
    for (const record of media) record.active = false;
    for (var entry of selected) {
      var element = entry[0], plan = entry[1];
      var record = media.find(function (item) { return item.element === element; });
      if (!record) {
        record = { element: element, url: element.getAttribute('data-hypit-src')
          || element.getAttribute('data-hypit-artifact-src') || element.getAttribute('src') };
        media.push(record);
      }
      record.active = true;
      record.startFrame = plan.startFrame;
      record.endFrame = plan.endFrame;
      record.timestamps = plan.timestamps;
    }
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
      preservesPitch: element.getAttribute('data-preserves-pitch') === 'true',
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
    if (element.error) return Promise.reject(new Error('Playback media could not be decoded: ' + (element.error.message || element.currentSrc || element.id)));
    if (element.currentTime === target && !element.seeking && element.readyState >= 2) return Promise.resolve();
    var request = { target: target };
    request.promise = new Promise(function (resolve, reject) {
      var done = function (error) {
        element.removeEventListener('seeked', completed);
        element.removeEventListener('error', failed);
        element.removeEventListener('emptied', emptied);
        element.removeEventListener('loadeddata', decoded);
        element.removeEventListener('loadedmetadata', seek);
        if (pendingSeeks.get(element) === request) pendingSeeks.delete(element);
        if (error !== undefined) reject(error); else resolve();
      };
      var completed = function () { done(); };
      var failed = function () { done(new Error('Playback media could not be decoded: ' + (element.error?.message || element.currentSrc || element.id))); };
      var emptied = function () { done(new Error('Playback media was emptied before decoding completed: ' + element.id)); };
      request.done = done;
      var decoded = function () {
        if (!element.seeking && element.readyState >= 2 && element.currentTime === target) done();
      };
      var seek = function () {
        try {
          if (element.currentTime !== target) element.currentTime = target;
          decoded();
        }
        catch (error) { done(error); }
      };
      pendingSeeks.set(element, request);
      element.addEventListener('seeked', completed, { once: true });
      element.addEventListener('error', failed, { once: true });
      element.addEventListener('emptied', emptied, { once: true });
      element.addEventListener('loadeddata', decoded);
      if (element.error) failed();
      else if (element.readyState === 0) element.addEventListener('loadedmetadata', seek, { once: true });
      else seek();
    });
    return request.promise;
  }

  function prepareMedia(record, nearby) {
    if (!record.url) return;
    if (nearby && !record.loaded) {
      record.preparationError = undefined;
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

  async function prepareImages(owner) {
    var waits = [];
    for (var image of owner.images || []) {
      if (!image.getAttribute('src')) continue;
      var visible = true;
      for (var element = image; element; element = element.parentElement) {
        if (owner.defaultView.getComputedStyle(element).display === 'none') { visible = false; break; }
      }
      if (visible) waits.push(image.decode());
    }
    for (var iframe of owner.querySelectorAll('iframe[data-hypit-nested-active]')) {
      if (iframe.contentDocument) waits.push(prepareImages(iframe.contentDocument));
    }
    await Promise.all(waits);
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
    return target;
  }

  async function apply(seconds, scrubbing) {
    currentSeconds = Math.max(0, seconds);
    var revision = ++seekRevision;
    var waits = [];
    var programFrame = Math.max(0, Math.round(currentSeconds * fps));
    await placeHTML(programFrame);
    if (revision !== seekRevision) return false;
    refreshMedia(programFrame);
    await prepareImages(document);
    if (revision !== seekRevision) return false;
    for (const record of media) {
      var inside = record.active !== false && programFrame >= record.startFrame && programFrame < record.endFrame;
      var element = record.element;
      prepareMedia(record, record.active !== false && programFrame >= record.startFrame - 2 * fps && programFrame < record.endFrame + fps);
      // Materialized picture Artifacts are deliberately silent. Program sound
      // comes from the exact AudioTrack below rather than from a video sidecar.
      element.muted = true;
      var target = inside ? sourceTarget(record, programFrame) : undefined;
      inside = inside && target !== undefined && target !== null;
      if (!inside) {
        element.style.display = 'none';
        element.pause();
        // An upcoming Clip waits decoded on its entry frame, so the cut shows
        // that frame at once instead of whatever the decoder last held.
        var entryTarget = programFrame < record.startFrame ? sourceTarget(record, record.startFrame) : undefined;
        if (record.loaded && entryTarget !== undefined && entryTarget !== null) seekDecoded(element, entryTarget).catch(function (error) { record.preparationError = error; });
        else cancelSeek(element);
        continue;
      }
      if (record.preparationError) throw record.preparationError;
      if (element.error) throw new Error('Playback media could not be decoded: ' + element.error.message);
      // Planned samples and holds remain on their selected decoded frame.
      if (scrubbing || record.timestamps || record.sourceRate[0] <= 0n
        || programFrame === record.endFrame - 1) {
        element.style.display = '';
        element.pause();
        waits.push(seekDecoded(element, target));
        continue;
      }
      // Legacy frame-rate records use the native decoder clock during playback.
      // Keep an entering clip hidden until its first frame is decoded.
      if (element.style.display === 'none' && !(element.readyState >= 2 && !element.seeking && !pendingSeeks.has(element))) {
        if (element.readyState > 0 && !pendingSeeks.has(element)) {
          element.pause();
          waits.push(seekDecoded(element, target));
        }
        continue;
      }
      element.style.display = '';
      cancelSeek(element);
      if (element.readyState === 0) continue;
      if (!element.seeking && Math.abs(element.currentTime - target) > 0.08) element.currentTime = target;
      element.playbackRate = Number(record.sourceRate[0]) / Number(record.sourceRate[1]) * fps * record.sourceFps[1] / record.sourceFps[0];
      if (element.paused) {
        var started = element.play();
        if (started) waits.push(started);
      }
    }
    for (var record of programAudio) {
      var local = currentSeconds - record.start;
      var inside = local >= 0 && local < record.duration;
      var element = record.element;
      element.preservesPitch = record.preservesPitch;
      prepareMedia(record, local >= -2 && local < record.duration + 1);
      element.muted = muted || scrubbing;
      if (!inside) { cancelSeek(element); element.pause(); continue; }
      if (element.error) throw new Error('Playback audio could not be decoded: ' + element.error.message);
      var interval = Math.max(0, record.mediaEnd - record.mediaStart);
      var advanced = local * record.rate;
      var target = record.mediaStart + advanced;
      if (record.loop && interval > 0) target = record.mediaStart + ((record.phase + advanced) % interval);
      if (target < record.mediaStart || target >= record.mediaEnd) {
        throw new Error('Playback audio sample lies outside its prepared source interval');
      }
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
          if (started) waits.push(started);
        }
      }
    }
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
  window.__hypitPlayFrame = async function (frame) {
    playing = true;
    if (programAudio.length && !audioContext) audioContext = new AudioContext();
    if (audioContext && audioContext.state === 'suspended') await audioContext.resume();
    return apply(frame / fps, false);
  };
  window.__hypitFrameReady = apply(0, true);
})();
</script>`;
}

export function injectHtmlPlayback(html: string, audio = "", program?: HtmlProgram): string {
  // Take ownership before the renderer activates deferred resources. Otherwise
  // every video in a long Program allocates a decoder before the first frame.
  html = html.replace(/(<video\b[^>]*?)\s(?:data-hypit-artifact-src|src)=/gu, '$1 preload="none" data-hypit-src=');
  const script = audio + shim(playbackVideoPlan(program)).replace("(function () {", `(function () {\n${audioEnvelopeGainAt.toString()}`);
  const at = html.lastIndexOf("</body>");
  return at < 0 ? html + script : html.slice(0, at) + script + html.slice(at);
}
