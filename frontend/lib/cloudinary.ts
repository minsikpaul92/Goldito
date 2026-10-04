import { apiPost } from "./api";
import { prepareForUpload, type VideoTrim } from "./mediaNormalize";
import { UploadError, type UploadStep } from "./uploadError";

export { UploadError, VideoTooLongError, type UploadStep } from "./uploadError";
export type { VideoTrim } from "./mediaNormalize";

export type MediaPurpose = "feed" | "task_proof" | "report" | "handoff" | "safety_label";
export type ResourceType = "image" | "video";

export type UploadMediaInput = {
  petId: string;
  purpose: MediaPurpose;
  file: File | Blob;
  /** Required when purpose is handoff. */
  bookingId?: string;
  resourceType?: ResourceType;
  /** Video only: keep this part (≤ 30 s). Cloudinary cuts it during upload. */
  trim?: VideoTrim;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export type UploadMediaResult = {
  mediaId: string;
  publicId: string;
  secureUrl: string;
  thumbUrl: string;
};

type SignResponse = {
  cloud_name: string;
  api_key: string;
  timestamp: number;
  signature: string;
  folder: string;
  upload_url: string;
  /** Incoming transformation — signed, so it must be sent back unchanged. */
  transformation: string;
};

type CompleteResponse = {
  media_id: string;
  public_id: string;
  secure_url: string;
  thumb_url: string;
};

function guessResourceType(file: File | Blob, explicit?: ResourceType): ResourceType {
  if (explicit) return explicit;
  const type = "type" in file ? file.type : "";
  if (type.startsWith("video/")) return "video";
  return "image";
}

/**
 * Normalize (resize photo / check video) → sign → Cloudinary direct upload → complete (media row).
 * Callers show Toast + Retry on UploadError. A video over 30 s throws VideoTooLongError
 * (a subclass) so the trim sheet in 4.7 can offer a window instead of a dead end.
 */
export async function uploadMedia(input: UploadMediaInput): Promise<UploadMediaResult> {
  const resourceType = guessResourceType(input.file, input.resourceType);
  const file = await prepareForUpload(input.file, resourceType, input.trim);

  let sign: SignResponse;
  try {
    sign = await apiPost<SignResponse>("/api/media/sign", {
      pet_id: input.petId,
      resource_type: resourceType,
      purpose: input.purpose,
      booking_id: input.bookingId ?? null,
      ...(input.trim && resourceType === "video"
        ? {
            trim_start: round2(input.trim.start),
            // Round down so 29.999 never becomes 30.001 (the server rejects > 30).
            trim_duration: Math.floor(input.trim.duration * 100) / 100,
          }
        : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not get upload signature.";
    throw new UploadError("sign", message);
  }

  const form = new FormData();
  const filename =
    "name" in file && typeof file.name === "string" ? file.name : "upload.jpg";
  form.append("file", file, filename);
  form.append("api_key", sign.api_key);
  form.append("timestamp", String(sign.timestamp));
  form.append("signature", sign.signature);
  form.append("folder", sign.folder);
  form.append("transformation", sign.transformation);

  let publicId: string;
  let width: number | undefined;
  let height: number | undefined;
  let duration: number | undefined;
  try {
    const uploadRes = await fetch(sign.upload_url, { method: "POST", body: form });
    const uploaded = (await uploadRes.json()) as {
      error?: { message?: string };
      public_id?: string;
      width?: number;
      height?: number;
      duration?: number;
    };
    if (!uploadRes.ok || !uploaded.public_id) {
      throw new Error(uploaded.error?.message || "Cloudinary upload failed.");
    }
    publicId = uploaded.public_id;
    width = uploaded.width;
    height = uploaded.height;
    duration = uploaded.duration;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cloudinary upload failed.";
    throw new UploadError("upload", message);
  }

  try {
    const done = await apiPost<CompleteResponse>("/api/media/complete", {
      pet_id: input.petId,
      public_id: publicId,
      resource_type: resourceType,
      purpose: input.purpose,
      booking_id: input.bookingId ?? null,
      width: width ?? null,
      height: height ?? null,
      duration: duration ?? null,
    });
    return {
      mediaId: done.media_id,
      publicId: done.public_id,
      secureUrl: done.secure_url,
      thumbUrl: done.thumb_url,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save media.";
    throw new UploadError("complete", message);
  }
}

/** Square crop for Instagram-style album cells. */
export function thumbUrl(publicId: string, w = 400): string {
  const cloud = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloud) return "";
  return `https://res.cloudinary.com/${cloud}/image/upload/f_auto,q_auto,c_fill,g_auto,w_${w},h_${w}/${publicId}`;
}

/** Full photo for the expand sheet — fits inside the frame, no crop. */
export function deliveryUrl(publicId: string, w = 1200): string {
  const cloud = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloud) return "";
  return `https://res.cloudinary.com/${cloud}/image/upload/f_auto,q_auto,c_limit,w_${w}/${publicId}`;
}

export function videoPosterUrl(publicId: string, w = 400): string {
  const cloud = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloud) return "";
  return `https://res.cloudinary.com/${cloud}/video/upload/so_0,f_jpg,q_auto:good,c_fill,g_auto,w_${w},h_${w}/${publicId}.jpg`;
}

/**
 * Stream a video. Cap long edge at `maxHeight` (default 1080) so fullscreen looks sharp
 * when the source is HD; q_auto:good avoids muddy q_auto on small cells.
 */
export function videoUrl(publicId: string, maxHeight = 1080): string {
  const cloud = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloud) return "";
  return `https://res.cloudinary.com/${cloud}/video/upload/f_auto,q_auto:good,c_limit,h_${maxHeight}/${publicId}`;
}
