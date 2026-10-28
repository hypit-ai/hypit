/** Page-private Present visibility. The shared index owns only interval lookup. */
export function presentationVisibilityScript(): string {
  return `(() => {
    const entries = [...document.querySelectorAll('[data-hypit-visibility]')].map((element, order) => ({
      element,
      order,
      spans: JSON.parse(element.dataset.hypitVisibility),
    }));
    const workIndex = htmlCreateFrameWorkIndex(entries.flatMap(entry => entry.spans
      .filter(span => htmlSelectionOverlaps(span.startFrame, span.endFrameExclusive)).map(span => ({
      startFrame: span.startFrame,
      endFrameExclusive: span.endFrameExclusive,
      order: entry.order,
      payload: entry.element,
    }))));
    let visible = new Set();
    for (const entry of entries) entry.element.style.opacity = '0';
    const apply = frame => {
      const next = new Set(workIndex.at(frame).map(work => work.payload));
      // A presentation mask controls painting, not layout or animation existence.
      // Only roots whose absolute visibility changed need a DOM write.
      for (const element of visible) if (!next.has(element)) element.style.opacity = '0';
      for (const element of next) if (!visible.has(element)) element.style.opacity = '';
      visible = next;
    };
    apply(0);
    window.addEventListener('hypit-frame', event => apply(event.detail?.frame));
  })();`;
}
