import type { Mask } from "../../snap/vision";

/**
 * Colors from a photo (11.12 PS.3): the cut-out pet's three main colors become the coat of its preset sprite (the
 * shape comes from the breed, the size from the weight). Saved in `pets.profile.pixel_colors`. Web only (canvas).
 *
 * `base` is the pet's main color, `shade` the darker one (ears, outline), `light` the lighter one (muzzle).
 */
export type PixelColors = { v: 1; base: string; shade: string; light: string };

type Rgb = [number, number, number];

/** How finely the cut-out is sampled: enough cells for the main colors, few enough to be quick. */
const GRID = 24;

export function photoColors(frame: HTMLCanvasElement, mask: Mask): PixelColors {
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
  if (x1 < 0) throw new Error("We couldn't find a pet there. Try another photo.");

  const pixels = frame.getContext("2d")!.getImageData(0, 0, frame.width, frame.height).data;
  const fx = frame.width / mask.width;
  const fy = frame.height / mask.height;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;

  // One sample per grid cell that is on the pet.
  const samples: Rgb[] = [];
  for (let cy = 0; cy < GRID; cy++) {
    for (let cx = 0; cx < GRID; cx++) {
      const mx = x0 + Math.min(w - 1, Math.floor(((cx + 0.5) * w) / GRID));
      const my = y0 + Math.min(h - 1, Math.floor(((cy + 0.5) * h) / GRID));
      if (mask.data[my * mask.width + mx] <= 0.5) continue;
      const i = (Math.min(frame.height - 1, Math.floor((my + 0.5) * fy)) * frame.width + Math.min(frame.width - 1, Math.floor((mx + 0.5) * fx))) * 4;
      samples.push([pixels[i], pixels[i + 1], pixels[i + 2]]);
    }
  }

  // The most common color is the coat; of the other common ones, a darker one is the shade and a lighter one the light.
  const groups = histogram(samples);
  const base = groups[0].color;
  const darker = groups.find((g) => luma(g.color) < luma(base) - 24)?.color;
  const lighter = groups.find((g) => luma(g.color) > luma(base) + 24)?.color;
  return { v: 1, base: hex(base), shade: hex(darker ?? mix(base, 0.7)), light: hex(lighter ?? mix(base, 1.25)) };
}

/** Colors in buckets of 32 levels a channel, most common first; each bucket gives the average of its samples. */
function histogram(colors: Rgb[]): { color: Rgb; count: number }[] {
  const buckets = new Map<string, { sum: Rgb; count: number }>();
  for (const c of colors) {
    const key = c.map((v) => v >> 5).join(",");
    const b = buckets.get(key) ?? { sum: [0, 0, 0] as Rgb, count: 0 };
    b.sum = [b.sum[0] + c[0], b.sum[1] + c[1], b.sum[2] + c[2]];
    b.count += 1;
    buckets.set(key, b);
  }
  return [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .map((b) => ({ color: [b.sum[0] / b.count, b.sum[1] / b.count, b.sum[2] / b.count] as Rgb, count: b.count }));
}

const luma = (c: Rgb) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const mix = (c: Rgb, f: number): Rgb => [c[0] * f, c[1] * f, c[2] * f].map((v) => Math.max(0, Math.min(255, v))) as Rgb;
const hex = (c: Rgb) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
const rgb = (h: string): Rgb => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;

/** The sprite palette for saved photo colors: the outline is the shade made darker, eyes stay readable on dark fur. */
export function colorsPalette(colors: PixelColors) {
  const dark = luma(rgb(colors.base)) < 70;
  return {
    base: colors.base,
    shade: colors.shade,
    light: colors.light,
    outline: hex(mix(rgb(colors.shade), 0.45)),
    nose: dark ? "#8C8C94" : "#2B2B2B",
    eye: dark ? "#F2E6C2" : "#1A1A1A",
  };
}

/** Saved colors from `pets.profile.pixel_colors`, or null when they are missing or not this shape. */
export function asPixelColors(value: unknown): PixelColors | null {
  const v = value as PixelColors | null;
  if (!v || v.v !== 1) return null;
  const ok = (c: unknown) => typeof c === "string" && /^#[0-9A-F]{6}$/i.test(c);
  return ok(v.base) && ok(v.shade) && ok(v.light) ? { v: 1, base: v.base, shade: v.shade, light: v.light } : null;
}
