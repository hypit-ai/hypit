import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

type SourcePanelInteractionOptions = {
  active: () => boolean;
  expand: (event?: { target: EventTarget | null; clientY: number }) => void;
  collapse: () => void;
};

// React port of the Vue `useSourcePanelInteraction` composable. Handlers are
// kept in a ref so the pointer listeners never go stale without re-subscribing.
export function useSourcePanelInteraction(
  panel: RefObject<HTMLElement | null>,
  options: SourcePanelInteractionOptions,
) {
  const [sourceUsesHover, setSourceUsesHover] = useState(true);
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const usesHoverRef = useRef(true);

  useEffect(() => {
    const hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");

    const syncPointerMode = () => {
      usesHoverRef.current = hoverQuery.matches;
      setSourceUsesHover(hoverQuery.matches);
      if (!hoverQuery.matches) optionsRef.current.collapse();
    };

    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (usesHoverRef.current || optionsRef.current.active() === false) return;
      const target = event.target;
      if (target instanceof Node && panel.current?.contains(target)) return;
      optionsRef.current.collapse();
    };

    syncPointerMode();
    hoverQuery.addEventListener("change", syncPointerMode);
    document.addEventListener("pointerdown", handleOutsidePointerDown, true);

    return () => {
      hoverQuery.removeEventListener("change", syncPointerMode);
      document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
    };
  }, [panel]);

  const handleSourcePointerMove = useCallback((event: React.PointerEvent) => {
    if (usesHoverRef.current) optionsRef.current.expand(event);
  }, []);

  const handleSourcePointerDown = useCallback((event: React.PointerEvent) => {
    if (usesHoverRef.current) optionsRef.current.expand(event);
  }, []);

  const handleSourceClick = useCallback((event: React.MouseEvent) => {
    if (!usesHoverRef.current) optionsRef.current.expand(event);
  }, []);

  const handleSourceWheel = useCallback((event: React.WheelEvent) => {
    if (usesHoverRef.current) optionsRef.current.expand(event);
  }, []);

  const handleSourcePointerLeave = useCallback(() => {
    if (usesHoverRef.current) optionsRef.current.collapse();
  }, []);

  return {
    sourceUsesHover,
    handleSourcePointerMove,
    handleSourcePointerDown,
    handleSourceClick,
    handleSourceWheel,
    handleSourcePointerLeave,
  };
}
