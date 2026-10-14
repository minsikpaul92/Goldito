import { PointerEvent, useRef } from "react";

import { useTheme } from "../../providers/ThemeProvider";
import type { StickerCanvasProps } from "./decorApi";

/** A sticker at scale 1 is this share of the paper's width. */
const BASE_WIDTH = 0.24;

type Drag = { index: number; x0: number; y0: number; ix: number; iy: number; width: number; height: number };

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/**
 * One side of the stickers on a daily report's paper (Phase 12.3b; front / back of the text 12.4). Plain DOM, like the
 * trim sheet: pointer events give a real mouse drag inside the phone frame, and `data-gesture-owner` keeps
 * TouchEmulation from turning that drag into a scroll (DESIGN.md §7.7). Outside edit mode it ignores the mouse, so the text and buttons under it still work.
 */
export function StickerCanvas({ which, zIndex, layers, editing, selected, onSelect, onMove, urlFor }: StickerCanvasProps) {
  const theme = useTheme();
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  const onPointerDown = (index: number, x: number, y: number) => (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(index);
    const rect = root.current?.getBoundingClientRect();
    if (!rect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { index, x0: event.clientX, y0: event.clientY, ix: x, iy: y, width: rect.width, height: rect.height };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    onMove(d.index, clamp(d.ix + (event.clientX - d.x0) / Math.max(1, d.width)), clamp(d.iy + (event.clientY - d.y0) / Math.max(1, d.height)));
  };

  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <div
      ref={root}
      data-testid={`decor-canvas-${which}`}
      data-gesture-owner={editing ? "true" : undefined}
      onPointerDown={editing && which === "back" ? () => onSelect(null) : undefined}
      style={{
        position: "absolute",
        inset: 0,
        zIndex,
        overflow: "hidden",
        // The back canvas takes clicks on bare paper (to clear the pick); the front one lets them through to what is
        // under it, except on its own stickers.
        pointerEvents: editing && which === "back" ? "auto" : "none",
        touchAction: editing ? "none" : "auto",
      }}
    >
      {/* DOM order never changes (zIndex stacks them): moving a node while it is dragged would drop the pointer. */}
      {layers.flatMap((layer, layerIndex) =>
        layer.items.map((item, index) => {
          const side = item.layer ?? "front";
          // While I decorate, my own "behind the text" stickers float on the front canvas (faded) so they can be grabbed —
          // the text above the back canvas would otherwise catch the mouse. Saved, they go back under the writing.
          const lifted = editing && layer.mine && side === "back";
          if (which === "back" ? side !== "back" || lifted : side !== "front" && !lifted) return null;
          const live = editing && layer.mine;
          const isSelected = live && selected === index;
          return (
            <div
              key={`${layerIndex}-${index}-${item.sticker_id}`}
              data-testid={layer.mine ? "decor-mine" : "decor-other"}
              data-layer={side}
              data-selected={isSelected ? "true" : undefined}
              role={live ? "button" : undefined}
              aria-label={live ? "Sticker — drag to move" : undefined}
              onPointerDown={live ? onPointerDown(index, item.x, item.y) : undefined}
              onPointerMove={live ? onPointerMove : undefined}
              onPointerUp={live ? onPointerUp : undefined}
              onPointerCancel={live ? onPointerUp : undefined}
              style={{
                position: "absolute",
                left: `${item.x * 100}%`,
                top: `${item.y * 100}%`,
                width: `${BASE_WIDTH * 100}%`,
                aspectRatio: "1 / 1",
                transform: `translate(-50%, -50%) rotate(${item.rotate}deg) scale(${item.scale})`,
                zIndex: item.z + (layer.mine ? 1000 : 0),
                cursor: live ? "grab" : "default",
                pointerEvents: live ? "auto" : "none",
                outline: isSelected ? `2px dashed ${theme.color.primary}` : "none",
                opacity: lifted ? 0.6 : 1,
                outlineOffset: 2,
                userSelect: "none",
              }}
            >
              <img
                src={urlFor(item.public_id) || undefined}
                alt=""
                draggable={false}
                style={{ width: "100%", height: "100%", objectFit: "contain", pointerEvents: "none" }}
              />
            </div>
          );
        }),
      )}
    </div>
  );
}
