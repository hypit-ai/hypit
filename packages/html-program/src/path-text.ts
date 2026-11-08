/**
 * Browser-local rich-text path layout. The helper knows only DOM geometry: callers own the text
 * document, component meaning and authored path parameters.
 */
export const htmlPathTextRuntime = `
const hypitLayoutTextOnPath = (path, elements, options) => {
  const length = path.getTotalLength();
  const start = Math.max(0, options.startMarginPx);
  const end = Math.max(start, length - Math.max(0, options.endMarginPx));
  const metrics = elements.map(element => {
    element.style.transform = 'none';
    element.style.visibility = 'visible';
    const bounds = element.getBoundingClientRect();
    return { element, width: bounds.width, height: bounds.height };
  });
  const contentLength = metrics.reduce((amount, metric) => amount + metric.width, 0);
  const available = Math.max(0, end - start);
  const alignOffset = options.align === 'center' ? (available - contentLength) / 2
    : options.align === 'end' ? available - contentLength : 0;
  let cursor = start + alignOffset;
  for (const metric of metrics) {
    const logicalStart = cursor;
    const logicalEnd = cursor + metric.width;
    const logicalCenter = (logicalStart + logicalEnd) / 2;
    cursor = logicalEnd;
    const outside = logicalEnd < start || logicalStart > end;
    metric.element.style.visibility = options.overflow === 'clip' && outside ? 'hidden' : 'visible';
    const distance = Math.max(0, Math.min(length,
      options.reverse ? length - logicalCenter : logicalCenter));
    const delta = options.reverse ? -0.5 : 0.5;
    const before = path.getPointAtLength(Math.max(0, Math.min(length, distance - delta)));
    const after = path.getPointAtLength(Math.max(0, Math.min(length, distance + delta)));
    const angle = Math.atan2(after.y - before.y, after.x - before.x);
    const point = path.getPointAtLength(distance);
    const side = options.side === 'left' ? 1 : -1;
    const normalX = Math.sin(angle) * side;
    const normalY = -Math.cos(angle) * side;
    const offset = metric.height / 2;
    const x = point.x - metric.width / 2 + normalX * offset;
    const y = point.y - metric.height / 2 + normalY * offset;
    const rotation = options.orientation === 'follow' ? angle * 180 / Math.PI : 0;
    metric.element.style.transformOrigin = 'center';
    metric.element.style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + rotation + 'deg)';
  }
};`;
