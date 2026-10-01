import { tokens } from "../../theme/tokens";

/**
 * Makes a mouse behave like a finger inside the desktop phone frame (architecture D25).
 * Installed only inside the frame's iframe and only reacts to `pointerType === "mouse"`,
 * so real phones and touch laptops keep the browser's native touch handling.
 */

const DRAG_THRESHOLD = 6;
const MAX_VELOCITY = 4; // px per ms
const MOMENTUM_FRICTION = 0.95; // per 16 ms frame
const MIN_VELOCITY = 0.02;
const VELOCITY_WINDOW_MS = 100;
const RELEASE_PAUSE_MS = 80;
const PAGE_FLING_VELOCITY = 0.3;
const SNAP_RESTORE_FALLBACK_MS = 700;
const LINE_HEIGHT_PX = 16;

const PRESSING_CLASS = "touch-emulation-pressing";
const EXEMPT_SELECTOR =
  'input, textarea, select, [contenteditable="true"], [data-gesture-owner]';

type Axis = "x" | "y";

type Sample = { t: number; pos: number };

type Drag = {
  startX: number;
  startY: number;
  startTime: number;
  lastX: number;
  lastY: number;
  target: Element;
  axis: Axis | null;
  scroller: HTMLElement | null;
  savedSnap: string | null;
  samples: Sample[];
};

function cursorUrl(radius: number, fillOpacity: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28">` +
    `<circle cx="14" cy="14" r="${radius}" fill="${tokens.color.text}" fill-opacity="${fillOpacity}" ` +
    `stroke="${tokens.color.surface}" stroke-opacity="0.9" stroke-width="2"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 14 14`;
}

// Only the document root stops overscroll, so scrolling never leaks to the outer page
// while nested rows still hand vertical scrolling up to the screen.
const CSS = `
html, body { overscroll-behavior: contain; }
* { scrollbar-width: none; }
*::-webkit-scrollbar { display: none; width: 0; height: 0; }
html, body, body * {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  cursor: ${cursorUrl(11, 0.18)}, pointer !important;
}
html.${PRESSING_CLASS}, html.${PRESSING_CLASS} body * {
  cursor: ${cursorUrl(8, 0.32)}, pointer !important;
}
input, textarea, [contenteditable="true"], [contenteditable="true"] * {
  -webkit-user-select: text;
  user-select: text;
  cursor: text !important;
}
img { -webkit-user-drag: none; }
`;

function isExempt(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(EXEMPT_SELECTOR) !== null;
}

function canScroll(el: HTMLElement, axis: Axis): boolean {
  const style = getComputedStyle(el);
  const overflow = axis === "y" ? style.overflowY : style.overflowX;
  if (overflow !== "auto" && overflow !== "scroll") return false;
  return axis === "y" ? el.scrollHeight > el.clientHeight : el.scrollWidth > el.clientWidth;
}

function findScroller(from: Element, axis: Axis): HTMLElement | null {
  for (let el: Element | null = from; el; el = el.parentElement) {
    if (el instanceof HTMLElement && canScroll(el, axis)) return el;
  }
  return null;
}

function hasSnap(el: HTMLElement): boolean {
  const snap = getComputedStyle(el).scrollSnapType;
  return Boolean(snap) && snap !== "none";
}

/**
 * Nearest free-scrolling sideways row (chips, strips) — the wheel moves it sideways.
 * Paged carousels are skipped so the screen keeps scrolling when the cursor passes over a photo.
 */
function findWheelRow(from: Element): HTMLElement | null {
  for (let el: Element | null = from; el; el = el.parentElement) {
    if (el instanceof HTMLElement && canScroll(el, "x") && !canScroll(el, "y")) {
      return hasSnap(el) ? null : el;
    }
  }
  return null;
}

function getPos(el: HTMLElement, axis: Axis): number {
  return axis === "y" ? el.scrollTop : el.scrollLeft;
}

function setPos(el: HTMLElement, axis: Axis, value: number) {
  if (axis === "y") el.scrollTop = value;
  else el.scrollLeft = value;
}

function maxPos(el: HTMLElement, axis: Axis): number {
  return axis === "y" ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
}

function pageSize(el: HTMLElement, axis: Axis): number {
  return axis === "y" ? el.clientHeight : el.clientWidth;
}

