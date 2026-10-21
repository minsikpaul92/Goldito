import { apiDelete, apiPost } from "../../lib/api";
import { thumbUrl } from "../../lib/cloudinary";
import { getSupabase } from "../../lib/supabase";
import { UploadError } from "../../lib/uploadError";

export const MAX_PET_PHOTOS = 8;

export type PetPhoto = { id: string; publicId: string };

type SignResponse = {
  api_key: string;
  timestamp: number;
  signature: string;
  folder: string;
  upload_url: string;
  transformation: string;
};

/**
 * Sign, then upload straight to Cloudinary. Returns the public id; the photo joins the pet later (completePetPhoto),
 * because during sign-up the pet is not saved yet.
 */
export async function uploadPetPhotoFile(file: Blob): Promise<string> {
  let sign: SignResponse;
  try {
    sign = await apiPost<SignResponse>("/api/pet-photos/sign", {});
  } catch (err) {
    throw new UploadError("sign", err instanceof Error ? err.message : "Could not get upload signature.");
  }

  const form = new FormData();
  form.append("file", file, "pet.jpg");
  form.append("api_key", sign.api_key);
  form.append("timestamp", String(sign.timestamp));
  form.append("signature", sign.signature);
  form.append("folder", sign.folder);
  form.append("transformation", sign.transformation);

  try {
    const response = await fetch(sign.upload_url, { method: "POST", body: form });
    const uploaded = (await response.json()) as { error?: { message?: string }; public_id?: string };
    if (!response.ok || !uploaded.public_id) throw new Error(uploaded.error?.message || "Cloudinary upload failed.");
    return uploaded.public_id;
  } catch (err) {
    throw new UploadError("upload", err instanceof Error ? err.message : "Cloudinary upload failed.");
  }
}

/** Adds an uploaded photo to the end of the pet's list. Sending the same photo again changes nothing. */
export async function completePetPhoto(petId: string, publicId: string): Promise<void> {
  try {
    await apiPost("/api/pet-photos/complete", { pet_id: petId, public_id: publicId });
  } catch (err) {
    throw new UploadError("complete", err instanceof Error ? err.message : "Could not save the photo.");
  }
}

/** A pet's photos, cover first (RLS: whoever can read the pet, 014v). */
export async function loadPetPhotos(petId: string): Promise<PetPhoto[]> {
  const { data, error } = await getSupabase()
    .from("pet_photos")
    .select("id, public_id")
    .eq("pet_id", petId)
    .order("position");
  if (error) throw new Error("Couldn't load the photos. Check your connection and try again.");
  return ((data ?? []) as { id: string; public_id: string }[]).map((row) => ({ id: row.id, publicId: row.public_id }));
}

/** The owner removes a saved photo: the backend deletes the file, then the row. */
export async function deletePetPhoto(id: string): Promise<void> {
  await apiDelete<{ deleted: boolean }>(`/api/pet-photos/${id}`);
}

export function petPhotoThumb(publicId: string, size = 160): string {
  return thumbUrl(publicId, size);
}
