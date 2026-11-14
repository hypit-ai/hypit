/**
 * Browser-local execution for the Fine Caption component.
 *
 * Caption owns cue/unit semantics and visual behavior. The HTML terminal still owns only text
 * shaping, ordered Paint and line-union primitives. All static timing, grapheme and box geometry is
 * prepared once; the returned evaluator only projects one requested frame into DOM state.
 */
export const captionFineHtmlRuntime = String.raw`
const layout = root.querySelector('[data-caption-layout]');
const cue = root.querySelector('[data-caption-cue]');
const cueUnion = root.querySelector('[data-caption-cue-union] path');
const activeUnion = root.querySelector('[data-caption-active-union] path');
const baseLayer = root.querySelector('[data-caption-text-layer="base"]');
const activeLayer = root.querySelector('[data-caption-text-layer="active"]');
const underlineLayer = root.querySelector('[data-caption-text-layer="active-underline"]');
if (layout === null || cue === null || cueUnion === null || activeUnion === null || baseLayer === null) {
  throw new Error('Fine Caption HTML structure is incomplete.');
}

const unitMap = layer => new Map([...layer.querySelectorAll('[data-hypit-text-kind="group"]')]
  .map(element => [element.getAttribute('data-hypit-text-node'), element]));
const wordMap = layer => new Map([...layer.querySelectorAll('[data-hypit-text-kind="text"]')]
  .map(element => [element.getAttribute('data-hypit-text-node'), element]));
const baseUnits = unitMap(baseLayer);
const activeUnits = activeLayer === null ? new Map() : unitMap(activeLayer);
const underlineUnits = underlineLayer === null ? new Map() : unitMap(underlineLayer);
const baseWords = wordMap(baseLayer);
const activeWords = activeLayer === null ? new Map() : wordMap(activeLayer);
const underlineWords = underlineLayer === null ? new Map() : wordMap(underlineLayer);
const authoredWords = new Map(data.caption.words.map(word => [word.id, word]));
const visibleBaseWords = data.caption.words.map(word => baseWords.get(word.id)).filter(Boolean);
const seconds = value => Number(value.ticks) * value.timeBase.numerator / value.timeBase.denominator;
const fps = context.frameRate.numerator / context.frameRate.denominator;
const clamp = value => Math.max(0, Math.min(1, value));

const styleCache = new WeakMap();
const setStyle = (element, name, value) => {
  let values = styleCache.get(element);
  if (values === undefined) { values = new Map(); styleCache.set(element, values); }
  if (values.get(name) === value) return;
  values.set(name, value);
  element.style[name] = value;
};
const setAttribute = (element, name, value) => {
  const previous = element.getAttribute(name);
  if (previous !== value) element.setAttribute(name, value);
};

const translucent = (color, opacity) => {
  const red = Number.parseInt(color.slice(1, 3), 16);
  const green = Number.parseInt(color.slice(3, 5), 16);
  const blue = Number.parseInt(color.slice(5, 7), 16);
  const authored = color.length === 9 ? Number.parseInt(color.slice(7, 9), 16) / 255 : 1;
  return 'rgba(' + red + ',' + green + ',' + blue + ',' + (authored * opacity) + ')';
};
const boxFilter = shadow => {
  if (shadow.opacity <= 0) return '';
  const positions = shadow.spread <= 0 ? [[shadow.offsetX, shadow.offsetY]]
    : Array.from({ length: 12 }, (_, index) => {
      const angle = index * Math.PI / 6;
      return [shadow.offsetX + Math.cos(angle) * shadow.spread,
        shadow.offsetY + Math.sin(angle) * shadow.spread];
    });
  const selected = translucent(shadow.color, shadow.opacity);
  return positions.map(position => 'drop-shadow(' + position[0] + 'px ' + position[1]
    + 'px ' + shadow.blur + 'px ' + selected + ')').join(' ');
};
setStyle(cueUnion.closest('svg'), 'filter', boxFilter(data.cueBox.shadow));
setStyle(activeUnion.closest('svg'), 'filter', boxFilter(data.activeBox.shadow));

const isolatedBoxes = new Map([...baseUnits].map(([id, element]) => {
  const layer = document.createElement('span');
  layer.setAttribute('data-caption-active-box', 'isolated');
  layer.style.position = 'absolute';
  layer.style.pointerEvents = 'none';
  layer.style.transformOrigin = 'center';
  layer.style.zIndex = '-1';
  element.style.position = 'relative';
  element.style.isolation = 'isolate';
  element.prepend(layer);
  return [id, layer];
}));

const segmenter = data.atom.reveal === 'typewriter'
  ? new Intl.Segmenter('und', { granularity: 'grapheme' }) : undefined;
const graphemesByWord = new Map();
const prepareGraphemes = (wordId, elements) => {
  if (segmenter === undefined) return [];
  const authored = authoredWords.get(wordId);
  if (authored === undefined) return [];
  const graphemes = [...segmenter.segment(authored.text)].map(part => part.segment);
  const columns = graphemes.map(() => []);
  for (const element of elements.filter(Boolean)) {
    const paints = [...element.children].filter(child => child.hasAttribute('data-hypit-text-paint'));
    for (const paint of paints) {
      paint.textContent = '';
      for (const [index, text] of graphemes.entries()) {
        const span = document.createElement('span');
        span.textContent = text;
        span.style.visibility = 'hidden';
        paint.append(span);
        columns[index].push(span);
      }
    }
  }
  return columns;
};
if (segmenter !== undefined) for (const word of data.caption.words) {
  graphemesByWord.set(word.id, prepareGraphemes(word.id,
    [baseWords.get(word.id), activeWords.get(word.id), underlineWords.get(word.id)]));
}

const records = data.caption.units.map((unit, index) => {
  const next = data.caption.units[index + 1];
  // Preserve the original Fine-caption sampling rule: a spoken unit owns every
  // output frame touched by its exact time range. Starting on the containing
  // frame and ending after the last touched frame also gives every response
  // animation a stable integer-frame phase instead of entering partway through.
  const startFrame = Math.max(0, Math.floor(seconds(unit.start) * fps));
  const endFrame = Math.max(startFrame + 1, Math.ceil(seconds(unit.end) * fps));
  const nextStartFrame = next === undefined
    ? undefined : Math.max(0, Math.floor(seconds(next.start) * fps));
  const activationEndFrame = next === undefined ? endFrame
    : Math.min(endFrame, nextStartFrame);
  const graphemes = unit.wordIds.flatMap(wordId => graphemesByWord.get(wordId) || []);
  return {
    unit,
    startFrame,
    endFrame,
    activationEndFrame,
    base: baseUnits.get(unit.id),
    active: activeUnits.get(unit.id),
    underline: underlineUnits.get(unit.id),
    words: unit.wordIds.map(wordId => baseWords.get(wordId)).filter(Boolean),
    graphemes,
    revealed: -1,
    currentPath: '',
    trailPath: '',
  };
});
if (records.some(record => record.base === undefined
  || data.karaoke.mode !== 'off' && record.active === undefined)) {
  throw new Error('Fine Caption unit layers are incomplete.');
}

const pathFor = (elements, treatment) => hypitLineUnionOutline(hypitLineUnionRectangles(
  cue, elements, treatment.paddingX, treatment.paddingY, treatment.borderWidth,
), treatment.borderRadius);
const prepareLayout = () => {
  layout.style.transform = '';
  layout.style.transformOrigin = 'center';
  if (data.layout.overflow === 'shrink') {
    const frame = root.querySelector('[data-hypit-caption-fine]');
    if (frame === null) throw new Error('Fine Caption layout frame is missing.');
    const scale = Math.max(data.layout.minimumScale,
      Math.min(1, frame.clientWidth / Math.max(1, layout.scrollWidth),
        frame.clientHeight / Math.max(1, layout.scrollHeight)));
    layout.dataset.captionScale = String(scale);
  }
  if (data.cueBox.continuity === 'joined') {
    setAttribute(cueUnion, 'fill', data.cueBox.background);
    setAttribute(cueUnion, 'stroke', data.cueBox.borderColor);
    setAttribute(cueUnion, 'stroke-width', String(data.cueBox.borderWidth));
    setAttribute(cueUnion, 'd', pathFor(visibleBaseWords, data.cueBox));
  } else setAttribute(cueUnion, 'd', '');
  setAttribute(activeUnion, 'fill', data.activeBox.background);
  setAttribute(activeUnion, 'stroke', data.activeBox.borderColor);
  setAttribute(activeUnion, 'stroke-width', String(data.activeBox.borderWidth));
  const trailWords = [];
  for (const record of records) {
    record.currentPath = pathFor(record.words, data.activeBox);
    trailWords.push(...record.words);
    record.trailPath = pathFor(trailWords, data.activeBox);
  }
  const scale = layout.dataset.captionScale;
  if (scale !== undefined) layout.style.transform = 'scale(' + scale + ')';
};
prepareLayout();

const easeOut = value => 1 - Math.pow(1 - value, 3);
const easeOutBack = value => {
  const c1 = 1.3, c3 = c1 + 1;
  return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
};
const easeOutBounce = value => {
  let x = value; const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
};
const easeOutElastic = value => value === 0 || value === 1 ? value
  : Math.pow(2, -10 * value) * Math.sin((value * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
const neutral = { opacity: 1, transform: '', filter: '', clipPath: '' };
const oneShot = (kind, progress, startScale) => {
  const value = clamp(progress), eased = easeOut(value), distance = data.slideDistance;
  const state = (opacity, transform, filter, clipPath) => ({
    opacity, transform: transform || '', filter: filter || '', clipPath: clipPath || '',
  });
  const scale = (fallback, position) => {
    const from = startScale === undefined ? fallback : startScale;
    return 'scale(' + (from + (1 - from) * position) + ')';
  };
  const optionalScale = position => startScale === undefined ? '' : ' ' + scale(1, position);
  if (kind === 'none') return neutral;
  if (kind === 'fade') return state(eased, optionalScale(eased));
  if (kind === 'blur-in') return state(eased, scale(0.96, eased), 'blur(' + ((1 - eased) * 16) + 'px');
  if (kind === 'pop') return state(eased, scale(0.6, easeOutBack(value)));
  if (kind === 'scale') return state(eased, scale(0.2, eased));
  if (kind === 'spring') return state(eased, scale(0.72,
    value >= 1 ? 1 : 1 - Math.exp(-5 * value) * Math.cos(10 * value)));
  if (kind === 'bounce') return state(eased, scale(0, easeOutBounce(value)));
  if (kind === 'elastic') return state(eased, scale(0, easeOutElastic(value)));
  if (kind === 'stamp') return state(eased, scale(1.35, easeOutBack(value)));
  if (kind === 'tilt') return state(eased,
    'rotate(' + ((1 - eased) * -8) + 'deg) ' + scale(0.94, eased));
  if (kind === 'zoom-blur') return state(eased, scale(1.18, eased),
    'blur(' + ((1 - eased) * 18) + 'px)');
  if (kind === 'flip-x') return state(eased,
    'perspective(600px) rotateX(' + ((1 - eased) * 88) + 'deg) ' + scale(0.92, eased));
  if (kind === 'flip-y') return state(eased,
    'perspective(600px) rotateY(' + ((1 - eased) * -88) + 'deg) ' + scale(0.92, eased));
  if (kind === 'spin') return state(eased,
    'rotate(' + ((1 - eased) * -180) + 'deg) ' + scale(0.55, eased));
  if (kind === 'squash') return state(eased,
    'scaleX(' + (1.28 - 0.28 * easeOutBack(value)) + ') scaleY('
      + (0.48 + 0.52 * easeOutBack(value)) + ')' + optionalScale(eased));
  if (kind === 'stretch') return state(eased,
    'scaleX(' + (0.5 + 0.5 * easeOutBack(value)) + ') scaleY('
      + (1.35 - 0.35 * easeOutBack(value)) + ')' + optionalScale(eased));
  const hidden = (1 - eased) * 100;
  if (kind === 'wipe-left') return state(1, optionalScale(eased), '', 'inset(0 0 0 ' + hidden + '%)');
  if (kind === 'wipe-right') return state(1, optionalScale(eased), '', 'inset(0 ' + hidden + '% 0 0)');
  if (kind === 'wipe-up') return state(1, optionalScale(eased), '', 'inset(0 0 ' + hidden + '% 0)');
  if (kind === 'wipe-down') return state(1, optionalScale(eased), '', 'inset(' + hidden + '% 0 0 0)');
  const remaining = (1 - value) * distance;
  if (kind === 'slide-left') return state(eased, 'translateX(' + -remaining + 'px)' + optionalScale(eased));
  if (kind === 'slide-right') return state(eased, 'translateX(' + remaining + 'px)' + optionalScale(eased));
  if (kind === 'slide-up') return state(eased, 'translateY(' + -remaining + 'px)' + optionalScale(eased));
  return state(eased, 'translateY(' + remaining + 'px)' + optionalScale(eased));
};
const cueEntrance = progress => {
  const authored = oneShot(data.entry.kind, progress, data.entry.startScale);
  if (data.entry.kind !== 'spring') return authored;
  const value = clamp(progress), start = data.entry.startScale ?? 0.72;
  const scale = value <= 0.5 ? start + (1.05 - start) * value / 0.5
    : value <= 0.75 ? 1.05 + (0.95 - 1.05) * (value - 0.5) / 0.25
      : 0.95 + (1 - 0.95) * (value - 0.75) / 0.25;
  return { ...authored, opacity: 1, transform: 'scale(' + scale + ')' };
};
const applyMotion = (element, states) => {
  if (element === undefined) return;
  setStyle(element, 'opacity', String(states.reduce((amount, state) => amount * state.opacity, 1)));
  setStyle(element, 'transform', states.map(state => state.transform).filter(Boolean).join(' '));
  setStyle(element, 'filter', states.map(state => state.filter).filter(Boolean).join(' '));
  const clipped = [...states].reverse().find(state => state.clipPath);
  setStyle(element, 'clipPath', clipped?.clipPath || '');
  setStyle(element, 'transformOrigin', 'center');
};

const loopAt = (localFrame, startFrame, activePaint) => {
  if (data.loop.kind === 'none') return neutral;
  const phase = 2 * Math.PI * ((localFrame - startFrame) % data.loop.periodFrames) / data.loop.periodFrames;
  const wave = Math.sin(phase), intensity = data.loop.intensity;
  if (data.loop.kind === 'shake') return { ...neutral,
    transform: 'translateX(' + (Math.sin(phase * 2) * 3 * intensity) + 'px)' };
  if (data.loop.kind === 'wobble') return { ...neutral,
    transform: 'rotate(' + (wave * 2.5 * intensity) + 'deg)' };
  if (data.loop.kind === 'breathe') return { ...neutral,
    transform: 'scale(' + (1 + wave * 0.035 * intensity) + ')' };
  if (data.loop.kind === 'float') return { ...neutral,
    transform: 'translateY(' + (wave * 3.2 * intensity) + 'px)' };
  if (data.loop.kind === 'pulse') return { ...neutral,
    transform: 'scale(' + (1 + (wave + 1) * 0.0375 * intensity) + ')' };
  if (data.loop.kind === 'flicker') return { ...neutral,
    opacity: Math.max(0.15, Math.min(1, 1 - (Math.sin(phase * 5) + 1) * 0.11 * intensity)) };
  const strength = (0.35 + 0.65 * (wave + 1) / 2) * intensity;
  const paint = activePaint ? data.loopPaint.active : data.loopPaint.base;
  const selected = paint.glow.opacity > 0 ? paint.glow : { color: paint.fill, opacity: 0.65, blur: 8 };
  return { ...neutral, filter: 'drop-shadow(0 0 ' + (selected.blur * strength) + 'px '
    + translucent(selected.color, selected.opacity) + ')' };
};

const activeBoxAt = (localFrame, startFrame, endFrame) => {
  const logicalEnd = data.activeBox.mode === 'trail' ? context.durationFrames : endFrame;
  if (data.activeBox.mode === 'off' || localFrame < startFrame || localFrame >= logicalEnd) {
    return { active: false, motion: { ...neutral, opacity: 0, transform: 'scale(0.82)' } };
  }
  const duration = Math.max(0, logicalEnd - startFrame);
  const enterFrames = data.activeBox.enter === 'none' ? 0 : Math.min(data.activeBox.transitionFrames, duration);
  const exitFrames = data.activeBox.exit === 'none' ? 0 : Math.min(data.activeBox.transitionFrames, duration);
  const sinceStart = localFrame - startFrame, untilEnd = logicalEnd - localFrame;
  if (enterFrames > 0 && sinceStart < enterFrames) {
    return { active: true, motion: oneShot(data.activeBox.enter, sinceStart / enterFrames) };
  }
  if (exitFrames > 0 && untilEnd <= exitFrames) {
    return { active: true, motion: oneShot(data.activeBox.exit, untilEnd / exitFrames) };
  }
  return { active: true, motion: neutral };
};
const paintBox = (record, box) => {
  const layer = isolatedBoxes.get(record.unit.id);
  if (layer === undefined) return;
  if (data.activeBox.continuity === 'joined') {
    setStyle(layer, 'display', 'none'); return;
  }
  // Keep every isolated box resident, as the original Fine renderer did. Word
  // handoff changes only opacity/transform and never rebuilds a paint layer.
  setStyle(layer, 'display', 'block');
  setStyle(layer, 'inset', (-data.activeBox.paddingY) + 'px ' + (-data.activeBox.paddingX) + 'px');
  setStyle(layer, 'background', data.activeBox.background);
  setStyle(layer, 'border', data.activeBox.borderWidth + 'px solid ' + data.activeBox.borderColor);
  setStyle(layer, 'borderRadius', data.activeBox.borderRadius + 'px');
  setStyle(layer, 'boxShadow', data.activeBox.shadow.opacity <= 0 ? 'none'
    : data.activeBox.shadow.offsetX + 'px ' + data.activeBox.shadow.offsetY + 'px '
      + data.activeBox.shadow.blur + 'px ' + data.activeBox.shadow.spread + 'px '
      + translucent(data.activeBox.shadow.color, data.activeBox.shadow.opacity));
  applyMotion(layer, [box.motion]);
};

const atomLifecycleAt = (record, localFrame) => {
  const duration = Math.max(0, record.endFrame - record.startFrame);
  const enterFrames = data.atom.enter === 'none' ? 0 : Math.min(data.atom.enterFrames, duration);
  const exitFrames = data.atom.exit === 'none' ? 0
    : Math.min(data.atom.exitFrames, Math.max(0, duration - enterFrames));
  const sinceStart = localFrame - record.startFrame;
  const untilEnd = record.endFrame - localFrame;
  const waits = data.atom.reveal === 'on-start' || data.atom.enter !== 'none';
  if (sinceStart < 0) return waits ? { ...neutral, opacity: 0 } : neutral;
  if (untilEnd <= 0 && data.atom.exit !== 'none') return oneShot(data.atom.exit, 0);
  if (enterFrames > 0 && sinceStart < enterFrames) return oneShot(data.atom.enter, sinceStart / enterFrames);
  if (exitFrames > 0 && untilEnd < exitFrames) return oneShot(data.atom.exit, untilEnd / exitFrames);
  return neutral;
};
const activeResponseAt = (record, localFrame) => {
  if (data.activeResponse.kind === 'none' || localFrame < record.startFrame
    || localFrame >= record.activationEndFrame) return neutral;
  if (data.activeResponse.kind === 'scale') {
    return { ...neutral, transform: 'scale(' + data.activeResponse.scale + ')' };
  }
  const frames = Math.min(data.activeResponse.frames,
    Math.max(1, record.activationEndFrame - record.startFrame));
  const sinceStart = localFrame - record.startFrame;
  if (frames <= 0 || sinceStart > frames) return neutral;
  const progress = clamp(sinceStart / frames);
  if (data.activeResponse.kind === 'pop' || data.activeResponse.kind === 'spring') {
    const amplitude = data.activeResponse.scale - 1;
    const scale = data.activeResponse.kind === 'pop'
      ? 1 + amplitude * Math.sin(Math.PI * progress)
      : 1 + amplitude * Math.exp(-4 * progress) * Math.sin(12 * progress);
    return { ...neutral, transform: 'scale(' + scale + ')' };
  }
  return oneShot(data.activeResponse.kind, progress);
};
const activationAt = (record, localFrame, mode, wipe) => {
  if (mode === 'off') return { ...neutral, opacity: 0 };
  const endFrame = mode === 'current' ? record.activationEndFrame : record.endFrame;
  const active = mode === 'trail' ? localFrame >= record.startFrame
    : localFrame >= record.startFrame && localFrame < endFrame;
  if (!active) return { ...neutral, opacity: 0 };
  if (!wipe || (mode === 'current' && endFrame - record.startFrame <= 1)) return neutral;
  const revealEnd = mode === 'current' ? endFrame - 1 : endFrame;
  const progress = localFrame > revealEnd && mode === 'trail' ? 1
    : revealEnd === record.startFrame ? 1
      : clamp((localFrame - record.startFrame) / (revealEnd - record.startFrame));
  const hidden = (1 - progress) * 100;
  return { ...neutral, clipPath: data.direction === 'rtl'
    ? 'inset(0 0 0 ' + hidden + '%)' : 'inset(0 ' + hidden + '% 0 0)' };
};
const revealGraphemes = (record, localFrame) => {
  if (record.graphemes.length === 0) return;
  const duration = Math.max(1, record.endFrame - record.startFrame);
  let count = 0;
  while (count < record.graphemes.length
    && localFrame >= record.startFrame + Math.floor(duration * count / record.graphemes.length)) count += 1;
  if (count === record.revealed) return;
  for (const [index, elements] of record.graphemes.entries()) {
    const visibility = index < count ? 'visible' : 'hidden';
    for (const element of elements) setStyle(element, 'visibility', visibility);
  }
  record.revealed = count;
};

let activePath = '';
return localFrame => {
  const duration = context.durationFrames;
  const enterFrames = data.entry.kind === 'none' ? 0 : Math.min(data.entry.frames, Math.floor(duration / 2));
  const exitFrames = data.exit.kind === 'none' ? 0 : Math.min(data.exit.frames, Math.floor(duration / 2));
  const entryProgress = enterFrames <= 0 ? 1 : clamp(localFrame / enterFrames);
  const exitProgress = exitFrames <= 0 ? 1 : clamp((duration - localFrame) / exitFrames);
  const cueLifecycle = entryProgress < 1 ? cueEntrance(entryProgress)
    : exitProgress < 1 ? oneShot(data.exit.kind, exitProgress) : neutral;
  applyMotion(cue, [cueLifecycle, data.loop.target === 'cue' ? loopAt(localFrame, 0, false) : neutral]);

  let selectedPath = '';
  let selectedBoxMotion = neutral;
  for (const record of records) {
    const current = localFrame >= record.startFrame && localFrame < record.activationEndFrame;
    const lifecycle = atomLifecycleAt(record, localFrame);
    const response = activeResponseAt(record, localFrame);
    const atomLoop = data.loop.target === 'active-atom' && current
      ? loopAt(localFrame, record.startFrame, true) : neutral;
    const karaoke = activationAt(record, localFrame, data.karaoke.mode,
      data.karaoke.transition === 'wipe');
    const underline = activationAt(record, localFrame, data.activeUnderline.mode, false);
    applyMotion(record.base, [lifecycle, response, atomLoop]);
    applyMotion(record.active, [lifecycle, response, atomLoop, karaoke]);
    applyMotion(record.underline, [lifecycle, response, atomLoop, underline]);
    revealGraphemes(record, localFrame);

    const box = activeBoxAt(localFrame, record.startFrame,
      data.activeBox.mode === 'current' ? record.activationEndFrame : record.endFrame);
    paintBox(record, box);
    if (data.activeBox.continuity === 'joined' && box.active) {
      selectedPath = data.activeBox.mode === 'trail' ? record.trailPath : record.currentPath;
      selectedBoxMotion = box.motion;
    }
  }
  if (data.activeBox.continuity !== 'joined' || data.activeBox.mode === 'off') selectedPath = '';
  if (selectedPath !== activePath) { setAttribute(activeUnion, 'd', selectedPath); activePath = selectedPath; }
  applyMotion(activeUnion.closest('svg'), [selectedBoxMotion]);
};
`;
