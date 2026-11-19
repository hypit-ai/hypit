/** Place a new card near the requested point, keeping a margin around existing cards. */
export const cardSize = { width: 236, height: 154 };
type Box = { x: number; y: number; width: number; height: number };
type Size = { width: number; height: number };
type Step = { x: number; y: number };

const all: Step[] = [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 }];

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const pad = (boxes: Box[], margin: number) => boxes.map(box => ({ x: box.x - margin, y: box.y - margin, width: box.width + 2 * margin, height: box.height + 2 * margin }));
const shift = (box: Box, dx: number, dy: number) => ({ ...box, x: box.x + dx, y: box.y + dy });

/** Steps along `step` until clear, jumping each time just past the farthest obstacle in the way. */
function directional(box: Box, obstacles: Box[], step: Step, attempts: number) {
  let current = box, count = 0;
  for (let attempt = 0; attempt <= attempts; attempt++) {
    const hits = obstacles.filter(obstacle => overlaps(current, obstacle));
    if (!hits.length) return { dx: step.x * count, dy: step.y * count, count };
    if (attempt === attempts) break;
    count += Math.max(...hits.map(obstacle => {
      const along = (span: number, value: number) => value > 0 ? Math.ceil(span / value) : Infinity;
      const x = step.x > 0 ? along(obstacle.x + obstacle.width - current.x, step.x) : step.x < 0 ? along(current.x + current.width - obstacle.x, -step.x) : Infinity;
      const y = step.y > 0 ? along(obstacle.y + obstacle.height - current.y, step.y) : step.y < 0 ? along(current.y + current.height - obstacle.y, -step.y) : Infinity;
      return Math.max(1, Math.min(x, y));
    }));
    current = shift(box, step.x * count, step.y * count);
  }
  return undefined;
}

function nearestFree(box: Box, obstacles: Box[], directions: Step[], size = 24, attempts = 200) {
  if (!obstacles.some(obstacle => overlaps(box, obstacle))) return box;
  const each = Math.floor(attempts / directions.length), extra = attempts % directions.length;
  let best: { dx: number; dy: number; count: number } | undefined;
  directions.forEach((direction, index) => {
    const budget = each + (index < extra ? 1 : 0);
    if (!budget || best?.count === 1) return;
    const found = directional(box, obstacles, { x: direction.x * size, y: direction.y * size }, budget);
    if (found && (!best || found.count < best.count)) best = found;
  });
  return best ? shift(box, best.dx, best.dy) : box;
}

export function placeAround(centre: { x: number; y: number }, size: Size, obstacles: Box[]) {
  return nearestFree({ x: centre.x - size.width / 2, y: centre.y - size.height / 2, ...size }, pad(obstacles, 12), all);
}
