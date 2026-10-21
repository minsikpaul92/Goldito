import type { Mask } from "../../snap/vision";
import { SPRITE_SIZE } from "./sprites";

/**
 * Photo to pixel head (11.12): the cut-out pet becomes a 16x16 sprite of a few colors with a dark outline, small
 * enough to keep in `pets.profile`. The top of the cut-out is the head, so a full-body photo is cropped to a square
 * from the top. Web only (canvas).
 *
 * `rows` are 16 strings: `.` transparent, `o` outline, `0`-`9` an index into `palette`.
 */
export type PixelHead = { v: 1; palette: string[]; rows: string[] };

/** Colors after quantizing (the outline is one more). */
const COLORS = 6;
/** One pixel of margin on every side for the outline. */
const INNER = SPRITE_SIZE - 2;

type Rgb = [number, number, number];

export function pixelize(frame: HTMLCanvasElement, mask: Mask): PixelHead {
  // Where the pet is, in mask pixels.
  let x0 = mask.width;
  let y0 = mask.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      if (mask.data[y * mask.width + x] <= 0.5) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error("We couldn't find a pet there. Tap your pet.");

  // A square as wide as the pet, from its top: the head and a bit of the body.
  const side = x1 - x0 + 1;
  const sy1 = Math.min(y1, y0 + side - 1);

  const pixels = frame.getContext("2d")!.getImageData(0, 0, frame.width, frame.height).data;
  const fx = frame.width / mask.width;
  const fy = frame.height / mask.height;

  // Average color and mask coverage of each cell.
  const cells: (Rgb | null)[] = [];
  for (let cy = 0; cy < INNER; cy++) {
    for (let cx = 0; cx < INNER; cx++) {
      const mx0 = x0 + Math.floor((cx * side) / INNER);
      const mx1 = Math.max(mx0 + 1, x0 + Math.floor(((cx + 1) * side) / INNER));
      const my0 = y0 + Math.floor((cy * side) / INNER);
      const my1 = Math.max(my0 + 1, y0 + Math.floor(((cy + 1) * side) / INNER));
      let on = 0;
      let all = 0;
      const sum: Rgb = [0, 0, 0];
      for (let my = my0; my < my1 && my <= sy1; my++) {
        for (let mx = mx0; mx < mx1; mx++) {
          all++;
          if (mask.data[my * mask.width + mx] <= 0.5) continue;
          on++;
          const i = (Math.min(frame.height - 1, Math.floor((my + 0.5) * fy)) * frame.width + Math.min(frame.width - 1, Math.floor((mx + 0.5) * fx))) * 4;
          sum[0] += pixels[i];
          sum[1] += pixels[i + 1];
          sum[2] += pixels[i + 2];
        }
      }
      cells.push(all > 0 && on * 2 >= all ? [sum[0] / on, sum[1] / on, sum[2] / on] : null);
    }
  }

  const palette = quantize(cells.filter((c): c is Rgb => c !== null), COLORS);
  const grid: string[][] = Array.from({ length: SPRITE_SIZE }, () => Array(SPRITE_SIZE).fill("."));
  cells.forEach((c, i) => {
    if (c) grid[1 + Math.floor(i / INNER)][1 + (i % INNER)] = String(nearest(palette, c));
  });
  // The outline: every empty pixel next to the pet.
  const filled = (x: number, y: number) => grid[y]?.[x] !== undefined && grid[y][x] !== "." && grid[y][x] !== "o";
  for (let y = 0; y < SPRITE_SIZE; y++) {
    for (let x = 0; x < SPRITE_SIZE; x++) {
      if (grid[y][x] === "." && (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1))) grid[y][x] = "o";
    }
  }
  return { v: 1, palette: palette.map(hex), rows: grid.map((r) => r.join("")) };
}

/** Median cut: split the widest color box in two until there are `k`, each box gives its average. */
function quantize(colors: Rgb[], k: number): Rgb[] {
  if (colors.length === 0) return [];
  let boxes: Rgb[][] = [colors];
  while (boxes.length < k) {
    let pick = -1;
    let channel = 0;
    let widest = 0;
    boxes.forEach((box, i) => {
      for (let c = 0; c < 3; c++) {
        const values = box.map((p) => p[c]);
        const range = Math.max(...values) - Math.min(...values);
        if (box.length > 1 && range > widest) {
          widest = range;
          pick = i;
          channel = c;
        }
      }
    });
    if (pick < 0) break;
    const sorted = [...boxes[pick]].sort((a, b) => a[channel] - b[channel]);
    const half = Math.floor(sorted.length / 2);
    boxes = [...boxes.slice(0, pick), sorted.slice(0, half), sorted.slice(half), ...boxes.slice(pick + 1)];
  }
  return boxes.map((box) => box.reduce<Rgb>((s, p) => [s[0] + p[0] / box.length, s[1] + p[1] / box.length, s[2] + p[2] / box.length], [0, 0, 0]));
}

function nearest(palette: Rgb[], c: Rgb): number {
  let best = 0;
  let dist = Infinity;
  palette.forEach((p, i) => {
    const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
    if (d < dist) {
      dist = d;
      best = i;
    }
  });
  return best;
}

const hex = (c: Rgb) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();

/** The outline color: the darkest palette color, darker still. */
export function outlineColor(head: PixelHead): string {
  const dark = [...head.palette].sort((a, b) => luma(a) - luma(b))[0] ?? "#333333";
  const [r, g, b] = [1, 3, 5].map((i) => Math.round(parseInt(dark.slice(i, i + 2), 16) * 0.45));
  return hex([r, g, b]);
}

const luma = (h: string) => 0.299 * parseInt(h.slice(1, 3), 16) + 0.587 * parseInt(h.slice(3, 5), 16) + 0.114 * parseInt(h.slice(5, 7), 16);

/** The head as rows of CSS colors, `null` = transparent (same shape as `spritePixels`). */
export function headPixels(head: PixelHead): (string | null)[][] {
  const outline = outlineColor(head);
  return head.rows.map((row) => [...row].map((ch) => (ch === "." ? null : ch === "o" ? outline : (head.palette[Number(ch)] ?? null))));
}

/** A saved head from `pets.profile.pixel_head`, or null when it is missing or not this shape. */
export function asPixelHead(value: unknown): PixelHead | null {
  const v = value as PixelHead | null;
  if (!v || v.v !== 1 || !Array.isArray(v.palette) || !Array.isArray(v.rows) || v.rows.length !== SPRITE_SIZE) return null;
  if (!v.rows.every((r) => typeof r === "string" && r.length === SPRITE_SIZE && /^[.o0-9]+$/.test(r))) return null;
  if (!v.palette.every((c) => typeof c === "string" && /^#[0-9A-F]{6}$/i.test(c))) return null;
  return v;
}
