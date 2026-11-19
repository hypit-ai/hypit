import { useEffect, useState, type RefObject } from "react";

export function useTimelineViewport(scroller: RefObject<HTMLDivElement | null>, labelWidth: number) {
  const [size, setSize] = useState({ width: 900, height: 0 });
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    let animation = 0;
    const measure = () => { animation = 0; setSize({ width: element.clientWidth - labelWidth, height: element.clientHeight }); };
    const schedule = () => { if (!animation) animation = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule); observer.observe(element);
    measure();
    return () => { observer.disconnect(); cancelAnimationFrame(animation); };
  }, [scroller, labelWidth]);
  return size;
}
