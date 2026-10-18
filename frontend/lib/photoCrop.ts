/**
 * Round profile-photo crop (#135): the geometry is plain math so it can be tested, and the export draws the visible
 * square onto a canvas. The photo is shown "cover" inside a square frame (`size` px) under a round mask; the person
 * drags it and zooms. `zoom` is 1 (the photo just covers the frame) and up; `ox` / `oy` are how far the photo has been
 * dragged from centered, in frame px.
 */

export const CROP_MIN_ZOOM = 1;
export const CROP_MAX_ZOOM = 4;
/** The square that is uploaded; Cloudinary shows it round or small. */
export const CROP_EXPORT_PX = 800;

export type CropView = { zoom: number; ox: number; oy: number };

/** Scale at which the photo just covers the frame. */
export function coverScale(width: number, height: number, size: number): number {
  return Math.max(size / width, size / height);
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Keep the photo covering the frame: it cannot be dragged past its own edge. */
export function clampView(width: number, height: number, size: number, view: CropView): CropView {
  const zoom = clamp(view.zoom, CROP_MIN_ZOOM, CROP_MAX_ZOOM);
  const scale = coverScale(width, height, size) * zoom;
  const maxX = Math.max(0, (width * scale - size) / 2);
  const maxY = Math.max(0, (height * scale - size) / 2);
  return { zoom, ox: clamp(view.ox, -maxX, maxX), oy: clamp(view.oy, -maxY, maxY) };
}

/** The part of the photo (in its own pixels) that is inside the frame. */
export function cropRect(width: number, height: number, size: number, view: CropView) {
  const { zoom, ox, oy } = clampView(width, height, size, view);
  const scale = coverScale(width, height, size) * zoom;
  const side = size / scale;
  return { sx: width / 2 - ox / scale - side / 2, sy: height / 2 - oy / scale - side / 2, side };
}

/** Draw the visible square onto a canvas and return it as a JPEG. Web only (canvas); throws elsewhere. */
export async function cropToBlob(file: Blob, size: number, view: CropView): Promise<Blob> {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    throw new Error("Cropping needs a browser.");
  }
  // from-image applies the EXIF orientation, like the <img> the person dragged.
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const { sx, sy, side } = cropRect(bitmap.width, bitmap.height, size, view);
    const canvas = document.createElement("canvas");
    canvas.width = CROP_EXPORT_PX;
    canvas.height = CROP_EXPORT_PX;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Cropping needs a browser.");
    context.drawImage(bitmap, sx, sy, side, side, 0, 0, CROP_EXPORT_PX, CROP_EXPORT_PX);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't crop the photo."))), "image/jpeg", 0.85),
    );
  } finally {
    bitmap.close();
  }
}
