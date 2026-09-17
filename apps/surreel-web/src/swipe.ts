export function projectTravel(velocityPxPerS: number, decelerationRate = 0.998) {
  return (velocityPxPerS / 1000) * (decelerationRate / (1 - decelerationRate));
}

export function rubber(x: number, limit = 220) {
  if (Math.abs(x) <= limit) return x;
  return Math.sign(x) * (limit + (Math.abs(x) - limit) * 0.35);
}

export function wrapOffset(delta: number, count: number) {
  return delta - Math.round(delta / count) * count;
}

export function shortestSpin(from: number, to: number, count: number) {
  const dest = ((to % count) + count) % count;
  return from + wrapOffset(dest - from, count);
}

export function nearestIndex(points: Array<{ index: number; x: number; width: number }>, clientX: number) {
  let best = points[0]?.index ?? 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const point of points) {
    if (point.width < 48) continue;
    const distance = Math.abs(clientX - point.x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point.index;
    }
  }
  return best;
}

export function swipeCommit(offset: number, velocity: number, threshold = 90): -1 | 0 | 1 {
  const projected = offset + projectTravel(velocity);
  if (Math.abs(projected) <= threshold && Math.abs(offset) <= 108 && Math.abs(velocity) <= 700) return 0;
  if (Math.abs(velocity) > 40) return velocity > 0 ? 1 : -1;
  if (offset === 0) return 0;
  return offset > 0 ? 1 : -1;
}
