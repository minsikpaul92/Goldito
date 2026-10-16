/**
 * "Save image" of a decorated picture-diary page (Phase 11.8). Web only, like the Snap tools.
 *
 * The page is painted onto a canvas from what the browser already laid out: the boxes and the words come from the DOM
 * (their rects and computed styles, so line breaks and the handwriting font match the screen exactly), the stickers
 * from their decor items (the same math as `StickerCanvas.web.tsx`). No DOM-to-image library: images are loaded again
 * with `crossOrigin="anonymous"` so the canvas stays exportable (Cloudinary sends CORS headers); one that fails to load
 * is left out and counted.
 */

/** A sticker at scale 1 is this share of the paper's width — keep in step with `StickerCanvas.web.tsx`. */
const BASE_WIDTH = 0.24;
/** Pixels per CSS pixel in the saved file. */
const SCALE = 2;

export type PaintSticker = {
  url: string;
  x: number;
  y: number;
  scale: number;
  rotate: number;
  /** Stacking order within its side (mine already lifted above the other person's). */
  z: number;
  layer: "front" | "back";
};

export type DiaryPage = {
  paper: HTMLElement;
  picture: HTMLElement;
  /** The day's photo in the picture box (drawn like `resizeMode="cover"`), or null for the empty box. */
  pictureUrl: string | null;
  /** The ruled lines' container: each child is one line. */
  lines: HTMLElement;
  /** The elements whose words are painted (header, body). */
  text: HTMLElement[];
  stickers: PaintSticker[];
};

export type DiaryImage = { blob: Blob; width: number; height: number; missing: number };