// react-native-web replaces `scrollTo` on ScrollView nodes with RN's `{x, y}` API — keep the DOM one.
const nativeScrollTo: (this: Element, options: ScrollToOptions) => void = Element.prototype.scrollTo;

/** Smoothly scrolls to a page and returns the target offset. */
function scrollToPage(el: HTMLElement, axis: Axis, page: number): number {
  const offset = Math.max(0, Math.min(maxPos(el, axis), page * pageSize(el, axis)));
  nativeScrollTo.call(el, { [axis === "y" ? "top" : "left"]: offset, behavior: "smooth" });
  return offset;
}

/** Scroll velocity (px/ms, positive = towards the end) from the last samples. */
function velocityOf(samples: Sample[], releasedAt: number): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  // Held still before letting go: no fling.
  if (releasedAt - last.t > RELEASE_PAUSE_MS) return 0;
  const first = samples.find((s) => last.t - s.t <= VELOCITY_WINDOW_MS) ?? samples[0];
  const dt = last.t - first.t;
  if (dt <= 0) return 0;
  const v = (last.pos - first.pos) / dt;
  return Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, v));
}

export function installTouchEmulation(): () => void {
  const style = document.createElement("style");
  style.dataset.touchEmulation = "true";
  style.textContent = CSS;
  document.head.appendChild(style);

  let drag: Drag | null = null;
  let suppressClick = false;
  let momentumFrame = 0;
  // Paged rows whose snapping is paused: original inline value + pending restore.
  const pausedSnaps = new Map<HTMLElement, { saved: string; timer: number }>();

  const pauseSnap = (el: HTMLElement): string => {
    const pending = pausedSnaps.get(el);
    if (pending) {
      clearTimeout(pending.timer);
      pausedSnaps.delete(el);
      return pending.saved;
    }
    const saved = el.style.scrollSnapType;
    el.style.scrollSnapType = "none";
    return saved;
  };

  /**
   * Re-enable snapping only once the page settle has reached its target —
   * snapping earlier would cancel that scroll and jump back to the old page.
   */
  const restoreSnapLater = (el: HTMLElement, axis: Axis, saved: string, target: number) => {
    const restore = () => {
      const pending = pausedSnaps.get(el);
      if (!pending) return;
      clearTimeout(pending.timer);
      pausedSnaps.delete(el);
      el.style.scrollSnapType = pending.saved;
      el.removeEventListener("scrollend", onScrollEnd);
    };
    // A scrollend left over from the drag itself can arrive first; wait for the target.
    const onScrollEnd = () => {
      if (Math.abs(getPos(el, axis) - target) <= 1) restore();
    };
    const timer = window.setTimeout(restore, SNAP_RESTORE_FALLBACK_MS);
    pausedSnaps.set(el, { saved, timer });
    el.addEventListener("scrollend", onScrollEnd);
  };

  const stopMomentum = () => {
    if (momentumFrame) cancelAnimationFrame(momentumFrame);
    momentumFrame = 0;
  };

  const startMomentum = (el: HTMLElement, axis: Axis, initialVelocity: number) => {
    let velocity = initialVelocity;
    let lastTime: number | null = null;
    const step = (now: number) => {
      // Frame timestamps can trail performance.now() (WebKit); count from the first frame.
      if (lastTime === null || now <= lastTime) {
        lastTime ??= now;
        momentumFrame = requestAnimationFrame(step);
        return;
      }
      const dt = now - lastTime;
      lastTime = now;
      const before = getPos(el, axis);
      setPos(el, axis, before + velocity * dt);
      velocity *= Math.pow(MOMENTUM_FRICTION, dt / 16);
      const stuck = getPos(el, axis) === before;
      if (Math.abs(velocity) < MIN_VELOCITY || stuck) {
        momentumFrame = 0;
        return;
      }
      momentumFrame = requestAnimationFrame(step);
    };
    momentumFrame = requestAnimationFrame(step);
  };

  const endDrag = (releasedAt: number) => {
    document.documentElement.classList.remove(PRESSING_CLASS);
    if (!drag) return;
    const { scroller, axis, samples, savedSnap } = drag;
    drag = null;
    if (!scroller || !axis) return;

    const velocity = velocityOf(samples, releasedAt);
    if (savedSnap !== null) {
      // Paged rows: settle on a page (a fling goes to the next one), then snap again.
      const page = getPos(scroller, axis) / pageSize(scroller, axis);
      const target =
        velocity > PAGE_FLING_VELOCITY
          ? Math.ceil(page)
          : velocity < -PAGE_FLING_VELOCITY
            ? Math.floor(page)
            : Math.round(page);
      const offset = scrollToPage(scroller, axis, target);
      restoreSnapLater(scroller, axis, savedSnap, offset);
      return;
    }
    if (Math.abs(velocity) > MIN_VELOCITY) startMomentum(scroller, axis, velocity);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    suppressClick = false;
    stopMomentum();
    if (isExempt(e.target) || !(e.target instanceof Element)) return;
    drag = {
      startX: e.clientX,
      startY: e.clientY,
      startTime: e.timeStamp,
      lastX: e.clientX,
      lastY: e.clientY,
      target: e.target,
      axis: null,
      scroller: null,
      savedSnap: null,
      samples: [],
    };
    document.documentElement.classList.add(PRESSING_CLASS);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!drag || e.pointerType !== "mouse") return;
    if ((e.buttons & 1) === 0) {
      // Button was released outside the frame.
      endDrag(e.timeStamp);
      return;
    }

    if (!drag.axis) {
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      const axis: Axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      drag.axis = axis;
      drag.scroller = findScroller(drag.target, axis);
      // Moved past the threshold: this is a swipe, never a tap.
      suppressClick = true;
      if (drag.scroller && (hasSnap(drag.scroller) || pausedSnaps.has(drag.scroller))) {
        // Snapping would undo every small programmatic scroll; pause it while dragging.
        drag.savedSnap = pauseSnap(drag.scroller);
      }
      if (drag.scroller) {
        // Browsers coalesce fast moves into few events; anchor the velocity at press time.
        drag.samples.push({ t: drag.startTime, pos: getPos(drag.scroller, axis) });
      }
    }

    const { scroller, axis } = drag;
    if (scroller && axis) {
      const delta = axis === "y" ? e.clientY - drag.lastY : e.clientX - drag.lastX;
      setPos(scroller, axis, getPos(scroller, axis) - delta);
      drag.samples.push({ t: e.timeStamp, pos: getPos(scroller, axis) });
      if (drag.samples.length > 20) drag.samples.shift();
    }
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
  };

  const onPointerUp = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    endDrag(e.timeStamp);
    if (suppressClick) {
      // `click` follows `pointerup` in the same task; clear the flag after it.
      setTimeout(() => {
        suppressClick = false;
      }, 0);
    }
  };

  const onClick = (e: MouseEvent) => {
    if (!suppressClick) return;
    suppressClick = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    if (!(e.target instanceof Element)) return;
    const row = findWheelRow(e.target);
    if (!row) return;

    const delta = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * LINE_HEIGHT_PX : e.deltaY;
    const pos = row.scrollLeft;
    const atEnd = delta > 0 ? pos >= maxPos(row, "x") - 1 : pos <= 0;
    if (atEnd) return; // let the screen scroll vertically

    e.preventDefault();
    row.scrollLeft = pos + delta;
  };

  const onDragStart = (e: DragEvent) => {
    if (!isExempt(e.target)) e.preventDefault();
  };

  const onBlur = () => endDrag(performance.now());

  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("pointermove", onPointerMove, true);
  window.addEventListener("pointerup", onPointerUp, true);
  window.addEventListener("pointercancel", onPointerUp, true);
  window.addEventListener("click", onClick, true);
  window.addEventListener("wheel", onWheel, { capture: true, passive: false });
  window.addEventListener("dragstart", onDragStart, true);
  window.addEventListener("blur", onBlur);

  return () => {
    stopMomentum();
    for (const [el, { saved, timer }] of pausedSnaps) {
      clearTimeout(timer);
      el.style.scrollSnapType = saved;
    }
    pausedSnaps.clear();
    window.removeEventListener("pointerdown", onPointerDown, true);
    window.removeEventListener("pointermove", onPointerMove, true);
    window.removeEventListener("pointerup", onPointerUp, true);
    window.removeEventListener("pointercancel", onPointerUp, true);
    window.removeEventListener("click", onClick, true);
    window.removeEventListener("wheel", onWheel, true);
    window.removeEventListener("dragstart", onDragStart, true);
    window.removeEventListener("blur", onBlur);
    document.documentElement.classList.remove(PRESSING_CLASS);
    style.remove();
  };
}
