import { Mask, TASKS_VISION, hooks, importUrl } from "./vision";

/**
 * Snap → Sticker cut-out (Phase 12.3a; 12.S2 spike): MediaPipe Magic Touch (v2 `.task`, Apache-2.0) finds the pet
 * under a tap, then the pet is drawn as a transparent PNG with a white border and a soft shadow. Web only.
 *
 * One cut takes ≈ 5 s on the CPU (the GPU path returns an empty mask), so it runs in a classic Web Worker and the
 * screen keeps moving. A *module* worker cannot load MediaPipe's WASM loader ("ModuleFactory not set"); a browser
 * without dynamic `import()` in a classic worker falls back to the main thread.
 */

const SEGMENTER_MODEL =
  "https://storage.googleapis.com/mediapipe-models/interactive_segmenter_v2/magic_touch/int8/latest/interactive_segmentation.task";
/** The sticker's long side (px), before the border. */
const STICKER_MAX_SIDE = 512;
/** White outline around the pet (px). */
const BORDER = 6;
/** Room for the outline and the shadow on every side (px). */
const PAD = 16;

// The worker's own source: built into a Blob, so the bundler never sees it.
const WORKER_SOURCE = `
const V = ${JSON.stringify(TASKS_VISION)};
const MODEL = ${JSON.stringify(SEGMENTER_MODEL)};
let ready = null;
self.onmessage = async (event) => {
  const { id, bitmap, x, y } = event.data;
  try {
    if (!ready) {
      ready = (async () => {
        const vision = await import(V + "/vision_bundle.mjs");
        const files = await vision.FilesetResolver.forVisionTasks(V + "/wasm");
        return vision.InteractiveSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate: "CPU" } });
      })();
      ready.catch(() => { ready = null; });
    }
    const segmenter = await ready;
    segmenter.setImage(bitmap);
    const mask = segmenter.segment([{ brushMode: 1, point: [{ x, y }], isCompleted: true }]);
    const data = mask.getAsFloat32Array().slice();
    const width = mask.width;
    const height = mask.height;
    if (mask.close) mask.close();
    bitmap.close();
    self.postMessage({ id, ok: true, width, height, data }, [data.buffer]);
  } catch (error) {
    self.postMessage({ id, ok: false, error: String((error && error.message) || error) });
  }
};
`;

