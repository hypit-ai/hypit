/** Leave connections and decoders available to the actual player. */
export function createPreviewQueue(concurrency: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return function enqueue<T>(work: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = (): void => {
        active += 1;
        void Promise.resolve().then(work).then(resolve, reject).finally(() => {
          active -= 1;
          waiting.shift()?.();
        });
      };
      if (active < concurrency) start();
      else waiting.push(start);
    });
  };
}
