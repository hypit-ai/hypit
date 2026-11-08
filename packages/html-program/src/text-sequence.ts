/** Browser-local interpolation for package-authored text-unit animation. */
export const htmlTextSequenceRuntime = `
const hypitTextSequenceEase = (kind, value) => kind === 'ease-in' ? value * value * value
  : kind === 'ease-out' ? 1 - Math.pow(1 - value, 3)
  : kind === 'ease-in-out' ? value < 0.5 ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2 : value;
const hypitTextSequenceState = (sequence, progress) => {
  const frames = sequence.keyframes;
  if (progress <= frames[0].atProgress) return frames[0].state;
  if (progress >= frames[frames.length - 1].atProgress) return frames[frames.length - 1].state;
  let right = frames[1], left = frames[0];
  for (let index = 1; index < frames.length; index += 1) {
    right = frames[index]; left = frames[index - 1];
    if (progress <= right.atProgress) break;
  }
  const span = right.atProgress - left.atProgress;
  const amount = hypitTextSequenceEase(right.easing || 'linear',
    span <= 0 ? 1 : (progress - left.atProgress) / span);
  const value = name => left.state[name] + (right.state[name] - left.state[name]) * amount;
  return {
    opacity: value('opacity'), translateX: value('translateX'), translateY: value('translateY'),
    scale: value('scale'), rotate: value('rotate'), skewX: value('skewX'), skewY: value('skewY'),
    blur: value('blur'), clipTop: value('clipTop'), clipRight: value('clipRight'),
    clipBottom: value('clipBottom'), clipLeft: value('clipLeft'),
  };
};
const hypitApplyTextSequences = (localFrame, sequences, elements) => {
  for (const sequence of sequences) {
    for (const [index, target] of sequence.targets.entries()) {
      const order = sequence.order === 'reverse' ? sequence.targets.length - 1 - index : index;
      const relative = localFrame - sequence.startFrame - order * sequence.staggerFrames;
      const total = sequence.durationFrames * sequence.cycles;
      let progress;
      if (relative <= 0) progress = 0;
      else if (relative >= total) progress = 1;
      else progress = (relative % sequence.durationFrames) / sequence.durationFrames;
      const state = hypitTextSequenceState(sequence, progress);
      for (const id of target) {
        const element = elements.get(id);
        element.style.opacity = String(state.opacity);
        element.style.filter = state.blur === 0 ? '' : 'blur(' + state.blur + 'px)';
        element.style.clipPath = state.clipTop === 0 && state.clipRight === 0
          && state.clipBottom === 0 && state.clipLeft === 0 ? ''
          : 'inset(' + state.clipTop + '% ' + state.clipRight + '% '
            + state.clipBottom + '% ' + state.clipLeft + '%)';
        element.style.setProperty('--hypit-text-sequence-transform',
          'translate(' + state.translateX + 'px,' + state.translateY + 'px) scale(' + state.scale
            + ') rotate(' + state.rotate + 'deg) skew(' + state.skewX + 'deg,' + state.skewY + 'deg)');
        element.style.transform = 'var(--hypit-text-path-transform,) var(--hypit-text-sequence-transform,)';
        element.style.transformOrigin = 'center';
      }
    }
  }
};`;
