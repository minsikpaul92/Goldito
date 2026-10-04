import { apiPost } from "./api";

export type MediaPurpose = "feed" | "task_proof" | "report" | "handoff" | "safety_label";
export type ResourceType = "image" | "video";

export type UploadMediaInput = {
  petId: string;
  purpose: MediaPurpose;
  file: File | Blob;
  /** Required when purpose is handoff. */
  bookingId?: string;
  resourceType?: ResourceType;
};

export type UploadMediaResult = {
  mediaId: string;
  publicId: string;
  secureUrl: string;
  thumbUrl: string;
};

export type UploadStep = "sign" | "upload" | "complete";

export class UploadError extends Error {
  readonly step: UploadStep;

  constructor(step: UploadStep, message: string) {
    super(message);
    this.name = "UploadError";
    this.step = step;
  }
}

type SignResponse = {
  cloud_name: string;
  api_key: string;
  timestamp: number;
  signature: string;
  folder: string;
  upload_url: string;
};

type CompleteResponse = {
  media_id: string;
  public_id: string;
  secure_url: string;
  thumb_url: string;
};

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 50 * 1024 * 1024;

function guessResourceType(file: File | Blob, explicit?: ResourceType): ResourceType {
  if (explicit) return explicit;
  const type = "type" in file ? file.type : "";
  if (type.startsWith("video/")) return "video";
  return "image";
}

function assertSize(file: File | Blob, resourceType: ResourceType): void {
  const max = resourceType === "video" ? VIDEO_MAX_BYTES : IMAGE_MAX_BYTES;
  if (file.size > max) {
    const label = resourceType === "video" ? "50MB" : "10MB";
    throw new UploadError("upload", `Please pick a smaller file (max ${label}).`);
  }
}

/**
 * Sign → Cloudinary direct upload → complete (media row).
 * Callers show Toast + Retry on UploadError.
 */
export async function uploadMedia(input: UploadMediaInput): Promise<UploadMediaResult> {
  const resourceType = guessResourceType(input.file, input.resourceType);
  assertSize(input.file, resourceType);

  let sign: SignResponse;
  try {
    sign = await apiPost<SignResponse>("/api/media/sign", {
      pet_id: input.petId,
      resource_type: resourceType,
      purpose: input.purpose,
      booking_id: input.bookingId ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not get upload signature.";
    throw new UploadError("sign", message);
  }

  const form = new FormData();
  const filename =
    "name" in input.file && typeof input.file.name === "string" ? input.file.name : "upload.jpg";
  form.append("file", input.file, filename);
  form.append("api_key", sign.api_key);
  form.append("timestamp", String(sign.timestamp));
  form.append("signature", sign.signature);
  form.append("folder", sign.folder);

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

export function thumbUrl(publicId: string, w = 400): string {
  const cloud = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloud) return "";
  return `https://res.cloudinary.com/${cloud}/image/upload/f_auto,q_auto,c_fill,w_${w},h_${w}/${publicId}`;
}

export function videoPosterUrl(publicId: string, w = 400): string {
  const cloud = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloud) return "";
  return `https://res.cloudinary.com/${cloud}/video/upload/so_0,f_jpg,w_${w}/${publicId}.jpg`;
}

export function videoUrl(publicId: string): string {
  const cloud = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME?.trim();
  if (!cloud) return "";
  return `https://res.cloudinary.com/${cloud}/video/upload/q_auto/${publicId}`;
}
