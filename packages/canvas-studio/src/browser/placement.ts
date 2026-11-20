/**
 * Where new nodes go so they do not cover existing ones. Each rule starts from a preferred spot and, when that
 * overlaps something, steps away from it:
 * - `placeAround` (the left rail): centred on a point; tries eight directions in 24px steps (200 steps in all)
 *   and keeps the spot reached in the fewest steps. Other nodes count with a 12px margin.
 * - `placeRightOf` (a node made from another's output): 80px right of the source, top-aligned, then as above.
 * - `placeLeftOf` (a node made for another's input): 80px left of the target, centred on it, stepping up, down
 *   or left; other nodes count with an 80px margin.
 * - `placeRightward` (a node dropped at the end of a connection from an output): moves right past whatever it
 *   covers, keeping 80px from it. `placeFrom` with `before` does the same for one feeding an input, stepping as
 *   `placeLeftOf` does.
 * - `pasteOffset`: copies land 20px down and right, then 40px further for each edge they share with a node they cover.
 */
export type Box = { x: number; y: number; width: number; height: number };
type Size = { width: number; height: number };
type Step = { x: number; y: number };

const all: Step[] = [{ x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: -1, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 }, { x: 0, y: -1 }, { x: 1, y: -1 }];
const beforeTarget: Step[] = [{ x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: -1, y: -1 }, { x: -1, y: 1 }];

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

/** A box already positioned (a drop point), moved to the nearest free spot; `before` keeps it left of its target. */
export function placeFrom(box: Box, obstacles: Box[], before = false) {
  return before ? nearestFree(box, pad(obstacles, 80), beforeTarget) : nearestFree(box, pad(obstacles, 12), all);
}

export function placeRightOf(source: Box, size: Size, obstacles: Box[]) {
  return nearestFree({ x: source.x + source.width + 80, y: source.y, ...size }, pad(obstacles, 12), all);
}

export function placeLeftOf(target: Box, size: Size, obstacles: Box[]) {
  return nearestFree({ x: target.x - 80 - size.width, y: target.y + (target.height - size.height) / 2, ...size }, pad(obstacles, 80), beforeTarget);
}

export function placeRightward(at: { x: number; y: number }, size: Size, obstacles: Box[]) {
  const box = { ...at, ...size }, widened = obstacles.map(obstacle => ({ ...obstacle, width: obstacle.width + 80 }));
  const found = directional(box, widened, { x: 1, y: 0 }, Math.max(1, widened.length));
  return found ? shift(box, found.dx, 0) : box;
}

/** The offset for pasted copies whose originals span `frame`. */
export function pasteOffset(frame: Box, obstacles: Box[]) {
  let dx = 20, dy = 20;
  for (let round = 0; round < 100; round++) {
    const box = shift(frame, dx, dy);
    let sameColumn = false, sameRow = false;
    for (const obstacle of obstacles) {
      if (!overlaps(box, obstacle)) continue;
      sameColumn ||= Math.abs(box.x - obstacle.x) < 10 || Math.abs(box.x + box.width - (obstacle.x + obstacle.width)) < 10;
      sameRow ||= Math.abs(box.y - obstacle.y) < 10 || Math.abs(box.y + box.height - (obstacle.y + obstacle.height)) < 10;
    }
    if (!sameColumn && !sameRow) break;
    if (sameColumn) dx += 40;
    if (sameRow) dy += 40;
  }
  return { x: dx, y: dy };
}

export const cardSize = { width: 320, height: 320 };
