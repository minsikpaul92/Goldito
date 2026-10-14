import type { VideoTrim } from "../../lib/mediaNormalize";

/**
 * Snap's in-browser vision (Phase 12.2b; 12.S2 spike): frames from a photo or a short clip, pet boxes from MediaPipe's
 * ObjectDetector, and JPEG crops of each pet for `POST /api/ai/pet-mood`. Web only.
 *
 * MediaPipe is loaded at run time from the CDN at an exact version (`tasks-vision@1.0.1`, 2026-07-31) instead of being
 * bundled — its WASM has to come from a URL anyway. EfficientDet-Lite0 int8 runs on the CPU: on the GPU it found no pet
 * in any of our ten photos (12.S2), on the CPU it found all ten in ≈ 60 ms each.
 */

const TASKS_VISION = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1";
const DETECTOR_MODEL =
  "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/latest/efficientdet_lite0.tflite";
const SCORE_MIN = 0.3;
/** Frames are drawn at most this big: enough for boxes and crops, small enough to keep the detector fast. */
const FRAME_MAX_SIDE = 1024;
/** Crops sent to the server: long side ≤ 512 px (the API takes ≤ 300 KB each). */
const CROP_MAX_SIDE = 512;
/** Each box grows by this share on every side, so ears and tail stay in the crop. */
const CROP_MARGIN = 0.1;
/** Where in a clip the four frames are taken. */
const VIDEO_POINTS = [0.2, 0.4, 0.6, 0.8];

/** A pet in a frame, as fractions of the frame's width and height. */
export type PetBox = { x: number; y: number; w: number; h: number; label: "dog" | "cat"; score: number };

type Detection = {
  boundingBox?: { originX: number; originY: number; width: number; height: number };
  categories: { categoryName: string; score: number }[];
};
type Detector = { detect(image: HTMLCanvasElement): { detections: Detection[] } };

/**
 * Test hooks (e2e): fixed boxes and frames, so the specs never download MediaPipe or decode video.
 * Set `window.__goldiVision` before the app loads.
 */
type Hooks = {
  detectPets?: (frame: HTMLCanvasElement) => PetBox[] | Promise<PetBox[]>;
  loadFrames?: (file: File) => HTMLCanvasElement[] | Promise<HTMLCanvasElement[]>;
};
const hooks = (): Hooks => (globalThis as { __goldiVision?: Hooks }).__goldiVision ?? {};

// A real dynamic import of a URL at run time; written this way so the bundler leaves it alone.
const importUrl = new Function("url", "return import(url)") as (url: string) => Promise<Record<string, any>>;

let detector: Promise<Detector> | null = null;

function loadDetector(): Promise<Detector> {
  if (!detector) {
    detector = (async () => {
      const vision = await importUrl(`${TASKS_VISION}/vision_bundle.mjs`);
      const fileset = await vision.FilesetResolver.forVisionTasks(`${TASKS_VISION}/wasm`);
      return (await vision.ObjectDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: DETECTOR_MODEL, delegate: "CPU" },
        runningMode: "IMAGE",
        scoreThreshold: SCORE_MIN,
        categoryAllowlist: ["dog", "cat"],
        maxResults: 4,
      })) as Detector;
    })();
    detector.catch(() => {
      detector = null; // a failed download can be tried again
    });
  }
  return detector;
}

/** Pets in the frame, left to right — the order the server pairs them across frames. */
export async function detectPets(frame: HTMLCanvasElement): Promise<PetBox[]> {
  const hook = hooks().detectPets;
  const boxes = hook ? await hook(frame) : fromDetections((await loadDetector()).detect(frame).detections, frame);
  return [...boxes].sort((a, b) => a.x - b.x);
}

function fromDetections(detections: Detection[], frame: HTMLCanvasElement): PetBox[] {
  const out: PetBox[] = [];
  for (const d of detections) {
    const best = d.categories[0];
    const b = d.boundingBox;
    if (!b || !best || (best.categoryName !== "dog" && best.categoryName !== "cat")) continue;
    const x = clamp(b.originX / frame.width);
    const y = clamp(b.originY / frame.height);
    out.push({
      x,
      y,
      w: clamp(b.width / frame.width, 0.001, 1 - x),
      h: clamp(b.height / frame.height, 0.001, 1 - y),
      label: best.categoryName as PetBox["label"],
      score: best.score,
    });
  }
  return out;
}

/** One frame for a photo; four for a clip (inside the trimmed part when the picker trimmed it). */
export async function loadFrames(file: File, trim?: VideoTrim): Promise<HTMLCanvasElement[]> {
  const hook = hooks().loadFrames;
  if (hook) return hook(file);
  const url = URL.createObjectURL(file);
  try {
    return file.type.startsWith("video/") ? await videoFrames(url, trim) : [await imageFrame(url)];
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function imageFrame(url: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return draw(img, img.naturalWidth, img.naturalHeight);
}

async function videoFrames(url: string, trim?: VideoTrim): Promise<HTMLCanvasElement[]> {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  await once(video, "loadeddata");
  const start = trim?.start ?? 0;
  const length = trim?.duration ?? video.duration;
  const frames: HTMLCanvasElement[] = [];
  for (const point of VIDEO_POINTS) {
    video.currentTime = Math.min(video.duration - 0.05, start + point * length);
    await once(video, "seeked");
    frames.push(draw(video, video.videoWidth, video.videoHeight));
  }
  return frames;
}

function once(target: HTMLMediaElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      target.removeEventListener(event, done);
      target.removeEventListener("error", fail);
      resolve();
    };
    const fail = () => {
      target.removeEventListener(event, done);
      reject(new Error("Couldn't read that clip. Try another one."));
    };
    target.addEventListener(event, done);
    target.addEventListener("error", fail);
  });
}

function draw(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const scale = Math.min(1, FRAME_MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** The pet cut out with a margin, as a JPEG data URL (long side ≤ 512 px). */
export function cropPet(frame: HTMLCanvasElement, box: PetBox): string {
  const x0 = clamp(box.x - box.w * CROP_MARGIN) * frame.width;
  const y0 = clamp(box.y - box.h * CROP_MARGIN) * frame.height;
  const x1 = clamp(box.x + box.w * (1 + CROP_MARGIN)) * frame.width;
  const y1 = clamp(box.y + box.h * (1 + CROP_MARGIN)) * frame.height;
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const scale = Math.min(1, CROP_MAX_SIDE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  canvas.getContext("2d")!.drawImage(frame, x0, y0, w, h, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}
