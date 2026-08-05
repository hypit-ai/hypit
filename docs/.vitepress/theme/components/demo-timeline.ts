type TimelineRange = {
  start: number;
  end: number;
};

export function createDemoTimeline<T extends TimelineRange>(sourceScenes: readonly T[]) {
  const scenes = sourceScenes.map((scene) => ({
    ...scene,
    sourceStart: 0,
  }));

  function mapRange<R extends TimelineRange>(range: R) {
    return { ...range };
  }

  return {
    duration: scenes.at(-1)?.end ?? 0,
    mapRange,
    scenes,
  };
}
