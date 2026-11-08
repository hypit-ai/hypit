/**
 * Browser-local helpers for painting one rounded union around laid-out inline rectangles.
 *
 * Components decide which elements participate and when. The terminal helper only measures factual
 * browser layout and traces the exterior; it owns no Caption, NLE or semantic identity.
 */
export const htmlLineUnionRuntime = String.raw`
const hypitLineUnionRectangles = (container, elements, paddingX, paddingY, borderWidth) => {
  const origin = container.getBoundingClientRect();
  const lines = new Map();
  for (const element of elements) {
    const range = document.createRange();
    range.selectNodeContents(element);
    for (const rect of range.getClientRects()) {
      if (rect.width <= 0 || rect.height <= 0) continue;
      const top = rect.top - origin.top;
      const key = Math.round(top * 100) / 100;
      const current = lines.get(key);
      const measured = {
        left: rect.left - origin.left,
        right: rect.right - origin.left,
        top,
        bottom: rect.bottom - origin.top,
      };
      if (current === undefined) lines.set(key, measured);
      else {
        current.left = Math.min(current.left, measured.left);
        current.right = Math.max(current.right, measured.right);
        current.top = Math.min(current.top, measured.top);
        current.bottom = Math.max(current.bottom, measured.bottom);
      }
    }
  }
  return [...lines.values()].map(rect => ({
    left: rect.left - paddingX - borderWidth / 2,
    right: rect.right + paddingX + borderWidth / 2,
    top: rect.top - paddingY - borderWidth / 2,
    bottom: rect.bottom + paddingY + borderWidth / 2,
  }));
};

const hypitLineUnionOutline = (rectangles, authoredRadius) => {
  if (rectangles.length === 0) return '';
  const xs = [...new Set(rectangles.flatMap(rect => [rect.left, rect.right]))].sort((left, right) => left - right);
  const ys = [...new Set(rectangles.flatMap(rect => [rect.top, rect.bottom]))].sort((left, right) => left - right);
  const cells = ys.slice(1).map((_, y) => xs.slice(1).map((_, x) => rectangles.some(rect =>
    rect.left <= xs[x] && rect.right >= xs[x + 1] && rect.top <= ys[y] && rect.bottom >= ys[y + 1])));
  const edges = new Map();
  const key = (x, y) => x + ',' + y;
  const add = (x, y, endX, endY) => {
    const id = key(x, y);
    const values = edges.get(id) || [];
    values.push([endX, endY]);
    edges.set(id, values);
  };
  for (let y = 0; y < cells.length; y += 1) for (let x = 0; x < cells[y].length; x += 1) {
    if (!cells[y][x]) continue;
    if (!cells[y - 1]?.[x]) add(x, y, x + 1, y);
    if (!cells[y]?.[x + 1]) add(x + 1, y, x + 1, y + 1);
    if (!cells[y + 1]?.[x]) add(x + 1, y + 1, x, y + 1);
    if (!cells[y]?.[x - 1]) add(x, y + 1, x, y);
  }
  const contours = [];
  while (edges.size > 0) {
    const start = edges.keys().next().value.split(',').map(Number);
    const points = [];
    let current = start;
    let previous;
    do {
      points.push([xs[current[0]], ys[current[1]]]);
      const id = key(...current);
      const next = edges.get(id);
      let index = 0;
      if (next.length > 1 && previous !== undefined) {
        const dx = current[0] - previous[0];
        const dy = current[1] - previous[1];
        index = next.findIndex(point => dx * (point[1] - current[1]) - dy * (point[0] - current[0]) > 0);
        if (index < 0) index = 0;
      }
      const target = next.splice(index, 1)[0];
      if (next.length === 0) edges.delete(id);
      previous = current;
      current = target;
    } while (current[0] !== start[0] || current[1] !== start[1]);
    const corners = points.filter((point, index) => {
      const before = points[(index + points.length - 1) % points.length];
      const after = points[(index + 1) % points.length];
      return (point[0] - before[0]) * (after[1] - point[1])
        !== (point[1] - before[1]) * (after[0] - point[0]);
    });
    const rounded = corners.map((point, index) => {
      const before = corners[(index + corners.length - 1) % corners.length];
      const after = corners[(index + 1) % corners.length];
      const beforeLength = Math.hypot(point[0] - before[0], point[1] - before[1]);
      const afterLength = Math.hypot(after[0] - point[0], after[1] - point[1]);
      const radius = Math.min(authoredRadius, beforeLength / 2, afterLength / 2);
      return {
        start: [point[0] + (before[0] - point[0]) * radius / beforeLength,
          point[1] + (before[1] - point[1]) * radius / beforeLength],
        end: [point[0] + (after[0] - point[0]) * radius / afterLength,
          point[1] + (after[1] - point[1]) * radius / afterLength],
        radius,
        turn: (point[0] - before[0]) * (after[1] - point[1])
          - (point[1] - before[1]) * (after[0] - point[0]),
      };
    });
    contours.push(rounded.map((corner, index) => (index === 0 ? 'M' : 'L') + corner.start.join(' ')
      + (corner.radius > 0 ? 'A' + corner.radius + ' ' + corner.radius + ' 0 0 '
        + (corner.turn > 0 ? 1 : 0) + ' ' + corner.end.join(' ') : '')).join(' ') + 'Z');
  }
  return contours.join(' ');
};

const hypitPaintLineUnion = (path, container, elements, treatment) => {
  path.setAttribute('fill', treatment.background);
  path.setAttribute('stroke', treatment.borderColor);
  path.setAttribute('stroke-width', String(treatment.borderWidth));
  path.setAttribute('d', hypitLineUnionOutline(hypitLineUnionRectangles(
    container,
    elements,
    treatment.paddingX,
    treatment.paddingY,
    treatment.borderWidth,
  ), treatment.borderRadius));
};
`;
