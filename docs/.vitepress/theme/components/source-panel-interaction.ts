import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";

type SourcePanelInteractionOptions = {
  active?: () => boolean;
  expand: (event?: MouseEvent) => void;
  collapse: () => void;
};

export function useSourcePanelInteraction(
  panel: Ref<HTMLElement | null>,
  options: SourcePanelInteractionOptions,
) {
  const sourceUsesHover = ref(true);
  let hoverQuery: MediaQueryList | null = null;

  function syncPointerMode() {
    sourceUsesHover.value = hoverQuery?.matches ?? true;
    if (!sourceUsesHover.value) options.collapse();
  }

  function handleSourcePointerMove(event: PointerEvent) {
    if (sourceUsesHover.value) options.expand(event);
  }

  function handleSourcePointerDown(event: PointerEvent) {
    if (sourceUsesHover.value) options.expand(event);
  }

  function handleSourceClick(event: MouseEvent) {
    if (!sourceUsesHover.value) options.expand(event);
  }

  function handleSourceWheel(event: WheelEvent) {
    if (sourceUsesHover.value) options.expand(event);
  }

  function handleSourcePointerLeave() {
    if (sourceUsesHover.value) options.collapse();
  }

  function handleOutsidePointerDown(event: PointerEvent) {
    if (sourceUsesHover.value || options.active?.() === false) return;
    const target = event.target;
    if (target instanceof Node && panel.value?.contains(target)) return;
    options.collapse();
  }

  onMounted(() => {
    hoverQuery = window.matchMedia("(hover: hover) and (pointer: fine)");
    syncPointerMode();
    hoverQuery.addEventListener("change", syncPointerMode);
    document.addEventListener("pointerdown", handleOutsidePointerDown, true);
  });

  onBeforeUnmount(() => {
    hoverQuery?.removeEventListener("change", syncPointerMode);
    document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
  });

  return {
    sourceUsesHover,
    handleSourcePointerMove,
    handleSourcePointerDown,
    handleSourceClick,
    handleSourceWheel,
    handleSourcePointerLeave,
  };
}
