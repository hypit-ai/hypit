export const DEMO_VIDEO_TRIM_SECONDS = .3;

type TimelineRange = {
  start: number;
  end: number;
};

export function createTrimmedDemoTimeline<T extends TimelineRange>(
  sourceScenes: readonly T[],
  trim = DEMO_VIDEO_TRIM_SECONDS,
) {
  let cursor = 0;
  const scenes = sourceScenes.map((scene) => {
    const sourceDuration = scene.end - scene.start;
    const duration = Math.max(0, sourceDuration - trim * 2);
    const nextScene = {
      ...scene,
      start: cursor,
      end: cursor + duration,
      sourceStart: trim,
    };
    cursor = nextScene.end;
    return nextScene;
  });

  function mapTime(time: number) {
    const index = sourceScenes.findIndex((scene) => time < scene.end);
    const resolvedIndex = index === -1 ? sourceScenes.length - 1 : index;
    const sourceScene = sourceScenes[resolvedIndex];
    const scene = scenes[resolvedIndex];
    const sourceDuration = sourceScene.end - sourceScene.start;
    const sourceTime = Math.max(trim, Math.min(sourceDuration - trim, time - sourceScene.start));
    return scene.start + sourceTime - trim;
  }

  function mapRange<R extends TimelineRange>(range: R) {
    const start = mapTime(range.start);
    return { ...range, start, end: Math.max(start, mapTime(range.end)) };
  }

  return { duration: cursor, mapRange, mapTime, scenes };
}