type Reply = { id: number; ok: true; width: number; height: number; data: Float32Array } | { id: number; ok: false; error: string };

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const waiting = new Map<number, (reply: Reply) => void>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(URL.createObjectURL(new Blob([WORKER_SOURCE], { type: "text/javascript" })));
    worker.onmessage = (event: MessageEvent<Reply>) => {
      waiting.get(event.data.id)?.(event.data);
      waiting.delete(event.data.id);
    };
    worker.onerror = () => {
      workerBroken = true;
      for (const resolve of waiting.values()) resolve({ id: 0, ok: false, error: "worker" });
      waiting.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

async function inWorker(frame: HTMLCanvasElement, point: { x: number; y: number }): Promise<Mask> {
  const bitmap = await createImageBitmap(frame);
  const id = nextId++;
  const reply = await new Promise<Reply>((resolve) => {
    waiting.set(id, resolve);
    getWorker().postMessage({ id, bitmap, x: point.x, y: point.y }, [bitmap]);
  });
  if (!reply.ok) throw new Error(reply.error);
  return { width: reply.width, height: reply.height, data: reply.data };
}

type Segmenter = {
  setImage(image: HTMLCanvasElement): void;
  segment(strokes: unknown[]): { width: number; height: number; getAsFloat32Array(): Float32Array; close?: () => void };
};
let mainThread: Promise<Segmenter> | null = null;

async function onMainThread(frame: HTMLCanvasElement, point: { x: number; y: number }): Promise<Mask> {
  if (!mainThread) {
    mainThread = (async () => {
      const vision = await importUrl(`${TASKS_VISION}/vision_bundle.mjs`);
      const files = await vision.FilesetResolver.forVisionTasks(`${TASKS_VISION}/wasm`);
      return (await vision.InteractiveSegmenter.createFromOptions(files, {
        baseOptions: { modelAssetPath: SEGMENTER_MODEL, delegate: "CPU" },
      })) as Segmenter;
    })();
    mainThread.catch(() => {
      mainThread = null;
    });
  }
  const segmenter = await mainThread;
  segmenter.setImage(frame);
  const mask = segmenter.segment([{ brushMode: 1, point: [point], isCompleted: true }]);
  const out = { width: mask.width, height: mask.height, data: mask.getAsFloat32Array().slice() };
  mask.close?.();
  return out;
}

/** The pet under `point` (0–1 of the frame). */
export async function segmentAt(frame: HTMLCanvasElement, point: { x: number; y: number }): Promise<Mask> {
  const hook = hooks().segmentAt;
  if (hook) return hook(frame, point);
  if (!workerBroken && typeof Worker !== "undefined") {
    try {
      return await inWorker(frame, point);
    } catch (error) {
      // The worker itself failed (e.g. no dynamic import() in workers): same model on the main thread from now on.
      // A download or model error is the same on both, so it is shown, and the next tap tries the worker again.
      if ((error as Error).message !== "worker") throw error;
      workerBroken = true;
    }
  }
  return onMainThread(frame, point);
}

/** Share of the frame the mask covers — a cut-out of almost nothing or almost everything missed the pet. */
export function coverage(mask: Mask): number {
  let on = 0;
  for (let i = 0; i < mask.data.length; i++) if (mask.data[i] > 0.5) on++;
  return on / Math.max(1, mask.data.length);
}

export type Sticker = { blob: Blob; dataUrl: string; width: number; height: number };

/** The masked pet as a transparent PNG: cropped to the pet, long side ≤ 512 px, white outline, soft shadow. */
export async function makeSticker(frame: HTMLCanvasElement, mask: Mask): Promise<Sticker> {
  // Where the pet is, in mask pixels.
  let x0 = mask.width;
  let y0 = mask.height;
  let x1 = -1;
  let y1 = -1;
  const silhouette = document.createElement("canvas");
  silhouette.width = mask.width;
  silhouette.height = mask.height;
  const sg = silhouette.getContext("2d")!;
  const pixels = sg.createImageData(mask.width, mask.height);
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      const v = mask.data[y * mask.width + x];
      if (v <= 0.5) continue;
      const i = (y * mask.width + x) * 4;
      pixels.data[i] = 255;
      pixels.data[i + 1] = 255;
      pixels.data[i + 2] = 255;
      // A soft edge instead of jagged pixels.
      pixels.data[i + 3] = Math.round(255 * Math.min(1, (v - 0.5) * 4));
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error("We couldn't cut out a pet there. Tap your pet.");
  sg.putImageData(pixels, 0, 0);

  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;
  const scale = Math.min(1, STICKER_MAX_SIDE / Math.max(bw * (frame.width / mask.width), bh * (frame.height / mask.height)));
  const w = Math.max(1, Math.round(bw * (frame.width / mask.width) * scale));
  const h = Math.max(1, Math.round(bh * (frame.height / mask.height) * scale));
  const size = (c: HTMLCanvasElement) => {
    c.width = w + PAD * 2;
    c.height = h + PAD * 2;
    return c.getContext("2d")!;
  };

  // The pet: the photo, kept only where the mask is.
  const pet = document.createElement("canvas");
  const pg = size(pet);
  const fx = frame.width / mask.width;
  const fy = frame.height / mask.height;
  pg.drawImage(frame, x0 * fx, y0 * fy, bw * fx, bh * fy, PAD, PAD, w, h);
  pg.globalCompositeOperation = "destination-in";
  pg.drawImage(silhouette, x0, y0, bw, bh, PAD, PAD, w, h);

  // The outline: the silhouette stamped around a circle, in white.
  const outline = document.createElement("canvas");
  const og = size(outline);
  for (let step = 0; step < 16; step++) {
    const a = (step / 16) * Math.PI * 2;
    og.drawImage(silhouette, x0, y0, bw, bh, PAD + Math.cos(a) * BORDER, PAD + Math.sin(a) * BORDER, w, h);
  }

  const out = document.createElement("canvas");
  const g = size(out);
  g.shadowColor = "rgba(0, 0, 0, 0.25)";
  g.shadowBlur = 8;
  g.shadowOffsetY = 2;
  g.drawImage(outline, 0, 0);
  g.shadowColor = "transparent";
  g.drawImage(pet, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't make the sticker."))), "image/png"),
  );
  return { blob, dataUrl: out.toDataURL("image/png"), width: out.width, height: out.height };
}
