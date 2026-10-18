import { apiDelete, apiPost } from "../../lib/api";
import { thumbUrl } from "../../lib/cloudinary";
import { getSupabase } from "../../lib/supabase";
import { UploadError } from "../../lib/uploadError";

export const MAX_PROFILE_PHOTOS = 8;

export type ProfilePhoto = { id: string; publicId: string };

type PhotoRow = { id: string; public_id: string };

type SignResponse = {
  api_key: string;
  timestamp: number;
  signature: string;
  folder: string;
  upload_url: string;
  transformation: string;
};

function fail(action: string): never {
  throw new Error(`Couldn't ${action}. Check your connection and try again.`);
}

/** A person's photos, cover first (RLS decides who may read whose: 014g). */
export async function loadProfilePhotos(profileId: string): Promise<ProfilePhoto[]> {
  const { data, error } = await getSupabase()
    .from("profile_photos")
    .select("id, public_id")
    .eq("profile_id", profileId)
    .order("position");
  if (error) fail("load the photos");
  return ((data ?? []) as PhotoRow[]).map((row) => ({ id: row.id, publicId: row.public_id }));
}

/** The round thumbnail of a photo (Cloudinary, square fill; the circle is drawn by the view). */
export function photoThumb(photo: ProfilePhoto, size = 160): string {
  return thumbUrl(photo.publicId, size);
}

/** Sign → Cloudinary direct upload → register at the end of the list. The file is already cropped. */
export async function uploadProfilePhoto(file: Blob): Promise<ProfilePhoto> {
  let sign: SignResponse;
  try {
    sign = await apiPost<SignResponse>("/api/profile-photos/sign", {});
  } catch (err) {
    throw new UploadError("sign", err instanceof Error ? err.message : "Could not get upload signature.");
  }

  const form = new FormData();
  form.append("file", file, "profile.jpg");
  form.append("api_key", sign.api_key);
  form.append("timestamp", String(sign.timestamp));
  form.append("signature", sign.signature);
  form.append("folder", sign.folder);
  form.append("transformation", sign.transformation);

  let publicId: string;
  try {
    const response = await fetch(sign.upload_url, { method: "POST", body: form });
    const uploaded = (await response.json()) as { error?: { message?: string }; public_id?: string };
    if (!response.ok || !uploaded.public_id) throw new Error(uploaded.error?.message || "Cloudinary upload failed.");
    publicId = uploaded.public_id;
  } catch (err) {
    throw new UploadError("upload", err instanceof Error ? err.message : "Cloudinary upload failed.");
  }

  try {
    const done = await apiPost<{ id: string; public_id: string }>("/api/profile-photos/complete", { public_id: publicId });
    return { id: done.id, publicId: done.public_id };
  } catch (err) {
    throw new UploadError("complete", err instanceof Error ? err.message : "Could not save the photo.");
  }
}

/** Own photos only. The backend deletes the file and closes the gap. */
export async function deleteProfilePhoto(id: string): Promise<void> {
  await apiDelete<{ deleted: boolean }>(`/api/profile-photos/${id}`);
}

/** Save a new order: `ids` is every one of the person's photos, first = cover. */
export async function reorderProfilePhotos(ids: string[]): Promise<void> {
  const { error } = await getSupabase().rpc("reorder_profile_photos", { p_ids: ids });
  if (error) fail("save the new order");
}
