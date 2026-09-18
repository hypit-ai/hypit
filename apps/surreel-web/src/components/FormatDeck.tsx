import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { hypitFormats } from "../formats.ts";
import { nearestIndex, shortestSpin, swipeCommit, wrapOffset } from "../swipe.ts";

export type WheelCard = {
  id: string;
  src: string;
  kind: "image" | "video";
  caption: string;
  tone?: "live" | "alert";
};

function slotOf(index: number, count: number) {
  return ((Math.round(index) % count) + count) % count;
}

function cardTransform(offset: number, count: number, radius: number) {
  if (count <= 1) return "translateX(-50%)";
  const angle = offset * (360 / count);
  return `translateX(-50%) rotateY(${angle}deg) translateZ(${radius}px) rotateY(${-angle}deg)`;
}

export function WheelDeck({
  items,
  selectedId,
  onChange,
  onActivate,
  label,
  testId,
  size = "full",
}: {
  items: readonly WheelCard[];
  selectedId: string;
  onChange: (id: string) => void;
  onActivate?: (id: string, origin: DOMRect) => void;
  label: string;
  testId: string;
  size?: "full" | "compact";
}) {
  const count = Math.max(1, items.length);
  const slotPx = size === "compact" ? 96 : 120;
  const radius = count <= 1 ? 0 : size === "compact" ? 150 : 188;
  const index = Math.max(
    0,
    items.findIndex((item) => item.id === selectedId),
  );
  const selected = items[index] ?? items[0];
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef({ originX: 0, originSpin: 0, pointerId: -1, active: false, moved: false });
  const samples = useRef<{ t: number; x: number }[]>([]);
  const spinRef = useRef(index);
  const timer = useRef(0);
  const moveRef = useRef<(event: PointerEvent) => void>(() => undefined);
  const upRef = useRef<(event: PointerEvent) => void>(() => undefined);
  const onWindowMove = useRef((event: PointerEvent) => moveRef.current(event)).current;
  const onWindowUp = useRef((event: PointerEvent) => upRef.current(event)).current;
  const [spin, setSpin] = useState(index);
  const [mode, setMode] = useState<"rest" | "drag" | "settle">("rest");

  function applySpin(next: number, nextMode: "rest" | "drag" | "settle") {
    spinRef.current = next;
    setSpin(next);
    setMode(nextMode);
  }

  function choose(nextIndex: number, activate = false) {
    const next = items[slotOf(nextIndex, count)];
    if (!next) return;
    if (next.id !== selectedId) onChange(next.id);
    else if (activate) {
      const front = stage.current?.querySelector<HTMLElement>(".deck-card.is-front");
      onActivate?.(next.id, (front ?? stage.current)?.getBoundingClientRect() ?? new DOMRect());
    }
  }

  function land(target: number, activate = false) {
    if (items.length === 0) return;
    if (timer.current) window.clearTimeout(timer.current);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const snapped = shortestSpin(spinRef.current, Math.round(target), count);
    const nextIndex = slotOf(snapped, count);
    choose(nextIndex, activate);
    if (reduced || count <= 1) {
      applySpin(nextIndex, "rest");
      return;
    }
    applySpin(snapped, "settle");
    timer.current = window.setTimeout(() => {
      timer.current = 0;
      applySpin(nextIndex, "rest");
    }, 400);
  }

  function cardFromPoint(clientX: number) {
    const root = stage.current;
    if (!root) return slotOf(spinRef.current, count);
    const frame = root.getBoundingClientRect();
    if (Math.abs(clientX - (frame.left + frame.width / 2)) < frame.width * 0.22) {
      return slotOf(spinRef.current, count);
    }
    const points = [...root.querySelectorAll<HTMLElement>("[data-card]")].map((node) => {
      const box = node.getBoundingClientRect();
      return { index: Number(node.dataset.card), x: box.left + box.width / 2, width: box.width };
    });
    return nearestIndex(points, clientX);
  }

  function release() {
    const now = performance.now();
    const recent = samples.current.filter((sample) => now - sample.t <= 90);
    const first = recent[0] ?? samples.current[0];
    const last = recent[recent.length - 1] ?? samples.current[samples.current.length - 1];
    const dt = first && last ? last.t - first.t : 0;
    const velocity = first && last && dt > 0 ? ((last.x - first.x) / dt) * 1000 : 0;
    const px = (drag.current.originSpin - spinRef.current) * slotPx;
    const nearest = Math.round(spinRef.current);
    const commit = swipeCommit(px, velocity);
    if (commit !== 0 && nearest === Math.round(drag.current.originSpin)) {
      land(drag.current.originSpin + (commit > 0 ? -1 : 1));
      return;
    }
    land(spinRef.current);
  }

  function stopDrag() {
    drag.current.active = false;
    drag.current.pointerId = -1;
    window.removeEventListener("pointermove", onWindowMove);
    window.removeEventListener("pointerup", onWindowUp);
    window.removeEventListener("pointercancel", onWindowUp);
  }

  moveRef.current = (event: PointerEvent) => {
    if (!drag.current.active || event.pointerId !== drag.current.pointerId) return;
    const px = event.clientX - drag.current.originX;
    if (Math.abs(px) > 6) drag.current.moved = true;
    samples.current.push({ t: performance.now(), x: px });
    if (samples.current.length > 8) samples.current.shift();
    applySpin(drag.current.originSpin - px / slotPx, "drag");
  };

  upRef.current = (event: PointerEvent) => {
    if (event.pointerId !== drag.current.pointerId) return;
    const moved = drag.current.moved;
    const x = event.clientX;
    stopDrag();
    if (moved) release();
    else land(cardFromPoint(x), true);
  };

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || items.length === 0) return;
    event.preventDefault();
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = 0;
    }
    stopDrag();
    drag.current = {
      originX: event.clientX,
      originSpin: spinRef.current,
      pointerId: event.pointerId,
      active: true,
      moved: false,
    };
    samples.current = [{ t: performance.now(), x: 0 }];
    window.addEventListener("pointermove", onWindowMove);
    window.addEventListener("pointerup", onWindowUp);
    window.addEventListener("pointercancel", onWindowUp);
  }

  useEffect(() => {
    if (items.length === 0) return;
    if (items.some((item) => item.id === selectedId)) return;
    onChange(items[0]!.id);
  }, [items, selectedId, onChange]);

  useEffect(() => {
    if (drag.current.active || items.length === 0) return;
    if (Math.abs(wrapOffset(spinRef.current - index, count)) < 0.02) return;
    land(index);
  }, [index, count, items.length]);

  useEffect(() => {
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
      stopDrag();
    };
  }, []);

  if (items.length === 0 || !selected) return null;

  return (
    <div
      className={`deck-pager is-${mode}${size === "compact" ? " is-compact" : ""}`}
      data-testid={testId}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          land(spinRef.current - 1);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          land(spinRef.current + 1);
        }
      }}
    >
      <div className="deck-stage" ref={stage}>
        {items.map((item, itemIndex) => {
          const offset = wrapOffset(itemIndex - spin, count);
          const front = Math.abs(offset) < 0.5;
          return (
            <figure
              key={item.id}
              data-card={itemIndex}
              className={["deck-card", front ? "is-front" : "", item.tone === "live" ? "is-live" : "", item.tone === "alert" ? "is-alert" : ""]
                .filter(Boolean)
                .join(" ")}
              style={
                {
                  transform: cardTransform(offset, count, radius),
                  zIndex: String(Math.round(20 + Math.cos((offset * 2 * Math.PI) / count) * 10)),
                } as CSSProperties
              }
              aria-hidden={front ? undefined : true}
            >
              {item.kind === "video" ? <video src={item.src} muted playsInline preload="metadata" /> : <img src={item.src} alt="" draggable={false} />}
              {front ? <figcaption className="caption">{item.caption}</figcaption> : null}
            </figure>
          );
        })}
      </div>
    </div>
  );
}

export function FormatDeck({ formatId, onChange }: { formatId: string; onChange: (id: string) => void }) {
  const format = hypitFormats.find((item) => item.id === formatId) ?? hypitFormats[0]!;
  return (
    <WheelDeck
      items={hypitFormats.map((item) => ({
        id: item.id,
        src: `/images/${item.image}.jpg`,
        kind: "image",
        caption: item.title,
      }))}
      selectedId={formatId}
      onChange={onChange}
      label={`Format ${format.title}`}
      testId="format-deck"
    />
  );
}
