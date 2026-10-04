/**
 * Media normalize policy (phase-04.md): shrink every file on the client before it is signed
 * and uploaded. Cloudinary Free has 25 credits/mo, a 10 MB image cap and a 100 MB video cap.
 *
 * Photos: ALWAYS resize to a ~2000 px long edge (JPEG ~0.8), then keep shrinking until the
 * file is under 10 MB. Never upscale.
 * Videos: ≤ 30 s. Longer clips throw `VideoTooLongError` (4.7 opens the trim sheet).
 *
 * Resizing and duration reading need a browser (canvas / <video>). On native, files pass
 * through with only the hard size check until the native pickers land in 4.7.
 */
import { UploadError, VideoTooLongError } from "./uploadError";

export const IMAGE_LONG_EDGE = 2000;
export const IMAGE_QUALITY = 0.8;
/** Cloudinary Free hard limit — the incoming transformation cannot bypass it. */
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export const VIDEO_MAX_SECONDS = 30;
/** Cloudinary Free hard limit. 4.7 compresses toward a softer ~50 MB goal before upload. */
export const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
/** Container rounding: a "30 s" clip often reports 30.0x. Incoming `du_30` caps it anyway. */
const VIDEO_DURATION_SLACK_S = 0.5;

/** Extra shrink passes if the first export is still ≥ 10 MB. */
const IMAGE_MAX_PASSES = 5;
const IMAGE_MIN_QUALITY = 0.5;

const mb = (bytes: number) => Math.round(bytes / (1024 * 1024));

const hasBrowserMedia = () =>
  typeof document !== "undefined" && typeof URL !== "undefined" && "createObjectURL" in URL;

/** Scale that fits `width × height` inside `longEdge` on its longest side; never above 1. */
export function fitScale(width: number, height: number, longEdge: number): number {
  const longest = Math.max(width, height);
  if (longest <= 0) return 1;
  return Math.min(1, longEdge / longest);
}

type Decoded = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

async function decodeImage(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    // Applies the EXIF orientation so a portrait phone shot is not saved sideways.
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => bitmap.close(),
    };
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not read this photo."));
    img.src = url;
  });
  return {
    source: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    release: () => URL.revokeObjectURL(url),
  };
}

function renderJpeg(decoded: Decoded, longEdge: number, quality: number): Promise<Blob> {
  const scale = fitScale(decoded.width, decoded.height, longEdge);
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Could not process this photo."));
  // JPEG has no alpha: paint white first so transparent PNGs do not turn black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(decoded.source, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not process this photo."))),
      "image/jpeg",
      quality,
    );
  });
}

function asJpegFile(blob: Blob, originalName: string): File | Blob {
  if (typeof File === "undefined") return blob;
  const base = originalName.replace(/\.[^./\\]+$/, "") || "photo";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}

/**
 * Always re-encode: long edge ≤ 2000 px, JPEG ~0.8; shrink further until < 10 MB.
 * Every pass renders from the decoded original, so quality never degrades twice.
 */
export async function normalizeImage(file: Blob): Promise<File | Blob> {
  if (!hasBrowserMedia()) {
    if (file.size >= IMAGE_MAX_BYTES) {
      throw new UploadError("prepare", `This photo is too big (max ${mb(IMAGE_MAX_BYTES)} MB).`);
    }
    return file;
  }

  let decoded: Decoded;
  try {
    decoded = await decodeImage(file);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not read this photo.";
    throw new UploadError("prepare", message);
  }

  try {
    const name = "name" in file && typeof file.name === "string" ? file.name : "photo.jpg";
    let longEdge = IMAGE_LONG_EDGE;
    let quality = IMAGE_QUALITY;
    for (let pass = 0; pass < IMAGE_MAX_PASSES; pass += 1) {
      const out = await renderJpeg(decoded, longEdge, quality);
      if (out.size < IMAGE_MAX_BYTES) {
        // A small JPEG that needed no resize can come out bigger — keep the original then.
        const resized = fitScale(decoded.width, decoded.height, longEdge) < 1;
        if (!resized && file.type === "image/jpeg" && out.size >= file.size) return file;
        return asJpegFile(out, name);
      }
      quality = Math.max(IMAGE_MIN_QUALITY, quality - 0.1);
      longEdge = Math.round(longEdge * 0.8);
    }
    throw new UploadError("prepare", `This photo is too big (max ${mb(IMAGE_MAX_BYTES)} MB).`);
  } catch (err) {
    if (err instanceof UploadError) throw err;
    const message = err instanceof Error ? err.message : "Could not process this photo.";
    throw new UploadError("prepare", message);
  } finally {
    decoded.release();
  }
}

/** Duration in seconds from the file's metadata, or `null` when it cannot be read. */
export function readVideoDuration(file: Blob): Promise<number | null> {
  if (!hasBrowserMedia()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    const done = (value: number | null) => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.preload = "metadata";
    video.onloadedmetadata = () =>
      done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

/**
 * Check a video against the policy. Over 30 s → `VideoTooLongError` (the trim sheet in 4.7
 * catches it and re-submits the trimmed clip). Client re-encode (≤ 720p, bitrate cap) plugs
 * in here in 4.7, before the size check.
 */
export async function prepareVideo(file: Blob): Promise<Blob> {
  const duration = await readVideoDuration(file);
  if (duration !== null && duration > VIDEO_MAX_SECONDS + VIDEO_DURATION_SLACK_S) {
    throw new VideoTooLongError(duration);
  }
  if (file.size >= VIDEO_MAX_BYTES) {
    throw new UploadError("prepare", `This video is too big (max ${mb(VIDEO_MAX_BYTES)} MB).`);
  }
  return file;
}

export function prepareForUpload(
  file: Blob,
  resourceType: "image" | "video",
): Promise<File | Blob> {
  return resourceType === "video" ? prepareVideo(file) : normalizeImage(file);
}
