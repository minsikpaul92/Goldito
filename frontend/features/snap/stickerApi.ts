import { getSupabase } from "../../lib/supabase";

/** Snap → Sticker (Phase 12.3, D61): a pet's saved stickers (`pet_stickers`, 013b) — both people on the pet see them. */
export type PetSticker = { id: string; petId: string; createdBy: string; publicId: string; createdAt: string };

type Row = {
  id: string;
  pet_id: string;
  created_by: string;
  created_at: string;
  media: { cloudinary_public_id: string } | { cloudinary_public_id: string }[] | null;
};

export async function listStickers(petId: string): Promise<PetSticker[]> {
  const { data, error } = await getSupabase()
    .from("pet_stickers")
    .select("id, pet_id, created_by, created_at, media (cloudinary_public_id)")
    .eq("pet_id", petId)
    .order("created_at", { ascending: false });
  if (error) throw new Error("Couldn't load the stickers.");
  return ((data ?? []) as Row[]).flatMap((row) => {
    const media = Array.isArray(row.media) ? row.media[0] : row.media;
    if (!media) return [];
    return [{ id: row.id, petId: row.pet_id, createdBy: row.created_by, publicId: media.cloudinary_public_id, createdAt: row.created_at }];
  });
}

/** After the PNG upload (`purpose: "sticker"`): the row that puts it in the pet's sticker box. */
export async function saveSticker(petId: string, mediaId: string, me: string): Promise<void> {
  const { error } = await getSupabase().from("pet_stickers").insert({ pet_id: petId, media_id: mediaId, created_by: me });
  if (error) throw new Error("Couldn't save the sticker. Try again.");
}

/** Only the maker's own sticker (RLS). The uploaded file stays; the sticker leaves the box. */
export async function deleteSticker(id: string): Promise<void> {
  const { error } = await getSupabase().from("pet_stickers").delete().eq("id", id);
  if (error) throw new Error("Couldn't delete the sticker. Try again.");
}
