import { PointerEvent, useRef } from "react";

import { useTheme } from "../../providers/ThemeProvider";
import type { DecorItem, StickerCanvasProps } from "./decorApi";

/** A sticker at scale 1 is this share of the paper's width. */
const BASE_WIDTH = 0.24;

/** The corner handle's size (px); it keeps this size whatever the sticker's scale. */
const HANDLE = 24;

type Drag = { index: number; x0: number; y0: number; ix: number; iy: number; width: number; height: number };
/** A turn-and-size gesture: from the corner handle (around the sticker's centre) or a pinch (two fingers). */
type Twist = { index: number; dist0: number; angle0: number; scale0: number; rotate0: number; cx?: number; cy?: number };
type Point = { x: number; y: number };

const clamp = (value: number) => Math.min(1, Math.max(0, value));
const span = (a: Point, b: Point) => ({ dist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI });

/**
 * One side of the stickers on a daily report's paper (Phase 12.3b; front / back of the text 12.4). Plain DOM, like the
 * trim sheet: pointer events give a real mouse drag inside the phone frame, and `data-gesture-owner` keeps
 * TouchEmulation from turning that drag into a scroll (DESIGN.md §7.7). Outside edit mode it ignores the mouse, so the text and buttons under it still work.
 */
export function StickerCanvas({ which, zIndex, layers, editing, selected, onSelect, onMove, onTransform, onRemove, urlFor }: StickerCanvasProps) {
  const theme = useTheme();
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const twist = useRef<Twist | null>(null);
  // The fingers down on a sticker (#369): a second one turns the drag into a pinch.
  const fingers = useRef(new Map<number, Point>());

  const onPointerDown = (index: number, item: DecorItem) => (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onSelect(index);
    const rect = root.current?.getBoundingClientRect();
    if (!rect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    fingers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const [a, b] = [...fingers.current.values()];
    if (b) {
      const s = span(a, b);
      drag.current = null;
      twist.current = { index, dist0: s.dist, angle0: s.angle, scale0: item.scale, rotate0: item.rotate };
      return;
    }
    drag.current = { index, x0: event.clientX, y0: event.clientY, ix: item.x, iy: item.y, width: rect.width, height: rect.height };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (fingers.current.has(event.pointerId)) fingers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const t = twist.current;
    if (t && t.cx === undefined) {
      const [a, b] = [...fingers.current.values()];
      if (!b) return;
      const s = span(a, b);
      onTransform(t.index, (t.scale0 * s.dist) / t.dist0, t.rotate0 + s.angle - t.angle0);
      return;
    }
    const d = drag.current;
    if (!d) return;
    onMove(d.index, clamp(d.ix + (event.clientX - d.x0) / Math.max(1, d.width)), clamp(d.iy + (event.clientY - d.y0) / Math.max(1, d.height)));
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    fingers.current.delete(event.pointerId);
    // Lifting one finger of a pinch ends it; the other one does not jump into a drag.
    drag.current = null;
    if (twist.current?.cx === undefined) twist.current = null;
  };

  // The corner handle: drag it away from the centre to grow, around it to turn (with a mouse too).
  const onHandleDown = (index: number, item: DecorItem) => (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const sticker = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!sticker) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const c = { x: sticker.left + sticker.width / 2, y: sticker.top + sticker.height / 2 };
    const s = span(c, { x: event.clientX, y: event.clientY });
    twist.current = { index, dist0: s.dist, angle0: s.angle, scale0: item.scale, rotate0: item.rotate, cx: c.x, cy: c.y };
  };

  const onHandleMove = (event: PointerEvent<HTMLDivElement>) => {
    const t = twist.current;
    if (!t || t.cx === undefined || t.cy === undefined) return;
    const s = span({ x: t.cx, y: t.cy }, { x: event.clientX, y: event.clientY });
    onTransform(t.index, (t.scale0 * s.dist) / t.dist0, t.rotate0 + s.angle - t.angle0);
  };

  const onHandleUp = () => {
    twist.current = null;
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
              aria-label={live ? "Sticker, drag to move" : undefined}
              onPointerDown={live ? onPointerDown(index, item) : undefined}
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
              {isSelected ? (
                <div
                  data-testid="decor-remove"
                  role="button"
                  aria-label="Remove this sticker"
                  // Not a drag: the sticker under it stays put.
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onRemove(index)}
                  style={{
                    position: "absolute",
                    left: -HANDLE / 2,
                    top: -HANDLE / 2,
                    width: HANDLE,
                    height: HANDLE,
                    borderRadius: HANDLE / 2,
                    boxSizing: "border-box",
                    border: `2px solid ${theme.color.surface}`,
                    backgroundColor: theme.color.text,
                    color: theme.color.surface,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: theme.fontSize.small,
                    fontWeight: theme.fontWeight.bold,
                    lineHeight: 1,
                    transform: `scale(${1 / item.scale}) rotate(${-item.rotate}deg)`,
                    cursor: "pointer",
                  }}
                >
                  ×
                </div>
              ) : null}
              {isSelected ? (
                <div
                  data-testid="decor-resize"
                  role="button"
                  aria-label="Drag to size and turn"
                  onPointerDown={onHandleDown(index, item)}
                  onPointerMove={onHandleMove}
                  onPointerUp={onHandleUp}
                  onPointerCancel={onHandleUp}
                  style={{
                    position: "absolute",
                    right: -HANDLE / 2,
                    bottom: -HANDLE / 2,
                    width: HANDLE,
                    height: HANDLE,
                    borderRadius: HANDLE / 2,
                    boxSizing: "border-box",
                    border: `2px solid ${theme.color.surface}`,
                    backgroundColor: theme.color.primary,
                    // The sticker's scale would shrink or blow up the handle; undo it.
                    transform: `scale(${1 / item.scale})`,
                    cursor: "nwse-resize",
                    touchAction: "none",
                  }}
                />
              ) : null}
            </div>
          );
        }),
      )}
    </div>
  );
}
