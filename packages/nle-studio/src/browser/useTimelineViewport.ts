import { useEffect, useState, type RefObject } from "react";

export function useTimelineViewport(scroller: RefObject<HTMLDivElement | null>, labelWidth: number) {
  const [range, setRange] = useState({ left: 0, right: 900, height: 0 });
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    let animation = 0;
    const measure = () => { animation = 0; setRange({ left: element.scrollLeft, right: element.scrollLeft + element.clientWidth - labelWidth, height: element.clientHeight }); };
    const schedule = () => { if (!animation) animation = requestAnimationFrame(measure); };
    const observer = new ResizeObserver(schedule); observer.observe(element);
    element.addEventListener("scroll", schedule); measure();
    return () => { observer.disconnect(); element.removeEventListener("scroll", schedule); cancelAnimationFrame(animation); };
  }, [scroller, labelWidth]);
  return range;
}