export async function renderDiaryPage(page: DiaryPage): Promise<DiaryImage> {
  const origin = page.paper.getBoundingClientRect();
  // The phone frame may be scaled down (narrow window, split view): rects come scaled, fonts and borders do not —
  // so everything is drawn in the page's own layout pixels.
  const width = page.paper.offsetWidth;
  const height = page.paper.offsetHeight;
  const k = origin.width / Math.max(1, width) || 1;
  const canvas = document.createElement("canvas");
  canvas.width = width * SCALE;
  canvas.height = height * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't make the image.");
  ctx.scale(SCALE, SCALE);
  const local = (rect: DOMRect) => ({ x: (rect.left - origin.left) / k, y: (rect.top - origin.top) / k, w: rect.width / k, h: rect.height / k });

  const urls = [page.pictureUrl, ...page.stickers.map((s) => s.url)].filter((u): u is string => !!u);
  const images = new Map(await Promise.all([...new Set(urls)].map(async (url) => [url, await loadImage(url)] as const)));
  let missing = 0;
  const image = (url: string | null) => {
    if (!url) return null;
    const found = images.get(url) ?? null;
    if (!found) missing += 1;
    return found;
  };

  // Paper.
  const paperStyle = getComputedStyle(page.paper);
  const paperRadius = parseFloat(paperStyle.borderTopLeftRadius) || 0;
  box(ctx, { x: 0, y: 0, w: width, h: height }, paperRadius, paperStyle);

  // The ruled lines, then the picture box over them (the box is opaque in the layout too).
  for (const rule of Array.from(page.lines.children) as HTMLElement[]) {
    const r = local(rule.getBoundingClientRect());
    ctx.fillStyle = getComputedStyle(rule).backgroundColor;
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  const pic = local(page.picture.getBoundingClientRect());
  const picStyle = getComputedStyle(page.picture);
  const picRadius = parseFloat(picStyle.borderTopLeftRadius) || 0;
  box(ctx, pic, picRadius, picStyle, image(page.pictureUrl));
  await paintWords(ctx, page.picture, local); // the 🖍️ of an empty box

  // Stickers are clipped to the paper's inside (the canvases are `inset: 0; overflow: hidden` in it).
  const bl = parseFloat(paperStyle.borderLeftWidth) || 0;
  const bt = parseFloat(paperStyle.borderTopWidth) || 0;
  const inner = { x: bl, y: bt, w: width - bl - (parseFloat(paperStyle.borderRightWidth) || 0), h: height - bt - (parseFloat(paperStyle.borderBottomWidth) || 0) };
  const side = (which: "front" | "back") => {
    const items = page.stickers.filter((s) => s.layer === which).sort((a, b) => a.z - b.z);
    if (items.length === 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(inner.x, inner.y, inner.w, inner.h);
    ctx.clip();
    for (const item of items) {
      const img = image(item.url);
      if (!img) continue;
      const size = BASE_WIDTH * inner.w;
      ctx.save();
      ctx.translate(inner.x + item.x * inner.w, inner.y + item.y * inner.h);
      ctx.rotate((item.rotate * Math.PI) / 180);
      ctx.scale(item.scale, item.scale);
      contain(ctx, img, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    ctx.restore();
  };

  side("back");
  for (const root of page.text) await paintWords(ctx, root, local);
  side("front");

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("This browser can't make the image.");
  return { blob, width: canvas.width, height: canvas.height, missing };
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

type Rect = { x: number; y: number; w: number; h: number };

function roundedPath(ctx: CanvasRenderingContext2D, r: Rect, radius: number) {
  const k = Math.min(radius, r.w / 2, r.h / 2);
  ctx.beginPath();
  ctx.moveTo(r.x + k, r.y);
  ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, k);
  ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, k);
  ctx.arcTo(r.x, r.y + r.h, r.x, r.y, k);
  ctx.arcTo(r.x, r.y, r.x + r.w, r.y, k);
  ctx.closePath();
}

/** A box like CSS draws it: background, an optional cover image, then the border inside the edge. */
function box(ctx: CanvasRenderingContext2D, r: Rect, radius: number, style: CSSStyleDeclaration, img: HTMLImageElement | null = null) {
  ctx.save();
  roundedPath(ctx, r, radius);
  ctx.fillStyle = style.backgroundColor;
  ctx.fill();
  if (img) {
    ctx.clip();
    cover(ctx, img, r);
  }
  ctx.restore();
  const border = parseFloat(style.borderTopWidth) || 0;
  if (border > 0 && style.borderTopStyle !== "none") {
    ctx.save();
    roundedPath(ctx, { x: r.x + border / 2, y: r.y + border / 2, w: r.w - border, h: r.h - border }, Math.max(0, radius - border / 2));
    ctx.lineWidth = border;
    ctx.strokeStyle = style.borderTopColor;
    if (style.borderTopStyle === "dashed") ctx.setLineDash([border * 3, border * 2]);
    ctx.stroke();
    ctx.restore();
  }
}

function cover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, r: Rect) {
  const s = Math.max(r.w / img.naturalWidth, r.h / img.naturalHeight);
  const w = img.naturalWidth * s;
  const h = img.naturalHeight * s;
  ctx.drawImage(img, r.x + (r.w - w) / 2, r.y + (r.h - h) / 2, w, h);
}

function contain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * s;
  const dh = img.naturalHeight * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** Each word where the browser put it, in the font and colour it has on screen. */
async function paintWords(ctx: CanvasRenderingContext2D, root: HTMLElement, local: (rect: DOMRect) => Rect) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent ?? "";
    const parent = node.parentElement;
    if (!parent || !text.trim()) continue;
    const style = getComputedStyle(parent);
    const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    // The handwriting font is a web font: make sure it is ready, or the canvas falls back to another one.
    await document.fonts?.load(font, text).catch(() => undefined);
    ctx.font = font;
    ctx.fillStyle = style.color;
    ctx.textBaseline = "alphabetic";
    for (const match of text.matchAll(/\S+/g)) {
      const at = match.index ?? 0;
      range.setStart(node, at);
      range.setEnd(node, at + match[0].length);
      const client = range.getClientRects()[0];
      if (!client || client.width === 0) continue;
      const rect = local(client);
      const m = ctx.measureText(match[0]);
      const ascent = m.fontBoundingBoxAscent ?? m.actualBoundingBoxAscent;
      const descent = m.fontBoundingBoxDescent ?? m.actualBoundingBoxDescent;
      // The word's box is the font's content area; centre that on it and draw on its baseline.
      const baseline = rect.y + (rect.h - (ascent + descent)) / 2 + ascent;
      ctx.fillText(match[0], rect.x, baseline);
    }
  }
}
